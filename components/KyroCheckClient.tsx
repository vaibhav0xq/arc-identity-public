"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BatchCheckPanel } from "@/components/BatchCheckPanel";
import { useWalletIntake } from "@/components/useWalletIntake";
import { useCountdownSeconds } from "@/components/useCountdown";
import {
  DECISION_READ_UNITS,
  RETRY_MARGIN_MS,
  anonymousBudget,
  noteRateHeaders,
  parseRetryAfterSeconds,
  retryDelayMs,
  withReservedUnits
} from "@/lib/intake-pacing";
import { DECISION_MODEL_VERSION, USE_CASES, type UseCase } from "@/lib/decision-engine";
import { USE_CASE_LABELS, shortWallet, useCaseLabel, type CoverageLike } from "@/components/VerdictReport";
import { DecisionWorkbench } from "@/components/check/DecisionWorkbench";

const REQUEST_TIMEOUT_MS = 15_000;
const walletPattern = /^0x[a-fA-F0-9]{40}$/;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9](?:\.arcid|\.kyro)?$/;

type DecisionReason = { code: string; message: string };

type DecisionData = {
  wallet: string;
  username: string | null;
  useCase: string;
  decision: "allow" | "caution" | "block";
  riskLevel: string | null;
  recommendedLimit: { amountUsdc: number; currency: string; basis: string };
  reasons: DecisionReason[];
  warnings?: DecisionReason[];
  score: number | null;
  evidence: { used: string[]; missing: string[] };
  freshness: {
    cacheStatus: string | null;
    lastIndexedAt: string | null;
    refreshInProgress: boolean | null;
    refreshRecommended: boolean | null;
  };
  /* Phase 0: additive per-chain coverage transparency (absent on older
     payloads — render code must treat missing as unknown). */
  coverage?: CoverageLike | null;
  scoreModelVersion: string | null;
  decisionModelVersion: string;
};

type CheckError = { title: string; message: string };

function normalizeInput(value: string) {
  return value.trim();
}

function normalizeUsername(value: string) {
  const normalized = normalizeInput(value).toLowerCase();
  if (!usernamePattern.test(normalized)) return null;
  return normalized.endsWith(".arcid") || normalized.endsWith(".kyro") ? normalized : `${normalized}.kyro`;
}

async function fetchJson(url: string, signal: AbortSignal) {
  /* Reads cost one weighted unit each against the same anonymous window
     that intake starts drain. The unit is held while the request is in
     flight — reads used to hold nothing mid-flight, which let a 20-unit
     start and a 1-unit read race into the same window at the boundary —
     and the spend is recorded the moment the response lands so every
     pacing gate sees it before the body is even parsed. */
  const response = await withReservedUnits(anonymousBudget, DECISION_READ_UNITS, () =>
    fetch(url, {
      cache: "no-store",
      headers: { "Cache-Control": "no-store" },
      signal
    })
  );
  anonymousBudget.recordSpend(DECISION_READ_UNITS);
  noteRateHeaders(response.headers);
  const body = await response.json().catch(() => null);
  return { response, body };
}

