/* Anonymous intake pacing model tests. Pure client-model tests with a fake
   clock and fake timers — no server, no database, no network.
   Run: node --experimental-strip-types scripts/test-intake-pacing.mjs

   What this suite proves:
   - the client ledger mirrors the server's fixed 60s window economics and
     never lets the queue fire a request the window cannot afford
   - bulk indexing runs exactly one intake start per window (20 units each)
   - Retry-After drives retry timing when the server provides it
   - free outcomes (already indexed, join) advance the queue in-window
   - the daily cap settles the whole queue at once
   - 429 classification and header syncing behave as designed
   - reads and the batch POST hold their units while in flight, so a start
     and a read can never race into the same window at a boundary
   - the batch pre-check (one unit per deduped row) defers behind a spent
     window, re-gates at fire time, re-paces served 429s from Retry-After
     and settles to manual after the auto retries are spent
   - the old dead-end row copy is gone from the batch panel source */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ANONYMOUS_INTAKE_UNITS,
  ANONYMOUS_WINDOW_UNITS,
  DECISION_READ_UNITS,
  MAX_RATE_RETRIES,
  RATE_WINDOW_MS,
  RETRY_MARGIN_MS,
  RateBudgetLedger,
  WINDOW_EDGE_MARGIN_MS,
  classifyIntake429,
  createBatchRun,
  createIntakeQueue,
  nextWindowStartMs,
  noteRateHeaders,
  parseRetryAfterSeconds,
  retryDelayMs,
  windowStartMs,
  withReservedUnits
} from "../lib/intake-pacing.ts";

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

