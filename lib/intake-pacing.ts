/* Client-side pacing model for anonymous wallet intake.
 *
 * Mirrors the server economics so the console never fires a request
 * it can predict will be rejected:
 * - The public limiter is a FIXED 60s window (bucket keyed by floor(now/60s)),
 *   20 weighted units per window per IP for anonymous callers.
 * - Starting an intake costs the FULL anonymous window (20 units), so
 *   anonymous indexing runs at most one new wallet per minute.
 * - A rejected request still burns its units server-side, which is exactly
 *   why doomed requests must never be fired: one bad attempt poisons the
 *   rest of its window.
 * - State probes are free: already-indexed and already-indexing answers
 *   consume nothing and carry no rate headers.
 * - The batch pre-check charges one unit per deduped row (the server counts
 *   rows the same way after an identical trim and dedupe), so a full 10-row
 *   batch is half a window and always fits a fresh one.
 *
 * This module is framework-free and client-safe. Components inject timers
 * and the clock, which is also what makes the scheduler testable offline
 * (scripts/test-intake-pacing.mjs).
 *
 * Server constants mirrored here, verbatim sources:
 * - app/api/v1/intake/[wallet]/route.ts (INTAKE_RATE_UNITS_ANONYMOUS = 20)
 * - lib/api-plans.ts (anonymous 20 units/min/IP)
 * If either side changes, change this file in the same commit. */

export const RATE_WINDOW_MS = 60_000;
export const ANONYMOUS_WINDOW_UNITS = 20;
export const ANONYMOUS_INTAKE_UNITS = 20;
export const DECISION_READ_UNITS = 1;
/* Attempts aim slightly past the window boundary so a small clock skew
   between browser and server cannot land us in the old window. */
export const WINDOW_EDGE_MARGIN_MS = 1_500;
/* Retries honor the server's Retry-After, plus this margin. */
export const RETRY_MARGIN_MS = 1_000;
/* A queue item that keeps getting window-limited (foreign tabs spending the
   same IP budget) settles to a manual state after this many retries. */
export const MAX_RATE_RETRIES = 2;

export function windowStartMs(now: number): number {
  return Math.floor(now / RATE_WINDOW_MS) * RATE_WINDOW_MS;
}

export function nextWindowStartMs(now: number): number {
  return windowStartMs(now) + RATE_WINDOW_MS;
}

/* Tracks what this tab knows it has spent in the current fixed window.
 * Two writers, both safe together:
 * - recordSpend(units): additive, called when we know a request consumed.
 * - syncRemaining(limit, remaining): absolute, from server X-RateLimit
 *   headers; takes the max so it corrects us upward (foreign spend on the
 *   same IP) but never erases spend we recorded ourselves. */
export class RateBudgetLedger {
  private window = 0;
  private spent = 0;
  /* Units reserved by in-flight requests: taken synchronously before
     dispatch, dropped when the response lands (or its timeout fires).
     Deliberately not window-keyed — an in-flight request will land in SOME
     window, and holding it against the current one is the conservative
     read. */
  private pending = 0;
  /* No TS parameter property here: scripts run this file through Node's
     strip-only TypeScript mode, which rejects that syntax. */
  private readonly limit: number;

  constructor(limit: number = ANONYMOUS_WINDOW_UNITS) {
    this.limit = limit;
  }

  private roll(now: number) {
    const start = windowStartMs(now);
    if (start !== this.window) {
      this.window = start;
      this.spent = 0;
    }
  }

  recordSpend(units: number, now: number = Date.now()) {
    this.roll(now);
    this.spent += units;
  }

  syncRemaining(limit: number | null, remaining: number | null, now: number = Date.now()) {
    if (limit === null || remaining === null || !Number.isFinite(limit) || !Number.isFinite(remaining)) return;
    this.roll(now);
    this.spent = Math.max(this.spent, Math.max(0, limit - remaining));
  }

  /* Reservations close the check-then-act gap: between an affordability
     check and the response landing, every other caller must already see
     the budget as taken, or two starts could race into the same window.
     JS is single-threaded, so check + reserve in the same synchronous run
     is atomic. */
  reserve(units: number) {
    this.pending += units;
  }

