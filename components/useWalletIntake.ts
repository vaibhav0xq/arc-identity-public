"use client";

/* Client state machine for on-demand wallet intake: POST the intake, then
   poll the public score read (refresh=false — a pure read) until the first
   snapshot commits, fails, or the watch window closes. Whatever verdict is
   already on screen stays visible the whole time — indexing progress is
   additive, never a blocking gate.

   Anonymous pacing (F-04): starting an intake costs 8 of the 20-unit
   anonymous minute window (at most two starts per minute, with headroom for
   verdict reads), and rejected requests still burn their units server-side.
   So start() consults the shared client ledger first and never fires a
   request it can predict will 429: instead it reports a paced state with
   the exact wait, and the caller shows a countdown and re-calls start()
   when the window opens. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ANONYMOUS_INTAKE_UNITS,
  anonymousBudget,
  classifyIntake429,
  noteRateHeaders,
  parseRetryAfterSeconds,
  type Intake429Kind,
  type IntakeAttemptOutcome
} from "@/lib/intake-pacing";

const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 24; // ~2 minutes
/* Bounded request lifetimes: a hung fetch must never pin the shared budget
   reservation (and with it the bulk queue) or freeze a row's status. */
const INTAKE_POST_TIMEOUT_MS = 30_000;
const POLL_TIMEOUT_MS = 10_000;
/* The 202 returns before the background job row exists, and the previous
   attempt's terminal status can linger on the first polls — ignore "failed"
   until the grace window passes. */
const FAILED_GRACE_POLLS = 2;

export type IntakeStatus =
  | "idle"
  | "starting"
  | "indexing"
  | "committed"
  | "failed"
  | "cooldown"
  | "timeout";

export type IntakeState = {
  status: IntakeStatus;
  wallet: string | null;
  stage: string | null;
  message: string | null;
  /* Set on cooldown states: which kind of 429 (or predicted 429) this is,
     and how long until the next attempt is worthwhile. "window" cooldowns
     are ordinary anonymous pacing, not errors, and callers auto-resume. */
  limitKind: Intake429Kind | null;
  retryAfterSeconds: number | null;
};

const IDLE: IntakeState = { status: "idle", wallet: null, stage: null, message: null, limitKind: null, retryAfterSeconds: null };

function stageLabel(refreshStatus: string | null) {
  if (refreshStatus === "recomputing_score") return "computing score";
  if (refreshStatus === "indexing_chains") return "scanning chains";
  return "starting scan";
}