async function checkAsync(name, fn) {
  await fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

/* ---------------------------------------------------------------- */
/* Fake clock + timer harness                                        */
/* ---------------------------------------------------------------- */

function makeClock(startMs) {
  let now = startMs;
  const timers = new Map();
  let seq = 0;
  return {
    now: () => now,
    setTimer(fn, ms) {
      seq += 1;
      timers.set(seq, { at: now + ms, fn });
      return seq;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    /* Run every timer due at or before untilMs, in firing order, advancing
       the clock to each timer's due time. Ends with now = untilMs. */
    advanceTo(untilMs) {
      for (;;) {
        let dueHandle = null;
        let due = null;
        for (const [handle, t] of timers) {
          if (t.at <= untilMs && (due === null || t.at < due.at)) {
            dueHandle = handle;
            due = t;
          }
        }
        if (due === null) break;
        timers.delete(dueHandle);
        now = Math.max(now, due.at);
        due.fn();
      }
      now = Math.max(now, untilMs);
    },
    pendingCount: () => timers.size,
    nextTimerAt() {
      let min = null;
      for (const t of timers.values()) min = min === null ? t.at : Math.min(min, t.at);
      return min;
    }
  };
}

/* Builds a queue wired to the fake clock. Outcomes are scripted per attempt
   (in order); every attempt and ledger spend is logged for assertions. */
function makeHarness(startMs, outcomes) {
  const clock = makeClock(startMs);
  const ledger = new RateBudgetLedger();
  const spends = [];
  const originalRecord = ledger.recordSpend.bind(ledger);
  ledger.recordSpend = (units, now) => {
    spends.push({ at: now, units });
    originalRecord(units, now);
  };
  const attempts = [];
  const phases = new Map();
  const script = [...outcomes];
  const queue = createIntakeQueue({
    ledger,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: (item) => {
      attempts.push({ key: item.key, wallet: item.wallet, at: clock.now() });
      const outcome = script.shift();
      assert.ok(outcome, `scripted outcome available for attempt on key ${item.key}`);
      /* Mirror the production dispatcher (useWalletIntake), the single
         ledger writer: a real start records 20 units, a real window 429
         records the burn. Doomed-gate outcomes (burn: false) record
         nothing because nothing was fired. */
      if (outcome.type === "started" || (outcome.type === "rate_window" && outcome.burn !== false)) {
        ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, clock.now());
      }
      queue.report(item.key, outcome);
    },
    onUpdate: (key, phase) => {
      phases.set(key, phase);
    }
  });
  return { clock, ledger, spends, attempts, phases, queue };
}

/* Builds a batch run wired to the fake clock. Outcomes are scripted per
   attempt; the harness mirrors the component dispatcher, the single ledger
   writer: every fired POST records one unit per row (429 included, rejected
   requests still burn server-side) before reporting. `record: false` models
   a fetch that never reached the server. `setUnits` reprices the list, as
   editing the textarea does. */
function makeBatchHarness(startMs, outcomes, initialUnits) {
  const clock = makeClock(startMs);
  const ledger = new RateBudgetLedger();
  const spends = [];
  const originalRecord = ledger.recordSpend.bind(ledger);
  ledger.recordSpend = (units, now) => {
    spends.push({ at: now, units });
    originalRecord(units, now);
  };
  const attempts = [];
  const phases = [];
  const script = [...outcomes];
  let units = initialUnits;
  const run = createBatchRun({
    ledger,
    units: () => units,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: () => {
      attempts.push({ at: clock.now(), units });
      const outcome = script.shift();
      assert.ok(outcome, "scripted outcome available for batch attempt");
      if (outcome.record !== false) {
        ledger.recordSpend(units, clock.now());
      }
      run.report(outcome);
    },
    onUpdate: (phase) => phases.push(phase)
  });
  return {
    clock,
    ledger,
    spends,
    attempts,
    phases,
    run,
    setUnits: (n) => {
      units = n;
    },
    lastPhase: () => phases[phases.length - 1] ?? null
  };
}

function unitsPerWindow(spends) {
  const perWindow = new Map();
  for (const { at, units } of spends) {
    const w = windowStartMs(at);
    perWindow.set(w, (perWindow.get(w) ?? 0) + units);
  }
  return perWindow;
}

/* Aligned mid-window base time, far from zero, so expectations are exact. */
const BASE_WINDOW = windowStartMs(1_770_000_000_000);
const BASE = BASE_WINDOW + 30_000;

/* ---------------------------------------------------------------- */
/* Constants mirror the server economics                             */
/* ---------------------------------------------------------------- */

check("constants: intake start costs the full anonymous window", () => {
  assert.equal(RATE_WINDOW_MS, 60_000);
  assert.equal(ANONYMOUS_WINDOW_UNITS, 20);
  assert.equal(ANONYMOUS_INTAKE_UNITS, 20);
  assert.equal(DECISION_READ_UNITS, 1);
  assert.ok(ANONYMOUS_INTAKE_UNITS + DECISION_READ_UNITS > ANONYMOUS_WINDOW_UNITS, "a read plus a start can never share a window");
});

check("window math: fixed boundaries, not sliding", () => {
  assert.equal(windowStartMs(BASE), BASE_WINDOW);
  assert.equal(nextWindowStartMs(BASE), BASE_WINDOW + RATE_WINDOW_MS);
  assert.equal(windowStartMs(BASE_WINDOW), BASE_WINDOW);
  assert.equal(nextWindowStartMs(BASE_WINDOW), BASE_WINDOW + RATE_WINDOW_MS);
});

/* ---------------------------------------------------------------- */
/* Ledger                                                            */
/* ---------------------------------------------------------------- */

check("ledger: a 20-unit start makes even a 1-unit read unaffordable until the next window", () => {
  const ledger = new RateBudgetLedger();
  assert.equal(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE), 0);
  ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  const wait = ledger.msUntilAffordable(DECISION_READ_UNITS, BASE);
  assert.equal(wait, nextWindowStartMs(BASE) - BASE + WINDOW_EDGE_MARGIN_MS);
  /* After the boundary the read is free to go. */
  assert.equal(ledger.msUntilAffordable(DECISION_READ_UNITS, nextWindowStartMs(BASE) + 1), 0);
});

check("ledger: syncRemaining max-merges and never erases recorded spend", () => {
  const ledger = new RateBudgetLedger();
  ledger.recordSpend(5, BASE);
  /* Server says less spent than we recorded: keep ours. */
  ledger.syncRemaining(20, 18, BASE);
  assert.equal(ledger.spentInWindow(BASE), 5);
  /* Server says more spent (foreign tab on the same IP): adopt theirs. */
  ledger.syncRemaining(20, 3, BASE);
  assert.equal(ledger.spentInWindow(BASE), 17);
  assert.equal(ledger.msUntilAffordable(1, BASE), 0);
  ledger.syncRemaining(20, 0, BASE);
  assert.ok(ledger.msUntilAffordable(1, BASE) > 0);
  /* Rolling into the next window resets the count. */
  assert.equal(ledger.spentInWindow(nextWindowStartMs(BASE) + 1), 0);
});