  release(units: number) {
    this.pending = Math.max(0, this.pending - units);
  }

  pendingUnits(): number {
    return this.pending;
  }

  spentInWindow(now: number = Date.now()): number {
    this.roll(now);
    return this.spent;
  }

  /* 0 when `units` fit in the current window right now; otherwise ms until
     the attempt becomes safe (next boundary plus skew margin). */
  msUntilAffordable(units: number, now: number = Date.now()): number {
    this.roll(now);
    if (this.spent + this.pending + units <= this.limit) return 0;
    return Math.max(0, nextWindowStartMs(now) - now) + WINDOW_EDGE_MARGIN_MS;
  }
}

/* One shared per-tab ledger: the single check, the batch queue and verdict
   re-reads all draw from the same server-side IP budget, so they must share
   one client-side view of it. */
export const anonymousBudget = new RateBudgetLedger();

/* Reads X-RateLimit headers off any API response and folds them into the
   ledger. Free server answers carry no rate headers and change nothing. */
export function noteRateHeaders(
  headers: { get(name: string): string | null },
  ledger: RateBudgetLedger = anonymousBudget,
  now: number = Date.now()
) {
  const limit = Number(headers.get("X-RateLimit-Limit"));
  const remaining = Number(headers.get("X-RateLimit-Remaining"));
  if (Number.isFinite(limit) && Number.isFinite(remaining)) {
    ledger.syncRemaining(limit, remaining, now);
  }
}

/* Runs `fn` (typically one fetch) with `units` reserved on the ledger for
   exactly the flight of the call: reserved synchronously before dispatch,
   released when the promise settles either way. Recording real consumption
   stays the caller's job — callers record immediately after this resolves,
   and since affordability gates only run from timer and event callbacks
   (macrotasks), nothing can observe the microtask gap between the release
   here and the caller's recordSpend. */
export async function withReservedUnits<T>(
  ledger: RateBudgetLedger,
  units: number,
  fn: () => Promise<T>
): Promise<T> {
  ledger.reserve(units);
  try {
    return await fn();
  } finally {
    ledger.release(units);
  }
}

export type Intake429Kind = "window" | "wallet_cooldown" | "daily_cap";

/* The intake route answers 429 for three very different reasons. Copy and
   retry behavior differ per kind, so classify by message first (stable
   server strings), Retry-After horizon as the fallback. */
export function classifyIntake429(message: string | null | undefined, retryAfterSeconds: number | null): Intake429Kind {
  if (typeof message === "string") {
    if (/daily intake quota/i.test(message)) return "daily_cap";
    if (/already had an indexing attempt/i.test(message)) return "wallet_cooldown";
  }
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds)) {
    if (retryAfterSeconds > 3_600) return "daily_cap";
    if (retryAfterSeconds > 120) return "wallet_cooldown";
  }
  return "window";
}

/* When to retry after a window 429: the server's Retry-After is
   authoritative; without one, wait out the ledger. */
export function retryDelayMs(
  retryAfterSeconds: number | null,
  ledger: RateBudgetLedger,
  units: number = ANONYMOUS_INTAKE_UNITS,
  now: number = Date.now()
): number {
  if (retryAfterSeconds !== null && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return retryAfterSeconds * 1_000 + RETRY_MARGIN_MS;
  }
  const wait = ledger.msUntilAffordable(units, now);
  return wait > 0 ? wait : Math.max(0, nextWindowStartMs(now) - now) + WINDOW_EDGE_MARGIN_MS;
}

export function parseRetryAfterSeconds(headers: { get(name: string): string | null }): number | null {
  const raw = headers.get("Retry-After");
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.ceil(parsed) : null;
}

/* ------------------------------------------------------------------ */
/* Bulk queue engine: one intake start per affordable window, in order. */
/* ------------------------------------------------------------------ */