export function useWalletIntake(onCommitted: (wallet: string) => void) {
  const [state, setState] = useState<IntakeState>(IDLE);
  const runRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const onCommittedRef = useRef(onCommitted);

  useEffect(() => {
    onCommittedRef.current = onCommitted;
  }, [onCommitted]);

  const stop = useCallback(() => {
    runRef.current += 1;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => stop, [stop]);

  const reset = useCallback(() => {
    stop();
    setState(IDLE);
  }, [stop]);

  /* Returns how the attempt went so schedulers (bulk queue, auto-resume
     countdowns) can react; UI-only callers may ignore the return value. */
  const start = useCallback(
    async (wallet: string): Promise<IntakeAttemptOutcome> => {
      stop();
      const run = runRef.current;
      const isCurrent = () => runRef.current === run;

      /* Doomed-request gate: if this tab's window cannot afford another
         start (two starts fill 16 of 20 units; reads take the rest), do not
         burn more units to be told no. Report ordinary pacing instead. */
      const waitMs = anonymousBudget.msUntilAffordable(ANONYMOUS_INTAKE_UNITS);
      if (waitMs > 0) {
        const retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
        setState({
          status: "cooldown",
          wallet,
          stage: null,
          message: "Anonymous indexing runs up to two wallets per minute.",
          limitKind: "window",
          retryAfterSeconds
        });
        return { type: "rate_window", retryAfterSeconds };
      }

      setState({ status: "starting", wallet, stage: null, message: null, limitKind: null, retryAfterSeconds: null });

      /* Reserve the window synchronously before dispatch: between this line
         and the response landing, every other affordability check (manual
         clicks, the bulk queue, verdict reads) must already see the budget
         as taken, or two starts could race into the same window. */
      anonymousBudget.reserve(ANONYMOUS_INTAKE_UNITS);

      let response: Response;
      let body: any = null;
      try {
        response = await fetch(`/api/v1/intake/${encodeURIComponent(wallet)}`, {
          method: "POST",
          cache: "no-store",
          signal: AbortSignal.timeout(INTAKE_POST_TIMEOUT_MS)
        });
        body = await response.json().catch(() => null);
      } catch {
        anonymousBudget.release(ANONYMOUS_INTAKE_UNITS);
        if (isCurrent())
          setState({
            status: "failed",
            wallet,
            stage: null,
            message: "Could not reach the intake service. Please retry.",
            limitKind: null,
            retryAfterSeconds: null
          });
        return { type: "failed" };
      }
      /* Response landed: drop the reservation. Real consumption is recorded
         below (started, window 429) and confirmed by header sync. */
      anonymousBudget.release(ANONYMOUS_INTAKE_UNITS);
      /* Consumed requests (started or 429) carry X-RateLimit headers; free
         state probes carry none. Sync whatever the server tells us. */
      noteRateHeaders(response.headers);
      if (!isCurrent()) return { type: "failed" };

      if (response.status === 429) {
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
        const serverMessage = typeof body?.error?.message === "string" ? body.error.message : null;
        const kind = classifyIntake429(serverMessage, retryAfterSeconds);
        /* Window pacing is normal operation, not an error: show the pacing
           sentence. Wallet cooldown and the daily cap keep the server's own
           sentence, which says exactly what is going on and for how long. */
        const message =
          kind === "window"
            ? "Anonymous indexing runs up to two wallets per minute."
            : serverMessage ?? `Too many requests. Retry in ${retryAfterSeconds ?? "a few"} seconds.`;
        /* A window 429 means the rejected request still burned its units;
           record it so nothing retries into the same poisoned window. The
           header sync above says the same thing, belt and suspenders. */
        if (kind === "window") anonymousBudget.recordSpend(ANONYMOUS_INTAKE_UNITS);
        setState({ status: "cooldown", wallet, stage: null, message, limitKind: kind, retryAfterSeconds });
        if (kind === "wallet_cooldown") return { type: "wallet_cooldown", retryAfterSeconds };
        if (kind === "daily_cap") return { type: "daily_cap", retryAfterSeconds };
        return { type: "rate_window", retryAfterSeconds };
      }
      if (!response.ok || body?.ok !== true) {
        setState({
          status: "failed",
          wallet,
          stage: null,
          message: "Could not start indexing. Please retry.",
          limitKind: null,
          retryAfterSeconds: null
        });
        return { type: "failed" };
      }
      if (body.data?.status === "already_indexed") {
        setState({ status: "committed", wallet, stage: null, message: null, limitKind: null, retryAfterSeconds: null });
        onCommittedRef.current(wallet);
        return { type: "free" };
      }

      /* "started" consumed the window; "indexing" joined an active job for
         free. Either way the caller polls the free score read from here. */
      const outcome: IntakeAttemptOutcome = body.data?.status === "indexing" ? { type: "free" } : { type: "started" };
      if (outcome.type === "started") anonymousBudget.recordSpend(ANONYMOUS_INTAKE_UNITS);

      setState({ status: "indexing", wallet, stage: "starting scan", message: null, limitKind: null, retryAfterSeconds: null });

      let polls = 0;
      const poll = async () => {
        if (!isCurrent()) return;
        polls += 1;
        try {
          const res = await fetch(`/api/score/${encodeURIComponent(wallet)}?refresh=false&t=${Date.now()}`, {
            cache: "no-store",
            signal: AbortSignal.timeout(POLL_TIMEOUT_MS)
          });
          const score = await res.json().catch(() => null);
          if (!isCurrent()) return;
          const cacheStatus = score?.cacheStatus ?? null;
          const refreshStatus = score?.refreshStatus ?? null;
          if (cacheStatus === "cached") {
            setState({ status: "committed", wallet, stage: null, message: null, limitKind: null, retryAfterSeconds: null });
            onCommittedRef.current(wallet);
            return;
          }
          if (refreshStatus === "failed" && polls > FAILED_GRACE_POLLS) {
            setState({
              status: "failed",
              wallet,
              stage: null,
              message:
                typeof score?.refreshError === "string" && score.refreshError
                  ? score.refreshError
                  : "Indexing did not complete. This wallet gets another attempt in about 10 minutes.",
              limitKind: null,
              retryAfterSeconds: null
            });
            return;
          }
          setState({ status: "indexing", wallet, stage: stageLabel(refreshStatus), message: null, limitKind: null, retryAfterSeconds: null });
        } catch {
          /* transient poll failure — keep waiting */
        }
        if (!isCurrent()) return;
        if (polls >= MAX_POLLS) {
          setState({
            status: "timeout",
            wallet,
            stage: null,
            message: "Still indexing. Re-run the check in a minute. The scan continues server-side.",
            limitKind: null,
            retryAfterSeconds: null
          });
          return;
        }
        timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
      };
      timerRef.current = window.setTimeout(poll, POLL_INTERVAL_MS);
      return outcome;
    },
    [stop]
  );

  return { state, start, reset };
}