check("ledger: noteRateHeaders reads X-RateLimit headers, ignores absent ones", () => {
  const ledger = new RateBudgetLedger();
  const headers = (map) => ({ get: (name) => map[name] ?? null });
  noteRateHeaders(headers({ "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "6" }), ledger, BASE);
  assert.equal(ledger.spentInWindow(BASE), 14);
  /* Free intake answers carry no rate headers: nothing changes. */
  noteRateHeaders(headers({}), ledger, BASE);
  assert.equal(ledger.spentInWindow(BASE), 14);
  noteRateHeaders(headers({ "X-RateLimit-Limit": "junk", "X-RateLimit-Remaining": "6" }), ledger, BASE);
  assert.equal(ledger.spentInWindow(BASE), 14);
});

check("ledger: reservations close the in-flight check-then-act gap", () => {
  const ledger = new RateBudgetLedger();
  /* Caller A checks and reserves in the same synchronous run... */
  assert.equal(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE), 0);
  ledger.reserve(ANONYMOUS_INTAKE_UNITS);
  /* ...so caller B, checking while A's POST is in flight, must wait. */
  assert.ok(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE) > 0);
  assert.ok(ledger.msUntilAffordable(DECISION_READ_UNITS, BASE) > 0);
  /* A's response lands as a free outcome: reservation drops, no spend. */
  ledger.release(ANONYMOUS_INTAKE_UNITS);
  assert.equal(ledger.pendingUnits(), 0);
  assert.equal(ledger.spentInWindow(BASE), 0);
  assert.equal(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE), 0);
  /* Started outcome: reservation converts into recorded spend. */
  ledger.reserve(ANONYMOUS_INTAKE_UNITS);
  ledger.release(ANONYMOUS_INTAKE_UNITS);
  ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  assert.ok(ledger.msUntilAffordable(DECISION_READ_UNITS, BASE) > 0);
  /* release never goes negative. */
  ledger.release(999);
  assert.equal(ledger.pendingUnits(), 0);
});

await checkAsync("withReservedUnits: a 20-unit start is unaffordable while a 1-unit read is in flight", async () => {
  const ledger = new RateBudgetLedger();
  let midFlightWait = null;
  const result = await withReservedUnits(ledger, DECISION_READ_UNITS, async () => {
    midFlightWait = ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE);
    return "landed";
  });
  assert.equal(result, "landed");
  assert.ok(midFlightWait > 0, "a start gating mid-flight must see the held unit and defer");
  assert.equal(ledger.pendingUnits(), 0, "reservation released when the work lands");
  assert.equal(ledger.spentInWindow(BASE), 0, "the helper itself records no spend");
  assert.equal(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE), 0);
});

await checkAsync("withReservedUnits: releases on throw so a failed fetch cannot leak pending units", async () => {
  const ledger = new RateBudgetLedger();
  await assert.rejects(
    withReservedUnits(ledger, DECISION_READ_UNITS, async () => {
      throw new Error("network down");
    }),
    /network down/
  );
  assert.equal(ledger.pendingUnits(), 0);
  assert.equal(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, BASE), 0);
});

/* ---------------------------------------------------------------- */
/* 429 classification and retry delays                               */
/* ---------------------------------------------------------------- */

check("classifyIntake429: stable server strings win over Retry-After", () => {
  assert.equal(classifyIntake429("This wallet already had an indexing attempt in the last 10 minutes.", 45), "wallet_cooldown");
  assert.equal(classifyIntake429("Anonymous daily intake quota reached.", 45), "daily_cap");
});

check("classifyIntake429: Retry-After horizon is the fallback", () => {
  assert.equal(classifyIntake429(null, null), "window");
  assert.equal(classifyIntake429(null, 30), "window");
  assert.equal(classifyIntake429(null, 120), "window");
  assert.equal(classifyIntake429(null, 121), "wallet_cooldown");
  assert.equal(classifyIntake429(null, 600), "wallet_cooldown");
  assert.equal(classifyIntake429(null, 3600), "wallet_cooldown");
  assert.equal(classifyIntake429(null, 3601), "daily_cap");
  assert.equal(classifyIntake429("Rate limit exceeded", 30), "window");
});

check("parseRetryAfterSeconds: numeric seconds only, ceiled, never negative", () => {
  const headers = (value) => ({ get: (name) => (name === "Retry-After" ? value : null) });
  assert.equal(parseRetryAfterSeconds(headers("37")), 37);
  assert.equal(parseRetryAfterSeconds(headers("36.2")), 37);
  assert.equal(parseRetryAfterSeconds(headers(null)), null);
  assert.equal(parseRetryAfterSeconds(headers("Wed, 21 Oct 2026 07:28:00 GMT")), null);
  assert.equal(parseRetryAfterSeconds(headers("-5")), null);
});

check("retryDelayMs: server Retry-After is authoritative, ledger only a fallback", () => {
  const ledger = new RateBudgetLedger();
  ledger.recordSpend(20, BASE);
  /* Retry-After 37s → 38s with margin, NOT the ~31.5s ledger wait. */
  assert.equal(retryDelayMs(37, ledger, ANONYMOUS_INTAKE_UNITS, BASE), 37_000 + RETRY_MARGIN_MS);
  /* Without Retry-After: wait out the ledger window. */
  assert.equal(retryDelayMs(null, ledger, ANONYMOUS_INTAKE_UNITS, BASE), nextWindowStartMs(BASE) - BASE + WINDOW_EDGE_MARGIN_MS);
});