export type IntakeAttemptOutcome =
  /* 202 started: charged the full window. */
  | { type: "started" }
  /* 200 already_indexed or 202 join of an active job: free, no window used. */
  | { type: "free" }
  /* 429 minute-window pacing: retry is worthwhile. */
  | { type: "rate_window"; retryAfterSeconds: number | null }
  /* 429 per-wallet 10 minute cooldown: settle the row, no auto-retry. */
  | { type: "wallet_cooldown"; retryAfterSeconds: number | null }
  /* 429 daily cap: nothing else can start today, stop the whole queue. */
  | { type: "daily_cap"; retryAfterSeconds: number | null }
  /* Network failure or 4xx/5xx: settle the row. */
  | { type: "failed" };

export type QueueItemPhase =
  | { phase: "waiting"; attemptAtMs: number }
  | { phase: "attempting" }
  | {
      phase: "settled";
      reason: "started" | "free" | "failed" | "wallet_cooldown" | "daily_cap" | "rate_exhausted";
    };

export type IntakeQueueItem = { key: number; wallet: string };

export type IntakeQueue = {
  enqueue(items: IntakeQueueItem[]): void;
  report(key: number, outcome: IntakeAttemptOutcome): void;
  cancel(): void;
  size(): number;
  unfinished(): number;
};

export function createIntakeQueue(deps: {
  ledger: RateBudgetLedger;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /* Fire the actual POST for this item, then call report(key, outcome). */
  attempt: (item: IntakeQueueItem) => void;
  onUpdate: (key: number, phase: QueueItemPhase) => void;
}): IntakeQueue {
  const items: IntakeQueueItem[] = [];
  const retries = new Map<number, number>();
  let cursor = 0;
  let timer: unknown = null;
  let cancelled = false;
  let awaitingReport: number | null = null;

  function clearPending() {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
  }

  function scheduleCurrent() {
    if (cancelled || cursor >= items.length) return;
    const item = items[cursor];
    const wait = deps.ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, deps.now());
    if (wait > 0) {
      deps.onUpdate(item.key, { phase: "waiting", attemptAtMs: deps.now() + wait });
      timer = deps.setTimer(fireCurrent, wait);
    } else {
      fireCurrent();
    }
  }

  function fireCurrent() {
    timer = null;
    if (cancelled || cursor >= items.length) return;
    const item = items[cursor];
    /* Re-check at fire time: a manual click or a verdict read may have spent
       the window while this item waited. Never fire doomed. */
    const wait = deps.ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, deps.now());
    if (wait > 0) {
      deps.onUpdate(item.key, { phase: "waiting", attemptAtMs: deps.now() + wait });
      timer = deps.setTimer(fireCurrent, wait);
      return;
    }
    awaitingReport = item.key;
    deps.onUpdate(item.key, { phase: "attempting" });
    deps.attempt(item);
  }

  function settle(key: number, reason: Extract<QueueItemPhase, { phase: "settled" }>["reason"]) {
    deps.onUpdate(key, { phase: "settled", reason });
  }

  function advance() {
    cursor += 1;
    scheduleCurrent();
  }

  return {
    enqueue(newItems: IntakeQueueItem[]) {
      if (cancelled || newItems.length === 0) return;
      const wasIdle = cursor >= items.length && awaitingReport === null;
      items.push(...newItems);
      if (wasIdle && timer === null) scheduleCurrent();
    },
    report(key: number, outcome: IntakeAttemptOutcome) {
      if (cancelled || awaitingReport !== key) return;
      awaitingReport = null;
      const item = items[cursor];
      switch (outcome.type) {
        case "started":
          /* The dispatcher that fired the POST (useWalletIntake) is the
             single ledger writer — it recorded the spend before reporting.
             The engine only orchestrates. */
          settle(key, "started");
          advance();
          return;
        case "free":
          settle(key, "free");
          advance();
          return;
        case "failed":
          settle(key, "failed");
          advance();
          return;
        case "wallet_cooldown":
          settle(key, "wallet_cooldown");
          advance();
          return;
        case "daily_cap": {
          /* Nothing anonymous can start until UTC midnight: settle this item
             and everything still queued behind it. */
          settle(key, "daily_cap");
          for (let i = cursor + 1; i < items.length; i += 1) settle(items[i].key, "daily_cap");
          cursor = items.length;
          return;
        }
        case "rate_window": {
          /* Real 429 burns are recorded by the dispatcher (plus header
             sync); doomed-gate outcomes burned nothing. Either way the
             ledger already knows — just schedule the retry. */
          const used = (retries.get(key) ?? 0) + 1;
          retries.set(key, used);
          if (used > MAX_RATE_RETRIES) {
            settle(key, "rate_exhausted");
            advance();
            return;
          }
          const delay = retryDelayMs(outcome.retryAfterSeconds, deps.ledger, ANONYMOUS_INTAKE_UNITS, deps.now());
          deps.onUpdate(item.key, { phase: "waiting", attemptAtMs: deps.now() + delay });
          timer = deps.setTimer(fireCurrent, delay);
          return;
        }
      }
    },
    cancel() {
      cancelled = true;
      clearPending();
    },
    size: () => items.length,
    unfinished: () => (cursor >= items.length ? 0 : items.length - cursor)
  };
}