export function KyroCheckClient() {
  const [mode, setMode] = useState<"single" | "batch">("single");
  const [lookupValue, setLookupValue] = useState("");
  const [useCase, setUseCase] = useState<UseCase>("payment");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<CheckError | null>(null);
  const [result, setResult] = useState<DecisionData | null>(null);
  const [receipt, setReceipt] = useState<{ id: string; url: string; deduped: boolean } | null>(null);
  const [receiptLoading, setReceiptLoading] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  /* UI-only: after a run the console docks to a one-line query bar; "Edit
     query" reopens the console without touching the verdict below. */
  const [editingQuery, setEditingQuery] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const receiptControllerRef = useRef<AbortController | null>(null);
  const resultRef = useRef<DecisionData | null>(null);

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  /* On-demand intake: the decision route answers 404 for wallets Kyro never
     indexed — that 404 becomes an intake CTA instead of a dead-end error,
     and when the indexed snapshot commits the verdict runs automatically. */
  const [noScoreWallet, setNoScoreWallet] = useState<string | null>(null);
  /* Deferred verdict refresh after an intake commits: waiting = the shared
     budget cannot afford the read yet (or a 429 said later); manual = auto
     attempts ran out and a button takes over. Never an error state. */
  const [verdictRefresh, setVerdictRefresh] = useState<{
    mode: "idle" | "waiting" | "manual";
    wallet: string | null;
    atMs: number | null;
  }>({ mode: "idle", wallet: null, atMs: null });
  const verdictTimerRef = useRef<number | null>(null);
  const verdictAttemptsRef = useRef(0);
  const intake = useWalletIntake((wallet) => {
    verdictAttemptsRef.current = 0;
    scheduleVerdictRefresh(wallet, anonymousBudget.msUntilAffordable(DECISION_READ_UNITS));
  });

  /* Ordinary anonymous pacing on an intake start resumes by itself when the
     window opens (the check that revealed "no score" spends the same budget
     the start needs, so the first click usually lands here). Wallet
     cooldowns and the daily cap stay manual. */
  const { start: startIntake } = intake;
  const intakeResumesRef = useRef(0);
  useEffect(() => {
    const st = intake.state;
    if (st.status !== "cooldown" || st.limitKind !== "window" || !st.wallet) return;
    if (intakeResumesRef.current >= 2) return;
    const wallet = st.wallet;
    const delay = Math.max(1, st.retryAfterSeconds ?? 60) * 1000 + RETRY_MARGIN_MS;
    const timer = window.setTimeout(() => {
      intakeResumesRef.current += 1;
      void startIntake(wallet);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [intake.state, startIntake]);

  /* Countdown targets for the paced copy. */
  const pacedTargetMs = useMemo(
    () =>
      intake.state.status === "cooldown" && intake.state.limitKind === "window" && intake.state.retryAfterSeconds !== null
        ? Date.now() + intake.state.retryAfterSeconds * 1000
        : null,
    [intake.state]
  );
  const pacedCountdown = useCountdownSeconds(pacedTargetMs);
  const verdictCountdown = useCountdownSeconds(verdictRefresh.atMs);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
      receiptControllerRef.current?.abort();
      receiptControllerRef.current = null;
      if (verdictTimerRef.current !== null) window.clearTimeout(verdictTimerRef.current);
    };
  }, []);

  async function runCheck() {
    if (loading) return;
    const submittedUseCase = useCase;
    const input = normalizeInput(lookupValue);
    if (!input) {
      setError({ title: "No query", message: "Enter a wallet address or Kyro username to run a check." });
      return;
    }

    let wallet: string | null = null;
    let resolvedUsername: string | null = null;

    if (walletPattern.test(input)) {
      wallet = input.toLowerCase();
    } else {
      const username = normalizeUsername(input);
      if (!username) {
        setError({
          title: "Invalid input",
          message: "Enter a valid EVM wallet address (0x...) or a Kyro username like yourname.kyro."
        });
        return;
      }
      resolvedUsername = username;
    }

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    setResult(null);
    receiptControllerRef.current?.abort();
    receiptControllerRef.current = null;
    setReceipt(null);
    setReceiptError(null);
    setReceiptLoading(false);
    setCopied(false);
    intake.reset();
    intakeResumesRef.current = 0;
    verdictAttemptsRef.current = 0;
    clearVerdictTimer();
    setVerdictRefresh({ mode: "idle", wallet: null, atMs: null });
    setNoScoreWallet(null);
    setEditingQuery(false);

    try {
      if (!wallet && resolvedUsername) {
        const { response, body } = await fetchJson(
          `/api/v1/profile/${encodeURIComponent(resolvedUsername)}?t=${Date.now()}`,
          controller.signal
        );
        if (response.status === 404) {
          setError({
            title: "Unknown username",
            message: `No Kyro identity found for ${resolvedUsername}. Check the spelling or use the wallet address directly.`
          });
          return;
        }
        if (response.status === 429) {
          const retryAfter = response.headers.get("Retry-After");
          setError({
            title: "Rate limited",
            message: `Too many checks this minute. Retry in ${retryAfter ?? "a few"} seconds.`
          });
          return;
        }
        const resolved = body?.data?.wallet;
        if (!response.ok || typeof resolved !== "string" || !walletPattern.test(resolved)) {
          setError({
            title: "Lookup failed",
            message: "Could not resolve that username to a wallet right now. Please retry."
          });
          return;
        }
        wallet = resolved.toLowerCase();
      }

      const { response, body } = await fetchJson(
        `/api/v1/decision/${encodeURIComponent(wallet as string)}?useCase=${submittedUseCase}&t=${Date.now()}`,
        controller.signal
      );
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        setError({
          title: "Rate limited",
          message: `Too many checks this minute. Retry in ${retryAfter ?? "a few"} seconds.`
        });
        return;
      }
      if (response.status === 404 && body?.error?.code === "NOT_FOUND") {
        /* Never-indexed wallet — offer on-demand intake instead of an error. */
        setNoScoreWallet(wallet as string);
        return;
      }
      if (!response.ok || body?.ok !== true || !body?.data?.decision) {
        setError({
          title: "Check failed",
          message:
            typeof body?.error === "string"
              ? body.error
              : "The decision service could not complete this check. Please retry."
        });
        return;
      }
      setResult(body.data as DecisionData);
    } catch (caught) {
      if (!isCurrent()) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError({ title: "Request timeout", message: "The check took longer than expected. Please retry." });
      } else {
        setError({ title: "Request unavailable", message: "Could not reach the decision service. Please retry." });
      }
    } finally {
      window.clearTimeout(timeout);
      if (isCurrent()) {
        controllerRef.current = null;
        setLoading(false);
      }
    }
  }

  /* Receipts are explicit and button-only: the decision GET stays
     side-effect-free, and minting a permanent public record is a deliberate
     act. The server recomputes the verdict itself — this client only says
     which wallet + use case. */
  async function createReceipt() {
    if (!result || receiptLoading) return;
    const forResult = result;
    receiptControllerRef.current?.abort();
    const controller = new AbortController();
    receiptControllerRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setReceiptLoading(true);
    setReceiptError(null);
    setCopied(false);
    try {
      const response = await fetch("/api/v1/decision-receipts", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet: forResult.wallet, useCase: forResult.useCase }),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (receiptControllerRef.current !== controller || resultRef.current !== forResult) return;
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        setReceiptError(`Too many receipts this minute. Retry in ${retryAfter ?? "a few"} seconds.`);
        return;
      }
      if (response.status === 503 && body?.error?.code === "SCHEMA_MISSING") {
        setReceiptError("Receipt storage is still being provisioned. Try again in a few minutes.");
        return;
      }
      const id = body?.data?.receipt?.id;
      if (!response.ok || body?.ok !== true || typeof id !== "string") {
        setReceiptError("Could not create the receipt. Please retry.");
        return;
      }
      setReceipt({ id, url: `${window.location.origin}/check/r/${id}`, deduped: body.data.deduped === true });
    } catch (caught) {
      if (receiptControllerRef.current !== controller || resultRef.current !== forResult) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setReceiptError("The receipt request took too long. Please retry.");
      } else {
        setReceiptError("Could not reach the receipt service. Please retry.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (receiptControllerRef.current === controller) {
        receiptControllerRef.current = null;
        setReceiptLoading(false);
      }
    }
  }

  async function copyReceiptLink() {
    if (!receipt) return;
    try {
      await navigator.clipboard.writeText(receipt.url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setReceiptError("Clipboard unavailable. Click the link field and copy it manually.");
    }
  }

  /* UI-only reset back to a blank console — pure state resets via the same
     setters the engine flows already use; no request behavior changes. */
  function startNewCheck() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    receiptControllerRef.current?.abort();
    receiptControllerRef.current = null;
    setLoading(false);
    setResult(null);
    setError(null);
    setReceipt(null);
    setReceiptError(null);
    setReceiptLoading(false);
    setCopied(false);
    intake.reset();
    intakeResumesRef.current = 0;
    verdictAttemptsRef.current = 0;
    clearVerdictTimer();
    setVerdictRefresh({ mode: "idle", wallet: null, atMs: null });
    setNoScoreWallet(null);
    setLookupValue("");
    setEditingQuery(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  /* UI-only: reopen the mounted console with the current query intact.
     Focusing the input also scrolls the console back into view. */
  function openEditQuery() {
    setEditingQuery(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearVerdictTimer() {
    if (verdictTimerRef.current !== null) {
      window.clearTimeout(verdictTimerRef.current);
      verdictTimerRef.current = null;
    }
  }

  function scheduleVerdictRefresh(wallet: string, delayMs: number) {
    clearVerdictTimer();
    if (delayMs > 0) {
      setVerdictRefresh({ mode: "waiting", wallet, atMs: Date.now() + delayMs });
      verdictTimerRef.current = window.setTimeout(() => void refreshVerdict(wallet), delayMs);
    } else {
      void refreshVerdict(wallet);
    }
  }

  /* Re-run the decision for a just-indexed wallet. Deliberately no loading
     plate: the standing conservative verdict stays on screen until the fresh
     one replaces it — indexing progress is additive, never a blocking gate.
     The read costs one unit of the same window intake starts drain, so it
     defers politely instead of surfacing normal rate pacing as an error. */
  async function refreshVerdict(wallet: string) {
    const wait = anonymousBudget.msUntilAffordable(DECISION_READ_UNITS);
    if (wait > 0) {
      scheduleVerdictRefresh(wallet, wait);
      return;
    }
    setVerdictRefresh({ mode: "idle", wallet, atMs: null });
    const submittedUseCase = resultRef.current?.wallet === wallet && resultRef.current?.useCase ? resultRef.current.useCase : useCase;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const { response, body } = await fetchJson(
        `/api/v1/decision/${encodeURIComponent(wallet)}?useCase=${submittedUseCase}&t=${Date.now()}`,
        controller.signal
      );
      if (!isCurrent()) return;
      if (response.ok && body?.ok === true && body?.data?.decision) {
        receiptControllerRef.current?.abort();
        receiptControllerRef.current = null;
        setReceipt(null);
        setReceiptError(null);
        setReceiptLoading(false);
        setCopied(false);
        setError(null);
        setNoScoreWallet(null);
        setVerdictRefresh({ mode: "idle", wallet: null, atMs: null });
        setResult(body.data as DecisionData);
        return;
      }
      if (response.status === 429) {
        verdictAttemptsRef.current += 1;
        if (verdictAttemptsRef.current <= 2) {
          scheduleVerdictRefresh(wallet, retryDelayMs(parseRetryAfterSeconds(response.headers), anonymousBudget, DECISION_READ_UNITS));
        } else {
          setVerdictRefresh({ mode: "manual", wallet, atMs: null });
        }
        return;
      }
      setVerdictRefresh({ mode: "manual", wallet, atMs: null });
    } catch {
      if (isCurrent()) setVerdictRefresh({ mode: "manual", wallet, atMs: null });
    } finally {
      window.clearTimeout(timeout);
      if (isCurrent()) controllerRef.current = null;
    }
  }

  /* Docked = a verdict is on screen and the user has not reopened the
     console. The console plate stays mounted (hidden) so input state,
     SSR-rendered copy and mode wiring all survive the dock. */
  const docked = Boolean(result && !loading && !editingQuery);

  /* One toggle node, rendered inside whichever console plate is visible.
     Both panels stay mounted (hidden via CSS) so switching modes never
     wipes an already-fetched report on either side. */
  const modeToggle = (
    <div className="plate-seg" role="group" aria-label="Check mode">
      <button
        type="button"
        onClick={() => setMode("single")}
        aria-pressed={mode === "single"}
        className={mode === "single" ? "is-on" : undefined}
      >
        Single
      </button>
      <button
        type="button"
        onClick={() => setMode("batch")}
        aria-pressed={mode === "batch"}
        className={mode === "batch" ? "is-on" : undefined}
      >
        Batch
      </button>
    </div>
  );

  return (
    <div className="min-w-0">
      <div className={mode === "batch" ? "min-w-0" : "hidden"}>
        <BatchCheckPanel useCase={useCase} onUseCaseChange={setUseCase} modeToggle={modeToggle} />
      </div>
      <div className={mode === "single" ? "min-w-0" : "hidden"}>
      {/* Query console — dark hero plate */}
      <section className={`credential-plate console-plate min-w-0${docked ? " hidden" : ""}`} aria-labelledby="check-query-title">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="console-label">Decision Console / Query</p>
          {modeToggle}
        </div>
        <h2 id="check-query-title" className="console-title">Who are you about to transact with?</h2>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <input
            ref={inputRef}
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") runCheck();
            }}
            className="plate-input flex-1"
            placeholder="Wallet address or username.kyro"
            aria-label="Wallet address or Kyro username"
          />
          <button onClick={runCheck} disabled={loading} className="plate-button">
            {loading ? "Checking..." : "Check wallet"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="console-label">Use case</span>
          <div className="plate-seg" role="group" aria-label="Use case">
            {USE_CASES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => setUseCase(candidate)}
                disabled={loading}
                aria-pressed={useCase === candidate}
                className={useCase === candidate ? "is-on" : undefined}
              >
                {USE_CASE_LABELS[candidate]}
              </button>
            ))}
          </div>
        </div>
        <div className="plate-meta">
          <span>{DECISION_MODEL_VERSION}</span>
          <span>GET /api/v1/decision</span>
          <span>allow / caution / block</span>
        </div>
      </section>

      {/* Docked query bar — the console collapsed to one line */}
      {docked && result ? (
        <div className="query-bar fade-in" role="group" aria-label="Current query">
          <div className="qb-id">
            <button type="button" className="qb-subject" onClick={openEditQuery} title="Edit this query">
              {result.username ?? shortWallet(result.wallet)}
            </button>
            <span aria-hidden>·</span>
            <span>{useCaseLabel(result.useCase)}</span>
            <span aria-hidden>·</span>
            <span>single check</span>
          </div>
          <div className="qb-actions">
            {modeToggle}
            <button type="button" className="qb-btn" onClick={openEditQuery}>
              Edit query
            </button>
            <button type="button" className="qb-btn is-primary" onClick={startNewCheck}>
              New check
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="report-note is-rose mt-6" role="alert">
          <b>{error.title}</b>
          {error.message}
        </div>
      ) : null}

      {/* On-demand intake — wallet exists on-chain but Kyro never indexed it */}
      {noScoreWallet && !result && !loading ? (
        <section className="credential-plate fade-in mt-8 min-w-0" aria-labelledby="check-intake-title">
          <p className="kicker" style={{ color: "#b8bdb2" }}>Intake / Unindexed wallet</p>
          <h3 id="check-intake-title" className="console-title">
            No committed evidence for {shortWallet(noScoreWallet)} yet.
          </h3>
          {intake.state.status === "idle" || intake.state.wallet !== noScoreWallet ? (
            <>
              <p className="mt-4 max-w-2xl text-[0.95rem] leading-7" style={{ color: "#b8bdb2" }}>
                Kyro has never indexed this wallet, so there is no verdict to give. Index it now: a first
                scan across 6 chains takes about a minute, then the check re-runs automatically on committed
                evidence. Anonymous indexing runs up to two wallets per minute, so the start may wait for the next
                open slot. The wallet&apos;s owner is not involved.
              </p>
              <div className="mt-5">
                <button type="button" onClick={() => intake.start(noScoreWallet)} className="plate-button">
                  Index this wallet
                </button>
              </div>
            </>
          ) : null}
          {intake.state.wallet === noScoreWallet && (intake.state.status === "starting" || intake.state.status === "indexing") ? (
            <div aria-live="polite">
              <p className="mt-6 animate-pulse font-mono text-sm uppercase tracking-[0.2em] text-bone">
                Indexing{intake.state.stage ? ` · ${intake.state.stage}` : "..."}
              </p>
              <p className="mt-4 max-w-2xl text-[0.9rem] leading-6" style={{ color: "#b8bdb2" }}>
                First scan covers 6 chains and takes about a minute. The verdict re-runs automatically when
                evidence commits.
              </p>
            </div>
          ) : null}
          {intake.state.wallet === noScoreWallet && intake.state.status === "committed" ? (
            <div aria-live="polite">
              <p className="mt-6 font-mono text-sm uppercase tracking-[0.2em] text-verified">
                {verdictRefresh.mode === "manual"
                  ? "Indexed. The verdict is ready to load."
                  : verdictRefresh.mode === "waiting"
                    ? `Indexed. Verdict loads in ${verdictCountdown ?? "a few"}s.`
                    : "Indexed. Running the verdict..."}
              </p>
              {verdictRefresh.mode === "manual" ? (
                <div className="mt-4">
                  <button type="button" onClick={() => void refreshVerdict(noScoreWallet)} className="plate-button">
                    Load the verdict
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          {intake.state.wallet === noScoreWallet && intake.state.status === "cooldown" && intake.state.limitKind === "window" ? (
            <div className="mt-6" aria-live="polite">
              <p className="animate-pulse font-mono text-sm uppercase tracking-[0.2em] text-bone">
                {pacedCountdown !== null && pacedCountdown > 0 ? `Indexing starts in ${pacedCountdown}s` : "Indexing starts shortly"}
              </p>
              <p className="mt-3 max-w-2xl text-[0.9rem] leading-6" style={{ color: "#b8bdb2" }}>
                Anonymous indexing runs up to two wallets per minute. This wallet is next in line and starts
                automatically, no retry needed.
              </p>
            </div>
          ) : null}
          {intake.state.wallet === noScoreWallet &&
          (intake.state.status === "failed" ||
            (intake.state.status === "cooldown" && intake.state.limitKind !== "window") ||
            intake.state.status === "timeout") ? (
            <div className="mt-6" role="alert">
              <p className="font-mono text-sm uppercase tracking-[0.2em]" style={{ color: "#e0a5a5" }}>
                {intake.state.status === "timeout" ? "Still indexing" : intake.state.status === "cooldown" ? "On cooldown" : "Indexing failed"}
              </p>
              <p className="mt-3 max-w-2xl text-[0.9rem] leading-6" style={{ color: "#b8bdb2" }}>{intake.state.message}</p>
            </div>
          ) : null}
          <div className="plate-meta">
            <span>POST /api/v1/intake</span>
            <span>first index ~1 min</span>
            <span>up to two anonymous starts per minute</span>
            <span>owner not involved</span>
          </div>
        </section>
      ) : null}

      {/* Loading plate */}
      {loading ? (
        <section className="credential-plate mt-8 min-w-0" aria-live="polite">
          <p className="kicker" style={{ color: "#b8bdb2" }}>Decision Engine / {USE_CASE_LABELS[useCase]}</p>
          <p className="mt-5 animate-pulse font-mono text-sm uppercase tracking-[0.2em] text-bone">Running decision...</p>
          <div className="mt-5 space-y-2.5" aria-hidden>
            <span className="skeleton skeleton-dark h-2.5 w-3/5" />
            <span className="skeleton skeleton-dark h-2.5 w-2/5" />
            <span className="skeleton skeleton-dark h-2.5 w-1/2" />
          </div>
          <div className="plate-meta">
            <span>{DECISION_MODEL_VERSION}</span>
            <span>live request</span>
          </div>
        </section>
      ) : null}

      {/* Decision workbench — sticky verdict rail + tabbed detail panels.
          All receipt/intake state and handlers stay in this file; the
          workbench is purely presentational and receives them as slots. */}
      {result && !loading ? (
        <div className="fade-in min-w-0">
          <DecisionWorkbench
            key={`${result.wallet}:${result.useCase}:${result.decisionModelVersion}`}
            result={result}
            notice={
              /* Unindexed wallet — indexing is THE action here, so it leads
                 the detail column instead of hiding at the rail's bottom. */
              result.freshness.cacheStatus !== "cached" ? (
                <div className="wb-notice">
                  {intake.state.status === "idle" || intake.state.wallet !== result.wallet ? (
                    <>
                      <div className="wbn-text">
                        <p className="wbn-kicker">Unindexed wallet: verdict is a baseline</p>
                        <p className="wbn-body">
                          Kyro has never indexed this wallet, so this verdict leans conservative rather
                          than reflecting observed history. A first scan across 6 chains takes about a
                          minute, then the verdict re-runs automatically on committed evidence. Anonymous
                          indexing runs up to two wallets per minute, so the start may wait for the
                          next open slot. The wallet&apos;s owner is not involved.
                        </p>
                      </div>
                      <button type="button" onClick={() => intake.start(result.wallet)} className="wbn-btn">
                        Index this wallet
                      </button>
                    </>
                  ) : null}
                  {intake.state.wallet === result.wallet &&
                  (intake.state.status === "starting" || intake.state.status === "indexing") ? (
                    <p className="wbn-status animate-pulse" aria-live="polite">
                      Indexing{intake.state.stage ? ` · ${intake.state.stage}` : "..."} (the verdict
                      re-runs automatically when the scan commits)
                    </p>
                  ) : null}
                  {intake.state.wallet === result.wallet && intake.state.status === "committed" ? (
                    <p className="wbn-status is-ok" aria-live="polite">
                      {verdictRefresh.mode === "manual" ? (
                        <>
                          Indexed. The fresh verdict is ready.{" "}
                          <button
                            type="button"
                            onClick={() => void refreshVerdict(result.wallet)}
                            className="underline underline-offset-2"
                          >
                            Load it now
                          </button>
                        </>
                      ) : verdictRefresh.mode === "waiting" ? (
                        `Indexed. The fresh verdict loads in ${verdictCountdown ?? "a few"}s.`
                      ) : (
                        "Indexed. Refreshing verdict..."
                      )}
                    </p>
                  ) : null}
                  {intake.state.wallet === result.wallet &&
                  intake.state.status === "cooldown" &&
                  intake.state.limitKind === "window" ? (
                    <p className="wbn-status animate-pulse" aria-live="polite">
                      {pacedCountdown !== null && pacedCountdown > 0
                        ? `Indexing starts in ${pacedCountdown}s. Anonymous indexing runs up to two wallets per minute.`
                        : "Indexing starts shortly. Anonymous indexing runs up to two wallets per minute."}
                    </p>
                  ) : null}
                  {intake.state.wallet === result.wallet &&
                  (intake.state.status === "failed" ||
                    (intake.state.status === "cooldown" && intake.state.limitKind !== "window") ||
                    intake.state.status === "timeout") ? (
                    <p className="wbn-status is-err" role="alert">
                      <b>
                        {intake.state.status === "timeout"
                          ? "Still indexing."
                          : intake.state.status === "cooldown"
                            ? "On cooldown."
                            : "Indexing failed."}
                      </b>{" "}
                      {intake.state.message}
                    </p>
                  ) : null}
                </div>
              ) : null
            }
            railActions={
              <>
                <div className="rail-block">
                  <p className="rail-label">Receipt</p>
                  {receipt ? (
                    <>
                      <input
                        readOnly
                        value={receipt.url}
                        onFocus={(event) => event.currentTarget.select()}
                        className="rail-input"
                        aria-label="Receipt link"
                      />
                      <div className="rail-btnrow">
                        <button onClick={copyReceiptLink} className="rail-btn is-primary">
                          {copied ? "Copied" : "Copy link"}
                        </button>
                        <Link href={`/check/r/${encodeURIComponent(receipt.id)}`} className="rail-btn">
                          View receipt →
                        </Link>
                      </div>
                      <p className="rail-note">
                        {receipt.deduped
                          ? "This exact snapshot already had a receipt today, so this is the same link."
                          : "Receipt recorded."}{" "}
                        Anyone with the link sees this verdict exactly as it stands right now. It never updates.
                      </p>
                    </>
                  ) : (
                    <>
                      <div>
                        <button onClick={createReceipt} disabled={receiptLoading} className="rail-btn is-primary">
                          {receiptLoading ? "Creating..." : "Create receipt link"}
                        </button>
                      </div>
                      <p className="rail-note">
                        Mint an immutable snapshot of this verdict and share it as a link: proof of what
                        Kyro said and when.
                      </p>
                    </>
                  )}
                  {receiptError ? (
                    <p className="rail-err" role="alert">
                      <b>Receipt not created.</b> {receiptError}
                    </p>
                  ) : null}
                </div>
              </>
            }
          />
          {/* End-of-report actions — where the eye lands after reading the findings */}
          <div className="wb-footer">
            <span className="wbf-note">End of report</span>
            <div className="wbf-actions">
              <button type="button" className="wbf-btn" onClick={openEditQuery}>
                Edit this query
              </button>
              <button type="button" className="wbf-btn is-primary" onClick={startNewCheck}>
                Check another wallet
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Empty state — compressed legend + flow line; the console holds the stage */}
      {!result && !loading && !error ? (
        <section className="rpt-section min-w-0" aria-labelledby="check-empty-title">
          <div className="rpt-head">
            <div className="min-w-0">
              <p className="rpt-kicker">No query yet / {DECISION_MODEL_VERSION}</p>
              <h3 id="check-empty-title" className="rpt-title">Three possible verdicts</h3>
            </div>
            <span className="rpt-meta">allow / caution / block</span>
          </div>
          <div className="legend-row">
            <div className="legend-cell">
              <span className="chip green"><span className="dot" />allow</span>
              <p>Evidence is complete, fresh and clean. Transact within the recommended limit.</p>
            </div>
            <div className="legend-cell">
              <span className="chip amber"><span className="dot" />caution</span>
              <p>Something is thin, stale or below the bar. Proceed carefully with a reduced limit.</p>
            </div>
            <div className="legend-cell">
              <span className="chip rose"><span className="dot" />block</span>
              <p>The trust graph or risk signals recommend against transacting at all.</p>
            </div>
          </div>
          <p className="flow-line">
            <b>01</b> Identify: wallet or username <span aria-hidden>→</span> <b>02</b> Set the stakes: pick
            the use case <span aria-hidden>→</span> <b>03</b> Read the verdict: with every finding behind it
          </p>
          <p className="api-line">
            Kyro checks reputation before payments, escrow, lending or marketplace deals: the same verdict
            developers get from <code className="font-mono text-xs">GET /api/v1/decision/:wallet</code>.
          </p>
        </section>
      ) : null}
      </div>
    </div>
  );
}