/* ---------------------------------------------------------------- */
/* Queue engine                                                      */
/* ---------------------------------------------------------------- */

check("queue: 10 wallets run one start per window, ~9.5 minutes total, never over budget", () => {
  const wallets = Array.from({ length: 10 }, (_, i) => ({ key: i, wallet: `0xw${i}` }));
  const h = makeHarness(BASE, wallets.map(() => ({ type: "started" })));
  /* The batch check that revealed these rows already spent 10 units in this
     window, so the first start cannot fit before the boundary. */
  h.ledger.recordSpend(10, BASE);
  h.queue.enqueue(wallets);
  assert.equal(h.attempts.length, 0, "no start fires inside the already-spent window");
  assert.equal(h.phases.get(0)?.phase, "waiting");
  h.clock.advanceTo(BASE + 11 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 10);
  /* One start per fixed window, consecutive windows, first in the window
     after the seeded one. */
  const attemptWindows = h.attempts.map((a) => windowStartMs(a.at));
  for (let i = 0; i < 10; i += 1) {
    assert.equal(attemptWindows[i], BASE_WINDOW + (i + 1) * RATE_WINDOW_MS, `attempt ${i} lands in its own window`);
    assert.equal(h.attempts[i].at, BASE_WINDOW + (i + 1) * RATE_WINDOW_MS + WINDOW_EDGE_MARGIN_MS, `attempt ${i} fires just past the boundary`);
  }
  const total = h.attempts[9].at - BASE;
  assert.ok(total <= 10 * RATE_WINDOW_MS, `10 wallets finish within 10 minutes (took ${total}ms)`);
  for (const [w, units] of unitsPerWindow(h.spends)) {
    assert.ok(units <= ANONYMOUS_WINDOW_UNITS, `window ${w} stays within budget (${units})`);
  }
  assert.equal(h.queue.unfinished(), 0);
  for (const { key } of wallets) {
    assert.deepEqual(h.phases.get(key), { phase: "settled", reason: "started" });
  }
});

check("queue: an affordable window starts immediately, no artificial delay", () => {
  const h = makeHarness(BASE, [{ type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].at, BASE);
});

check("queue: re-checks the ledger at fire time and never fires doomed", () => {
  const h = makeHarness(BASE, [{ type: "started" }]);
  h.ledger.recordSpend(10, BASE);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  const firstFireAt = h.clock.nextTimerAt();
  assert.equal(firstFireAt, nextWindowStartMs(BASE) + WINDOW_EDGE_MARGIN_MS);
  /* A manual click or verdict read spends the NEXT window before the timer
     fires: the queue must re-wait instead of firing a doomed POST. */
  h.ledger.recordSpend(20, nextWindowStartMs(BASE) + 200);
  h.clock.advanceTo(firstFireAt + 1);
  assert.equal(h.attempts.length, 0, "doomed attempt was not fired");
  assert.equal(h.phases.get(0)?.phase, "waiting");
  h.clock.advanceTo(BASE + 3 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 1);
  assert.equal(windowStartMs(h.attempts[0].at), BASE_WINDOW + 2 * RATE_WINDOW_MS);
});

check("queue: free outcomes advance in the same window without spending", () => {
  const h = makeHarness(BASE, [{ type: "free" }, { type: "free" }, { type: "started" }]);
  h.queue.enqueue([
    { key: 0, wallet: "0xa" },
    { key: 1, wallet: "0xb" },
    { key: 2, wallet: "0xc" }
  ]);
  /* All three attempts happen back to back at the same clock time: the two
     free answers cost nothing, so the real start still fits. */
  assert.equal(h.attempts.length, 3);
  assert.deepEqual(h.attempts.map((a) => a.at), [BASE, BASE, BASE]);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "free" });
  assert.deepEqual(h.phases.get(1), { phase: "settled", reason: "free" });
  assert.deepEqual(h.phases.get(2), { phase: "settled", reason: "started" });
  assert.equal(h.spends.reduce((sum, s) => sum + s.units, 0), ANONYMOUS_INTAKE_UNITS);
});