/* ------------------------------------------------------------------ */
/* Paced batch run: gate one variable-cost request on the shared window. */
/* ------------------------------------------------------------------ */

/* The batch pre-check costs one unit per deduped row, so request() fires
   immediately when the ledger affords that many units and otherwise waits
   for the boundary, re-gating at fire time exactly like the intake queue.
   A served window 429 (foreign spend on the same IP that the mirror could
   not see) re-paces from Retry-After up to MAX_RATE_RETRIES times before
   settling to a manual state. */

export type BatchRunPhase =
  | { phase: "waiting"; attemptAtMs: number }
  | { phase: "attempting" }
  | { phase: "settled"; reason: "done" | "rate_exhausted" };

export type BatchRunOutcome =
  /* Response handled: success, or any failure that is not window pacing. */
  | { type: "done" }
  /* Served window 429: retry is worthwhile. */
  | { type: "rate_window"; retryAfterSeconds: number | null };

export type BatchRun = {
  /* Ask for one run. Ignored while a POST is in flight; a fresh request
     after a settle starts over with a clean retry count. */
  request(): void;
  report(outcome: BatchRunOutcome): void;
  cancel(): void;
};

export function createBatchRun(deps: {
  ledger: RateBudgetLedger;
  /* Read at every gate so an edited list re-prices itself. */
  units: () => number;
  now: () => number;
  setTimer: (fn: () => void, ms: number) => unknown;
  clearTimer: (handle: unknown) => void;
  /* Fire the actual POST, then call report(outcome). */
  attempt: () => void;
  onUpdate: (phase: BatchRunPhase) => void;
}): BatchRun {
  let timer: unknown = null;
  let retries = 0;
  let cancelled = false;
  let awaiting = false;

  function clearPending() {
    if (timer !== null) {
      deps.clearTimer(timer);
      timer = null;
    }
  }

  function fire() {
    timer = null;
    if (cancelled || awaiting) return;
    /* Re-check at fire time: an intake start or a verdict read may have
       spent the window while this run waited. Never fire doomed. */
    const wait = deps.ledger.msUntilAffordable(deps.units(), deps.now());
    if (wait > 0) {
      deps.onUpdate({ phase: "waiting", attemptAtMs: deps.now() + wait });
      timer = deps.setTimer(fire, wait);
      return;
    }
    awaiting = true;
    deps.onUpdate({ phase: "attempting" });
    deps.attempt();
  }

  return {
    request() {
      if (cancelled || awaiting) return;
      retries = 0;
      clearPending();
      fire();
    },
    report(outcome) {
      if (cancelled || !awaiting) return;
      awaiting = false;
      if (outcome.type === "done") {
        deps.onUpdate({ phase: "settled", reason: "done" });
        return;
      }
      /* The dispatcher already recorded the burn (rejected requests still
         consume) and synced headers; this engine only schedules. */
      retries += 1;
      if (retries > MAX_RATE_RETRIES) {
        deps.onUpdate({ phase: "settled", reason: "rate_exhausted" });
        return;
      }
      const delay = retryDelayMs(outcome.retryAfterSeconds, deps.ledger, deps.units(), deps.now());
      deps.onUpdate({ phase: "waiting", attemptAtMs: deps.now() + delay });
      timer = deps.setTimer(fire, delay);
    },
    cancel() {
      cancelled = true;
      clearPending();
    }
  };
}