check("queue: exactly 20 units land per started attempt (engine adds nothing on top)", () => {
  const h = makeHarness(BASE, [{ type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.spends.reduce((sum, s) => sum + s.units, 0), ANONYMOUS_INTAKE_UNITS);
  assert.equal(h.ledger.spentInWindow(BASE), ANONYMOUS_INTAKE_UNITS);
});

check("queue: a doomed-gate outcome (nothing fired) retries without recording a burn", () => {
  const h = makeHarness(BASE, [{ type: "rate_window", retryAfterSeconds: 2, burn: false }, { type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.attempts.length, 1);
  h.clock.advanceTo(BASE + RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[1].at, BASE + 2_000 + RETRY_MARGIN_MS);
  assert.equal(h.spends.reduce((sum, s) => sum + s.units, 0), ANONYMOUS_INTAKE_UNITS);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "started" });
});

check("queue: Retry-After 37s drives the retry, not the 60s window fallback", () => {
  /* Mid-window 429 with Retry-After pointing past the boundary: the retry
     honors the server's timing exactly (37s plus margin), not the generic
     next-window fallback (31.5s here). */
  const h = makeHarness(BASE, [{ type: "rate_window", retryAfterSeconds: 37 }, { type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.attempts.length, 1);
  const retryAt = h.clock.nextTimerAt();
  assert.equal(retryAt, BASE + 37_000 + RETRY_MARGIN_MS);
  assert.notEqual(retryAt, nextWindowStartMs(BASE) + WINDOW_EDGE_MARGIN_MS, "not the window fallback");
  h.clock.advanceTo(BASE + 2 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[1].at, BASE + 37_000 + RETRY_MARGIN_MS);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "started" });
});

check("queue: a Retry-After inside the burned window defers to the boundary instead of firing doomed", () => {
  /* 429 right at a window start with Retry-After 37s: the rejected request
     burned this window server-side and the ledger mirrors that, so when the
     +38s timer fires the doomed-guard re-waits for the boundary rather than
     burning another rejected request. */
  const h = makeHarness(BASE_WINDOW, [{ type: "rate_window", retryAfterSeconds: 37 }, { type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.attempts.length, 1);
  h.clock.advanceTo(BASE_WINDOW + 2 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[1].at, BASE_WINDOW + RATE_WINDOW_MS + WINDOW_EDGE_MARGIN_MS);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "started" });
});

check("queue: window 429s settle to rate_exhausted after MAX_RATE_RETRIES, then the queue moves on", () => {
  const outcomes = [];
  for (let i = 0; i <= MAX_RATE_RETRIES; i += 1) outcomes.push({ type: "rate_window", retryAfterSeconds: null });
  outcomes.push({ type: "started" });
  const h = makeHarness(BASE_WINDOW, outcomes);
  h.queue.enqueue([
    { key: 0, wallet: "0xa" },
    { key: 1, wallet: "0xb" }
  ]);
  h.clock.advanceTo(BASE_WINDOW + 6 * RATE_WINDOW_MS);
  /* 1 initial + MAX_RATE_RETRIES retries for the stuck row, then row 2. */
  assert.equal(h.attempts.length, MAX_RATE_RETRIES + 2);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "rate_exhausted" });
  assert.deepEqual(h.phases.get(1), { phase: "settled", reason: "started" });
  for (const [w, units] of unitsPerWindow(h.spends)) {
    assert.ok(units <= ANONYMOUS_WINDOW_UNITS, `window ${w} stays within budget (${units})`);
  }
});

check("queue: daily cap settles the whole queue at once and stops", () => {
  const h = makeHarness(BASE, [{ type: "daily_cap", retryAfterSeconds: 40_000 }]);
  h.queue.enqueue([
    { key: 0, wallet: "0xa" },
    { key: 1, wallet: "0xb" },
    { key: 2, wallet: "0xc" },
    { key: 3, wallet: "0xd" }
  ]);
  assert.equal(h.attempts.length, 1, "only the first row ever fired");
  for (const key of [0, 1, 2, 3]) {
    assert.deepEqual(h.phases.get(key), { phase: "settled", reason: "daily_cap" });
  }
  assert.equal(h.queue.unfinished(), 0);
  assert.equal(h.clock.pendingCount(), 0, "no timers left running");
});

check("queue: wallet cooldown settles only its own row", () => {
  const h = makeHarness(BASE, [{ type: "wallet_cooldown", retryAfterSeconds: 480 }, { type: "started" }]);
  h.queue.enqueue([
    { key: 0, wallet: "0xa" },
    { key: 1, wallet: "0xb" }
  ]);
  h.clock.advanceTo(BASE + 2 * RATE_WINDOW_MS);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "wallet_cooldown" });
  assert.deepEqual(h.phases.get(1), { phase: "settled", reason: "started" });
});

check("queue: failed rows settle and the queue moves on", () => {
  const h = makeHarness(BASE, [{ type: "failed" }, { type: "started" }]);
  h.queue.enqueue([
    { key: 0, wallet: "0xa" },
    { key: 1, wallet: "0xb" }
  ]);
  h.clock.advanceTo(BASE + 2 * RATE_WINDOW_MS);
  assert.deepEqual(h.phases.get(0), { phase: "settled", reason: "failed" });
  assert.deepEqual(h.phases.get(1), { phase: "settled", reason: "started" });
});

check("queue: enqueue while active appends without double-firing", () => {
  const script = [{ type: "started" }, { type: "started" }, { type: "started" }];
  const clock = makeClock(BASE);
  const ledger = new RateBudgetLedger();
  const attempts = [];
  let pendingReport = null;
  const queue = createIntakeQueue({
    ledger,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: (item) => {
      attempts.push({ key: item.key, at: clock.now() });
      pendingReport = item.key;
    },
    onUpdate: () => {}
  });
  queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(attempts.length, 1);
  /* First row is mid-flight; enqueue two more. Nothing new may fire. */
  queue.enqueue([
    { key: 1, wallet: "0xb" },
    { key: 2, wallet: "0xc" }
  ]);
  assert.equal(attempts.length, 1);
  queue.report(pendingReport, script.shift());
  h_report_rest: {
    clock.advanceTo(BASE + 3 * RATE_WINDOW_MS);
    while (pendingReport !== null && attempts.length <= 3) {
      const key = pendingReport;
      pendingReport = null;
      const next = script.shift();
      if (!next) break;
      queue.report(key, next);
      clock.advanceTo(clock.now() + 2 * RATE_WINDOW_MS);
    }
  }
  assert.equal(attempts.length, 3);
  assert.deepEqual(
    attempts.map((a) => a.key),
    [0, 1, 2]
  );
  assert.equal(queue.unfinished(), 0);
});

check("queue: cancel stops timers and ignores late reports", () => {
  const h = makeHarness(BASE, []);
  h.ledger.recordSpend(20, BASE);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.clock.pendingCount(), 1);
  h.queue.cancel();
  assert.equal(h.clock.pendingCount(), 0);
  h.queue.report(0, { type: "started" });
  h.clock.advanceTo(BASE + 3 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 0);
});

check("queue: stale or unknown reports are ignored", () => {
  const h = makeHarness(BASE, [{ type: "started" }]);
  h.queue.enqueue([{ key: 0, wallet: "0xa" }]);
  assert.equal(h.attempts.length, 1);
  /* Row 0 already settled; a duplicate late report must not advance or
     charge anything. */
  const spendCount = h.spends.length;
  h.queue.report(0, { type: "started" });
  h.queue.report(99, { type: "started" });
  assert.equal(h.spends.length, spendCount);
});

/* ---------------------------------------------------------------- */
/* Batch pre-check pacing engine                                     */
/* ---------------------------------------------------------------- */

check("batch: fires immediately when the window affords one unit per row", () => {
  const h = makeBatchHarness(BASE, [{ type: "done" }], 10);
  h.run.request();
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].at, BASE);
  assert.deepEqual(h.lastPhase(), { phase: "settled", reason: "done" });
  assert.equal(h.spends.reduce((sum, s) => sum + s.units, 0), 10);
});

check("batch: defers behind a spent window and fires just past the boundary", () => {
  const h = makeBatchHarness(BASE, [{ type: "done" }], 10);
  /* An intake start already drained this window. */
  h.ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  h.run.request();
  assert.equal(h.attempts.length, 0, "no doomed POST into the spent window");
  const waitingPhase = h.lastPhase();
  assert.equal(waitingPhase.phase, "waiting");
  assert.equal(waitingPhase.attemptAtMs, nextWindowStartMs(BASE) + WINDOW_EDGE_MARGIN_MS);
  h.clock.advanceTo(BASE + 2 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 1);
  assert.equal(h.attempts[0].at, nextWindowStartMs(BASE) + WINDOW_EDGE_MARGIN_MS);
  assert.deepEqual(h.lastPhase(), { phase: "settled", reason: "done" });
  for (const [w, units] of unitsPerWindow(h.spends)) {
    assert.ok(units <= ANONYMOUS_WINDOW_UNITS, `window ${w} stays within budget (${units})`);
  }
});

check("batch: re-checks the ledger at fire time and never fires doomed", () => {
  const h = makeBatchHarness(BASE, [{ type: "done" }], 10);
  h.ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  h.run.request();
  const firstFireAt = h.clock.nextTimerAt();
  /* A manual click or verdict read spends the NEXT window before the timer
     fires: the run must re-wait instead of firing a doomed POST. */
  h.ledger.recordSpend(15, nextWindowStartMs(BASE) + 200);
  h.clock.advanceTo(firstFireAt + 1);
  assert.equal(h.attempts.length, 0, "10 rows do not fit a window with 15 spent");
  assert.equal(h.lastPhase().phase, "waiting");
  h.clock.advanceTo(BASE + 3 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 1);
  assert.equal(windowStartMs(h.attempts[0].at), BASE_WINDOW + 2 * RATE_WINDOW_MS);
});

check("batch: the gate re-reads the row count so an edited list re-prices itself", () => {
  const h = makeBatchHarness(BASE, [{ type: "done" }], 10);
  h.ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  h.run.request();
  const firstFireAt = h.clock.nextTimerAt();
  /* Foreign spend leaves 4 units of room in the next window... */
  h.ledger.recordSpend(16, nextWindowStartMs(BASE) + 200);
  /* ...and the user trims the list to 3 rows while the run waits. */
  h.setUnits(3);
  h.clock.advanceTo(firstFireAt + 1);
  assert.equal(h.attempts.length, 1, "3 rows fit the remaining room; the stale 10 would not");
  assert.equal(h.attempts[0].units, 3, "fired at the fresh price");
});

check("batch: a served 429 re-paces from Retry-After, not the window fallback", () => {
  const h = makeBatchHarness(BASE, [{ type: "rate_window", retryAfterSeconds: 37 }, { type: "done" }], 10);
  h.run.request();
  assert.equal(h.attempts.length, 1);
  const waitingPhase = h.lastPhase();
  assert.equal(waitingPhase.phase, "waiting");
  assert.equal(waitingPhase.attemptAtMs, BASE + 37_000 + RETRY_MARGIN_MS);
  h.clock.advanceTo(BASE + 2 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 2);
  assert.equal(h.attempts[1].at, BASE + 37_000 + RETRY_MARGIN_MS);
  assert.notEqual(h.attempts[1].at, nextWindowStartMs(BASE) + WINDOW_EDGE_MARGIN_MS, "not the window fallback");
  assert.deepEqual(h.lastPhase(), { phase: "settled", reason: "done" });
});

check("batch: settles to manual after the initial try plus MAX_RATE_RETRIES re-paces", () => {
  const outcomes = [];
  for (let i = 0; i <= MAX_RATE_RETRIES; i += 1) outcomes.push({ type: "rate_window", retryAfterSeconds: 61 });
  const h = makeBatchHarness(BASE_WINDOW, outcomes, 10);
  h.run.request();
  h.clock.advanceTo(BASE_WINDOW + 6 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, MAX_RATE_RETRIES + 1, "initial attempt plus the auto re-paces");
  assert.deepEqual(h.lastPhase(), { phase: "settled", reason: "rate_exhausted" });
  assert.equal(h.clock.pendingCount(), 0, "no timers left running");
  for (const [w, units] of unitsPerWindow(h.spends)) {
    assert.ok(units <= ANONYMOUS_WINDOW_UNITS, `window ${w} stays within budget (${units})`);
  }
});

check("batch: cancel stops the countdown and ignores late reports", () => {
  const h = makeBatchHarness(BASE, [], 10);
  h.ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, BASE);
  h.run.request();
  assert.equal(h.clock.pendingCount(), 1);
  h.run.cancel();
  assert.equal(h.clock.pendingCount(), 0);
  h.run.report({ type: "done" });
  h.clock.advanceTo(BASE + 3 * RATE_WINDOW_MS);
  assert.equal(h.attempts.length, 0);
  assert.equal(h.lastPhase().phase, "waiting", "no settle after cancel");
});

check("batch: requests while a POST is in flight are ignored; a fresh request after settle fires", () => {
  const clock = makeClock(BASE);
  const ledger = new RateBudgetLedger();
  const attempts = [];
  const phases = [];
  const run = createBatchRun({
    ledger,
    units: () => 5,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: () => attempts.push(clock.now()),
    onUpdate: (phase) => phases.push(phase)
  });
  run.request();
  assert.equal(attempts.length, 1);
  /* POST in flight (no report yet): more clicks change nothing. */
  run.request();
  run.request();
  assert.equal(attempts.length, 1);
  ledger.recordSpend(5, clock.now());
  run.report({ type: "done" });
  assert.deepEqual(phases[phases.length - 1], { phase: "settled", reason: "done" });
  /* A fresh batch after the settle starts over with a clean retry count. */
  run.request();
  assert.equal(attempts.length, 2);
});

/* ---------------------------------------------------------------- */
/* Interleaving: every surface shares one honest window              */
/* ---------------------------------------------------------------- */

await checkAsync("interleaving: batch, intake starts and in-flight reads never overdraw a window", async () => {
  const clock = makeClock(BASE_WINDOW);
  const ledger = new RateBudgetLedger();
  const spends = [];
  const originalRecord = ledger.recordSpend.bind(ledger);
  ledger.recordSpend = (units, now) => {
    spends.push({ at: now, units });
    originalRecord(units, now);
  };
  const queueAttempts = [];
  const queue = createIntakeQueue({
    ledger,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: (item) => {
      queueAttempts.push({ key: item.key, at: clock.now() });
      ledger.recordSpend(ANONYMOUS_INTAKE_UNITS, clock.now());
      queue.report(item.key, { type: "started" });
    },
    onUpdate: () => {}
  });
  /* A verdict read is in flight when "Index all" is clicked: the held unit
     makes the 20-unit start unaffordable, so the queue defers instead of
     racing the read into the same window — the exact edge that used to
     produce back-to-back 429s. */
  await withReservedUnits(ledger, DECISION_READ_UNITS, async () => {
    queue.enqueue([
      { key: 0, wallet: "0xa" },
      { key: 1, wallet: "0xb" }
    ]);
    assert.equal(queueAttempts.length, 0, "start deferred behind the in-flight read");
  });
  ledger.recordSpend(DECISION_READ_UNITS, clock.now());
  /* A 10-row batch requested in the same window still fits (1 + 10 <= 20)
     and fires immediately without disturbing the queued starts. */
  const batchAttempts = [];
  const run = createBatchRun({
    ledger,
    units: () => 10,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    attempt: () => {
      batchAttempts.push(clock.now());
      ledger.recordSpend(10, clock.now());
      run.report({ type: "done" });
    },
    onUpdate: () => {}
  });
  run.request();
  assert.equal(batchAttempts.length, 1);
  assert.equal(batchAttempts[0], BASE_WINDOW);
  /* One more read still fits this window (11 + 1 <= 20). */
  await withReservedUnits(ledger, DECISION_READ_UNITS, async () => {
    assert.ok(ledger.msUntilAffordable(ANONYMOUS_INTAKE_UNITS, clock.now()) > 0, "starts stay deferred");
  });
  ledger.recordSpend(DECISION_READ_UNITS, clock.now());
  /* The two intake starts then take one window each. */
  clock.advanceTo(BASE_WINDOW + 4 * RATE_WINDOW_MS);
  assert.equal(queueAttempts.length, 2);
  assert.equal(queueAttempts[0].at, BASE_WINDOW + RATE_WINDOW_MS + WINDOW_EDGE_MARGIN_MS);
  assert.equal(queueAttempts[1].at, BASE_WINDOW + 2 * RATE_WINDOW_MS + WINDOW_EDGE_MARGIN_MS);
  const perWindow = unitsPerWindow(spends);
  assert.equal(perWindow.get(BASE_WINDOW), 12, "reads plus batch share the first window");
  for (const [w, units] of perWindow) {
    assert.ok(units <= ANONYMOUS_WINDOW_UNITS, `window ${w} stays within budget (${units})`);
  }
});

/* ---------------------------------------------------------------- */
/* Source guarantees: the dead-end copy is gone                      */
/* ---------------------------------------------------------------- */

check("source: BatchCheckPanel drops the re-run dead end and gains the verdict loader", () => {
  const src = readFileSync(new URL("../components/BatchCheckPanel.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("re-run the batch for its verdict"), "old dead-end row copy removed");
  assert.ok(src.includes("load verdict"), "manual verdict loader present");
  assert.ok(!src.includes("BULK_INTAKE_SPACING_MS"), "old 20s wave spacing removed");
});

check("source: single check drops the Re-check needed dead end", () => {
  const src = readFileSync(new URL("../components/KyroCheckClient.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("Re-check needed"), "old dead-end error removed");
  assert.ok(src.includes("one wallet per minute"), "honest pacing copy present");
});

check("source: batch pre-check is paced and every read holds its unit in flight", () => {
  const batchSrc = readFileSync(new URL("../components/BatchCheckPanel.tsx", import.meta.url), "utf8");
  assert.ok(batchSrc.includes("createBatchRun("), "batch panel wires the pacing engine");
  assert.ok(batchSrc.includes("Batch check starts in"), "deferred batch carries the countdown");
  assert.ok(batchSrc.includes("withReservedUnits("), "batch POST and row verdict reads hold reservations");
  const singleSrc = readFileSync(new URL("../components/KyroCheckClient.tsx", import.meta.url), "utf8");
  assert.ok(singleSrc.includes("withReservedUnits("), "single-check reads hold reservations");
});

console.log(`\n${passed} checks passed`);
