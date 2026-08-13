"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { DECISION_MODEL_VERSION, USE_CASES, type UseCase } from "@/lib/decision-engine";
import { USE_CASE_LABELS, shortWallet } from "@/components/VerdictReport";
import { useWalletIntake, type IntakeStatus } from "@/components/useWalletIntake";
import { useCountdownSeconds } from "@/components/useCountdown";
import {
  DECISION_READ_UNITS,
  RETRY_MARGIN_MS,
  anonymousBudget,
  createBatchRun,
  createIntakeQueue,
  noteRateHeaders,
  parseRetryAfterSeconds,
  retryDelayMs,
  withReservedUnits,
  type BatchRun,
  type BatchRunPhase,
  type IntakeAttemptOutcome,
  type IntakeQueue,
  type QueueItemPhase
} from "@/lib/intake-pacing";
import { toCsv } from "@/lib/csv";

const BATCH_TIMEOUT_MS = 45_000;
/* The web console is always anonymous; the API allows 50 rows with a key. */
const MAX_ROWS = 10;
/* "Index all" pacing lives in lib/intake-pacing.ts. The anonymous limiter
   is a FIXED 60s window of 20 units and ONE intake start costs all 20, so
   the queue starts at most one wallet per window, in table order, and never
   fires a request the shared ledger predicts will be rejected (rejected
   requests still burn their units server-side). The batch pre-check is
   gated the same way: one unit per deduped row, so instead of firing into
   a spent window the button carries a countdown and the POST fires by
   itself at the next affordable one. */

function waitLabel(seconds: number | null): string {
  if (seconds === null) return "soon";
  if (seconds > 90) return `~${Math.ceil(seconds / 60)}m`;
  return `${seconds}s`;
}

type DecisionReason = { code: string; message: string };

type BatchRow = {
  input: string;
  status: "ok" | "no_score" | "invalid" | "error";
  wallet: string | null;
  username: string | null;
  decision: "allow" | "caution" | "block" | null;
  score: number | null;
  riskLevel: string | null;
  recommendedLimit: { amountUsdc: number; currency: string; basis: string } | null;
  reasons: DecisionReason[];
  warnings: DecisionReason[];
  note: string | null;
};

type BatchData = {
  useCase: string;
  decisionModelVersion: string;
  summary: { total: number; allow: number; caution: number; block: number; noScore: number; invalid: number; error: number };
  results: BatchRow[];
};

type PanelError = { title: string; message: string };

const VERDICT_CHIP: Record<string, string> = { allow: "chip green", caution: "chip amber", block: "chip rose" };
const STATUS_LABEL: Record<BatchRow["status"], string> = {
  ok: "ok",
  no_score: "no score",
  invalid: "invalid",
  error: "error"
};

function parseEntries(text: string): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(trimmed);
  }
  return rows;
}

function limitLabel(limit: BatchRow["recommendedLimit"]): string {
  if (!limit) return "—";
  return `${limit.amountUsdc.toLocaleString("en-US")} ${limit.currency}`;
}

export function BatchCheckPanel({
  useCase,
  onUseCaseChange,
  modeToggle
}: {
  useCase: UseCase;
  onUseCaseChange: (useCase: UseCase) => void;
  modeToggle: ReactNode;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PanelError | null>(null);
  const [result, setResult] = useState<BatchData | null>(null);
  /* UI-only: after a run the console docks to a one-line query bar; "Edit
     list" reopens the console without touching the table below. */
  const [editingQuery, setEditingQuery] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  /* Bulk intake: one click enqueues every idle no-score row into a shared
     budget-aware queue (lib/intake-pacing.ts) that starts one wallet per
     affordable window, in table order. */
  const [rowIntakeStatus, setRowIntakeStatus] = useState<Record<number, IntakeStatus>>({});
  const [queuePhases, setQueuePhases] = useState<Record<number, QueueItemPhase>>({});
  const [attemptSignals, setAttemptSignals] = useState<Record<number, number>>({});
  const [bulkTotal, setBulkTotal] = useState(0);
  const queueRef = useRef<IntakeQueue | null>(null);
  useEffect(() => {
    return () => {
      queueRef.current?.cancel();
      batchRunRef.current?.cancel();
    };
  }, []);
  /* Bumped whenever the result identity changes; async row callbacks carry
     the epoch they were rendered under so a late decision re-read can never
     patch a row of a newer batch (same index, different wallet). */
  const batchEpochRef = useRef(0);

  const entries = useMemo(() => parseEntries(text), [text]);
  const overCap = entries.length > MAX_ROWS;
  /* Latest list for the pacing engine: its gate and the deferred fire both
     run from timers, so they must not close over a stale render. */
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  /* Batch pre-check pacing: the POST costs one unit per row against the
     same anonymous window that intake starts and verdict reads drain, and
     it used to fire ungated — the last surface that could burn a doomed
     request and present ordinary pacing as an error banner. The engine
     (lib/intake-pacing.ts) gates it, re-gates at timer fire, re-paces a
     served 429 from Retry-After and only settles to the manual banner
     after MAX_RATE_RETRIES rejections. */
  const [batchPhase, setBatchPhase] = useState<BatchRunPhase | null>(null);
  const batchRunRef = useRef<BatchRun | null>(null);
  const executeBatchRef = useRef<() => void>(() => {});
  const lastBatchRetryAfterRef = useRef<number | null>(null);
  const batchWaiting = batchPhase?.phase === "waiting";
  const batchCountdown = useCountdownSeconds(batchPhase?.phase === "waiting" ? batchPhase.attemptAtMs : null);

  function ensureBatchRun(): BatchRun {
    if (!batchRunRef.current) {
      batchRunRef.current = createBatchRun({
        ledger: anonymousBudget,
        units: () => entriesRef.current.length * DECISION_READ_UNITS,
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        attempt: () => executeBatchRef.current(),
        onUpdate: (phase) => {
          setBatchPhase(phase);
          if (phase.phase === "settled" && phase.reason === "rate_exhausted") {
            /* Auto re-paces kept meeting served 429s (foreign tabs spending
               the same IP budget): hand the retry to the user. */
            setError({
              title: "Rate limited",
              message: `A batch consumes one check per row. Retry in ${lastBatchRetryAfterRef.current ?? "a few"} seconds.`
            });
          }
        }
      });
    }
    return batchRunRef.current;
  }

  /* Button entry point: hand the run to the pacing engine. It fires right
     away when the window affords one unit per row; otherwise the button
     carries the countdown and the POST fires by itself. */
  function runBatch() {
    if (loading || entries.length === 0 || overCap) return;
    ensureBatchRun().request();
  }

  async function executeBatch() {
    const run = batchRunRef.current;
    /* Re-validate at fire time: the list may have changed during the wait.
       An empty or over-cap list settles the run quietly — clearing the
       console is how a pending batch is called off. */
    const submitted = entriesRef.current;
    if (loading || submitted.length === 0 || submitted.length > MAX_ROWS) {
      run?.report({ type: "done" });
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    const isCurrent = () => controllerRef.current === controller;
    const timeout = window.setTimeout(() => controller.abort(), BATCH_TIMEOUT_MS);
    setLoading(true);
    setError(null);
    setResult(null);
    setEditingQuery(false);
    queueRef.current?.cancel();
    queueRef.current = null;
    setRowIntakeStatus({});
    setQueuePhases({});
    setAttemptSignals({});
    setBulkTotal(0);
    batchEpochRef.current += 1;
    try {
      /* Hold the batch's units while the POST is in flight so intake
         starts, the bulk queue and verdict reads defer instead of racing
         this request into the same window at a boundary. */
      const response = await withReservedUnits(anonymousBudget, submitted.length * DECISION_READ_UNITS, () =>
        fetch("/api/v1/decision/batch", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inputs: submitted, useCase }),
          signal: controller.signal
        })
      );
      /* Every submitted row is a weighted unit against the same anonymous
         window that intake starts drain (429 included: rejected requests
         still burn). Record before parsing the body so no pacing gate can
         run between the reservation dropping and the spend landing. */
      anonymousBudget.recordSpend(submitted.length * DECISION_READ_UNITS);
      noteRateHeaders(response.headers);
      const body = await response.json().catch(() => null);
      if (!isCurrent()) {
        run?.report({ type: "done" });
        return;
      }
      if (response.status === 429) {
        /* A foreign tab on this IP spent budget the client mirror could
           not see. Not an error yet: the engine re-paces from Retry-After
           and the button carries the countdown; the banner only appears
           once the auto retries are spent. */
        const retryAfterSeconds = parseRetryAfterSeconds(response.headers);
        lastBatchRetryAfterRef.current = retryAfterSeconds;
        run?.report({ type: "rate_window", retryAfterSeconds });
        return;
      }
      if (!response.ok || body?.ok !== true || !Array.isArray(body?.data?.results)) {
        setError({
          title: "Batch failed",
          message:
            typeof body?.error?.message === "string"
              ? body.error.message
              : "The decision service could not complete this batch. Please retry."
        });
        run?.report({ type: "done" });
        return;
      }
      setResult(body.data as BatchData);
      run?.report({ type: "done" });
    } catch (caught) {
      run?.report({ type: "done" });
      if (!isCurrent()) return;
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setError({ title: "Request timeout", message: "The batch took longer than expected. Please retry." });
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
  /* Render-assigned so the engine's timer always fires the latest closure. */
  executeBatchRef.current = () => void executeBatch();

  /* A row that gets indexed inline swaps to a real verdict; the summary chips
     recount from the rows so totals always match the table. */
  function patchRow(rowIndex: number, patch: Partial<BatchRow>, epoch: number) {
    /* Stale-callback guard: see batchEpochRef. */
    if (epoch !== batchEpochRef.current) return;
    setResult((prev) => {
      if (!prev) return prev;
      const results = prev.results.map((row, i) => (i === rowIndex ? { ...row, ...patch } : row));
      const summary = { ...prev.summary, allow: 0, caution: 0, block: 0, noScore: 0, invalid: 0, error: 0 };
      for (const row of results) {
        if (row.status === "ok" && row.decision) summary[row.decision] += 1;
        else if (row.status === "no_score") summary.noScore += 1;
        else if (row.status === "invalid") summary.invalid += 1;
        else summary.error += 1;
      }
      return { ...prev, results, summary };
    });
  }

  function exportCsv() {
    if (!result) return;
    const rows = result.results.map((row) => [
      row.input,
      row.status,
      row.wallet,
      row.username,
      row.decision,
      row.score,
      row.riskLevel,
      row.recommendedLimit ? row.recommendedLimit.amountUsdc : null,
      row.reasons.map((reason) => reason.code).join("; "),
      row.warnings.map((warning) => warning.code).join("; "),
      row.note
    ]);
    const csv = toCsv(
      ["input", "status", "wallet", "username", "verdict", "score", "risk_level", "limit_usdc", "reason_codes", "warning_codes", "note"],
      rows
    );
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `kyro-batch-${result.useCase}-${stamp}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  const summary = result?.summary ?? null;
  /* Docked = batch verdicts on screen and the console not reopened. */
  const docked = Boolean(result && !loading && !editingQuery);

  /* Rows "Index all" can act on, in table order. */
  const noScoreRows = useMemo(
    () =>
      result
        ? result.results.map((row, index) => ({ row, index })).filter(({ row }) => row.status === "no_score" && Boolean(row.wallet))
        : [],
    [result]
  );
  const idleNoScoreCount = noScoreRows.filter(
    ({ index }) => (rowIntakeStatus[index] ?? "idle") === "idle" && queuePhases[index] === undefined
  ).length;
  /* Active = the queue still has rows waiting for their window, or a started
     row is scanning. Settled rows (committed, failed, cooldown) drop out. */
  const bulkActive =
    Object.values(queuePhases).some((phase) => phase.phase === "waiting" || phase.phase === "attempting") ||
    noScoreRows.some(({ index }) => {
      const status = rowIntakeStatus[index] ?? "idle";
      return status === "starting" || status === "indexing";
    });
  const bulkDoneCount = Object.values(queuePhases).filter((phase) => phase.phase === "settled").length;

  function ensureQueue(): IntakeQueue {
    if (!queueRef.current) {
      queueRef.current = createIntakeQueue({
        ledger: anonymousBudget,
        now: () => Date.now(),
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (handle) => window.clearTimeout(handle as number),
        attempt: ({ key }) => setAttemptSignals((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 })),
        onUpdate: (key, phase) => setQueuePhases((prev) => ({ ...prev, [key]: phase }))
      });
    }
    return queueRef.current;
  }

  function startBulkIndex() {
    const items = noScoreRows
      .filter(({ index }) => (rowIntakeStatus[index] ?? "idle") === "idle" && queuePhases[index] === undefined)
      .map(({ row, index }) => ({ key: index, wallet: row.wallet as string }));
    if (items.length === 0) return;
    setBulkTotal((total) => total + items.length);
    ensureQueue().enqueue(items);
  }

  function reportRowStatus(index: number, status: IntakeStatus) {
    setRowIntakeStatus((prev) => (prev[index] === status ? prev : { ...prev, [index]: status }));
  }

  /* Captured per render; row callbacks and keys are scoped to this epoch. */
  const batchEpoch = batchEpochRef.current;

  /* UI-only reset back to a blank batch console. */
  function startNewBatch() {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setLoading(false);
    setResult(null);
    setError(null);
    setText("");
    setEditingQuery(false);
    queueRef.current?.cancel();
    queueRef.current = null;
    batchRunRef.current?.cancel();
    batchRunRef.current = null;
    setBatchPhase(null);
    lastBatchRetryAfterRef.current = null;
    setRowIntakeStatus({});
    setQueuePhases({});
    setAttemptSignals({});
    setBulkTotal(0);
    batchEpochRef.current += 1;
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /* UI-only: reopen the mounted batch console with the current list intact. */
  function openEditList() {
    setEditingQuery(true);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  return (
    <div className="min-w-0">
      {/* Query console — dark hero plate, batch flavor */}
      <section className={`credential-plate console-plate min-w-0${docked ? " hidden" : ""}`} aria-labelledby="batch-query-title">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="console-label">Decision Console / Batch</p>
          {modeToggle}
        </div>
        <h2 id="batch-query-title" className="console-title">Screen the whole list before money moves.</h2>
        <div className="mt-5">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="plate-input min-h-[8rem] w-full resize-y font-mono text-sm leading-6"
            placeholder={"One per line:\n0x12ab...  (wallet address)\nalice.kyro\nbob"}
            aria-label="Wallet addresses or Kyro usernames, one per line"
            spellCheck={false}
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#a0a69a]">
            {entries.length} unique {entries.length === 1 ? "entry" : "entries"} · max {MAX_ROWS} per batch
          </span>
          {overCap ? (
            <span className="font-mono text-[0.68rem] uppercase tracking-[0.1em] text-limited">
              Limited to {MAX_ROWS} here — the API takes 50 with a key
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <span className="console-label">Use case</span>
          <div className="plate-seg" role="group" aria-label="Use case">
            {USE_CASES.map((candidate) => (
              <button
                key={candidate}
                type="button"
                onClick={() => onUseCaseChange(candidate)}
                disabled={loading}
                aria-pressed={useCase === candidate}
                className={useCase === candidate ? "is-on" : undefined}
              >
                {USE_CASE_LABELS[candidate]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-5">
          <button onClick={runBatch} disabled={loading || entries.length === 0 || overCap || batchWaiting} className="plate-button">
            {batchWaiting
              ? `Batch check starts in ${waitLabel(batchCountdown)}`
              : loading
                ? "Checking..."
                : `Check ${entries.length > 0 ? entries.length : ""} wallet${entries.length === 1 ? "" : "s"}`.replace("  ", " ")}
          </button>
          {batchWaiting ? (
            <p className="mt-3 font-mono text-[0.68rem] uppercase tracking-[0.1em] text-[#a0a69a]" aria-live="polite">
              Checks share the anonymous rate budget. This batch starts automatically when the minute opens.
            </p>
          ) : null}
        </div>
        <div className="plate-meta">
          <span>{DECISION_MODEL_VERSION}</span>
          <span>POST /api/v1/decision/batch</span>
          <span>1 row = 1 check</span>
        </div>
      </section>

      {/* Docked query bar — the batch console collapsed to one line */}
      {docked && result && summary ? (
        <div className="query-bar fade-in" role="group" aria-label="Current batch">
          <div className="qb-id">
            <button type="button" className="qb-subject" onClick={openEditList} title="Edit this list">
              {summary.total} {summary.total === 1 ? "wallet" : "wallets"}
            </button>
            <span aria-hidden>·</span>
            <span>{USE_CASE_LABELS[useCase] ?? result.useCase}</span>
            <span aria-hidden>·</span>
            <span>batch check</span>
          </div>
          <div className="qb-actions">
            {modeToggle}
            <button type="button" className="qb-btn" onClick={openEditList}>
              Edit list
            </button>
            <button type="button" className="qb-btn is-primary" onClick={startNewBatch}>
              New batch
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

      {/* Loading plate */}
      {loading ? (
        <section className="credential-plate mt-8 min-w-0" aria-live="polite">
          <p className="kicker" style={{ color: "#b8bdb2" }}>Decision Engine / {USE_CASE_LABELS[useCase]}</p>
          <p className="mt-5 animate-pulse font-mono text-sm uppercase tracking-[0.2em] text-bone">
            Running {entries.length} decisions...
          </p>
          <div className="mt-5 space-y-2.5" aria-hidden>
            <span className="skeleton skeleton-dark h-2.5 w-3/5" />
            <span className="skeleton skeleton-dark h-2.5 w-2/5" />
            <span className="skeleton skeleton-dark h-2.5 w-1/2" />
          </div>
          <div className="plate-meta">
            <span>{DECISION_MODEL_VERSION}</span>
            <span>committed reads only</span>
          </div>
        </section>
      ) : null}

      {/* Batch report — one bounded register sheet: masthead, ruled table, footnote */}
      {result && summary && !loading ? (
        <div className="fade-in min-w-0">
          <div className="bt-sheet">
            {/* Masthead — the whole batch summarized as a document head */}
            <div className="tally-bar">
              <div className="tally-id">
                <p className="tally-kicker">Counterparty register / {result.decisionModelVersion}</p>
                <div className="tally-count-line">
                  <span className="tally-count">{summary.total}</span>
                  <span className="tally-label">
                    {summary.total === 1 ? "counterparty" : "counterparties"} · {USE_CASE_LABELS[useCase] ?? result.useCase}
                  </span>
                </div>
              </div>
              <div className="tally-chips">
                {summary.allow > 0 ? <span className="chip green"><span className="dot" />allow {summary.allow}</span> : null}
                {summary.caution > 0 ? <span className="chip amber"><span className="dot" />caution {summary.caution}</span> : null}
                {summary.block > 0 ? <span className="chip rose"><span className="dot" />block {summary.block}</span> : null}
                <span className="tally-quiet">
                  no score {summary.noScore} · invalid {summary.invalid} · error {summary.error}
                </span>
                <span className="sr-only" role="status">
                  {bulkTotal > 0
                    ? bulkActive
                      ? `Bulk indexing: ${bulkDoneCount} of ${bulkTotal} wallets processed, one start per minute`
                      : "Bulk indexing finished"
                    : ""}
                </span>
                {idleNoScoreCount > 0 || bulkActive ? (
                  <button
                    type="button"
                    onClick={startBulkIndex}
                    disabled={bulkActive}
                    className="bt-index is-lg shrink-0"
                    title="Indexes every no-score row. Anonymous indexing runs one wallet per minute, so each row waits its turn in the queue."
                  >
                    {bulkActive
                      ? `Indexing ${Math.min(bulkDoneCount + 1, bulkTotal)}/${bulkTotal}...`
                      : `Index all ${idleNoScoreCount}`}
                  </button>
                ) : null}
                <button type="button" onClick={exportCsv} className="arc-button-primary shrink-0 px-4 py-2 text-xs font-semibold">
                  Export CSV
                </button>
              </div>
            </div>

            <section aria-labelledby="batch-table-title">
              <h3 id="batch-table-title" className="sr-only">Every entry, answered</h3>
              {/* Capped scroll viewport: the page keeps its height no matter how
                  many rows come back; the header row pins to the top edge. */}
              <div className="bt-scroll" role="region" aria-label="Batch results" tabIndex={0}>
                <table className="bt-t w-full min-w-[46rem] text-left">
                  <thead>
                    <tr>
                      <th scope="col" aria-label="Row">#</th>
                      <th scope="col">Input</th>
                      <th scope="col">Verdict</th>
                      <th scope="col">Score</th>
                      <th scope="col">Risk</th>
                      <th scope="col">Limit</th>
                      <th scope="col">Findings</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.results.map((row, index) => {
                      /* Registers stay one line: 0x… inputs render middle-
                         truncated (full value in the title attr and the CSV). */
                      const isAddress = /^0x[0-9a-fA-F]{40}$/.test(row.input);
                      return (
                        <tr key={`${batchEpoch}-${row.input}-${index}`}>
                          <td className="bt-ord">{String(index + 1).padStart(2, "0")}</td>
                          <td>
                            <span className="bt-addr" title={row.input}>{isAddress ? shortWallet(row.input) : row.input}</span>
                            {row.username && row.username !== row.input ? (
                              <span className="bt-sub">{row.username}</span>
                            ) : null}
                            {row.wallet && row.wallet.toLowerCase() !== row.input.toLowerCase() ? (
                              <span className="bt-sub">{shortWallet(row.wallet)}</span>
                            ) : null}
                          </td>
                          <td className="whitespace-nowrap">
                            {row.status === "ok" && row.decision ? (
                              <span className={VERDICT_CHIP[row.decision] ?? "chip amber"}><span className="dot" />{row.decision}</span>
                            ) : row.status === "no_score" ? (
                              <span className="bt-nul">no score</span>
                            ) : (
                              <span className="code-chip">{STATUS_LABEL[row.status]}</span>
                            )}
                          </td>
                          <td className="bt-score">{row.score !== null ? row.score : <span className="bt-nul">—</span>}</td>
                          <td className="bt-risk whitespace-nowrap">{row.riskLevel ?? "—"}</td>
                          <td className="bt-limit whitespace-nowrap">{limitLabel(row.recommendedLimit)}</td>
                          <td>
                            {row.status === "ok" ? (
                              <span className="flex flex-wrap gap-1.5">
                                {[...row.reasons, ...row.warnings].slice(0, 3).map((reason, chipIndex) => (
                                  <span key={`${reason.code}-${chipIndex}`} className="code-chip">{reason.code}</span>
                                ))}
                                {row.reasons.length + row.warnings.length > 3 ? (
                                  <span className="font-mono text-[0.68rem] text-quiet">+{row.reasons.length + row.warnings.length - 3}</span>
                                ) : null}
                              </span>
                            ) : row.status === "no_score" && row.wallet ? (
                              /* Compact resting state so a no-score row stays as
                                 flat as a scored one — the sheet footnote carries
                                 the full sentence, the title attr keeps it per row. */
                              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="bt-note" title={row.note ?? undefined}>
                                  No committed snapshot
                                </span>
                                <RowIntake
                                  wallet={row.wallet}
                                  useCase={result.useCase}
                                  queuePhase={queuePhases[index]}
                                  attemptSignal={attemptSignals[index] ?? 0}
                                  onReport={(outcome) => {
                                    /* Stale-callback guard: an in-flight start
                                       from a previous batch generation must
                                       never reach the replacement queue. */
                                    if (batchEpoch !== batchEpochRef.current) return;
                                    queueRef.current?.report(index, outcome);
                                  }}
                                  onStatus={(status) => reportRowStatus(index, status)}
                                  onVerdict={(patch) => patchRow(index, patch, batchEpoch)}
                                />
                              </span>
                            ) : (
                              <span className="bt-note block">{row.note}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="bt-foot">
                Rows marked <span className="font-mono text-[0.8em] uppercase">no score</span> have no committed snapshot yet — Kyro
                reports nothing rather than guessing. Run a{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                  single check
                </button>{" "}
                for the full report on any wallet.
              </p>
            </section>
          </div>
          {/* End-of-report actions — where the eye lands after scanning the table */}
          <div className="wb-footer">
            <span className="wbf-note">End of report</span>
            <div className="wbf-actions">
              <button type="button" className="wbf-btn" onClick={openEditList}>
                Edit this list
              </button>
              <button type="button" className="wbf-btn is-primary" onClick={startNewBatch}>
                Check another list
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Empty state — compressed flow line; the console holds the stage */}
      {!result && !loading && !error && !batchWaiting ? (
        <section className="rpt-section min-w-0" aria-labelledby="batch-empty-title">
          <div className="rpt-head">
            <div className="min-w-0">
              <p className="rpt-kicker">No batch yet / {DECISION_MODEL_VERSION}</p>
              <h3 id="batch-empty-title" className="rpt-title">One list in, one verdict per row</h3>
            </div>
            <span className="rpt-meta">up to {MAX_ROWS} rows</span>
          </div>
          <p className="flow-line">
            <b>01</b> Paste the list — one wallet or username per line <span aria-hidden>→</span> <b>02</b> Set
            the stakes — one use case for the whole batch <span aria-hidden>→</span> <b>03</b> Read the table —
            verdicts, limits and findings per row, exportable as CSV
          </p>
          <p className="api-line">
            Each row is the exact verdict developers get from{" "}
            <code className="font-mono text-xs">POST /api/v1/decision/batch</code> — committed evidence only,
            never a guess. Need 50 rows a call? <Link href="/developers" className="underline underline-offset-2">Get an API key</Link>.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/* Per-row on-demand intake for "no score" rows: index the wallet, wait for
   the snapshot to commit, then swap this row's status for a real verdict via
   a single decision read (1 rate unit, deferred until the shared budget can
   afford it). The batch itself never auto-indexes — indexing stays a
   deliberate action, paced by the queue in lib/intake-pacing.ts. */
function RowIntake({
  wallet,
  useCase,
  queuePhase,
  attemptSignal,
  onReport,
  onStatus,
  onVerdict
}: {
  wallet: string;
  useCase: string;
  /* This row's slot in the bulk queue; undefined = never queued. */
  queuePhase: QueueItemPhase | undefined;
  /* Bumped by the queue when it is this row's turn to fire the POST. */
  attemptSignal: number;
  onReport: (outcome: IntakeAttemptOutcome) => void;
  onStatus: (status: IntakeStatus) => void;
  onVerdict: (patch: Partial<BatchRow>) => void;
}) {
  /* Verdict read lifecycle once the snapshot commits: waiting = deferred
     until the shared budget affords 1 unit (or a 429 said later); manual =
     auto attempts ran out, a button hands the read to the user instead of
     asking for a whole re-run. */
  const [verdict, setVerdict] = useState<{ mode: "idle" | "waiting" | "loading" | "manual"; atMs: number | null }>({
    mode: "idle",
    atMs: null
  });
  const verdictAttemptsRef = useRef(0);
  const verdictTimerRef = useRef<number | null>(null);
  const committedWalletRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (verdictTimerRef.current !== null) window.clearTimeout(verdictTimerRef.current);
    };
  }, []);

  function scheduleVerdictLoad(delayMs: number) {
    if (verdictTimerRef.current !== null) window.clearTimeout(verdictTimerRef.current);
    if (delayMs > 0) {
      setVerdict({ mode: "waiting", atMs: Date.now() + delayMs });
      verdictTimerRef.current = window.setTimeout(() => void loadVerdict(), delayMs);
    } else {
      void loadVerdict();
    }
  }

  async function loadVerdict() {
    const committedWallet = committedWalletRef.current;
    if (!committedWallet) return;
    /* Same gate as intake starts: never fire a read the ledger already
       knows the window cannot afford. */
    const wait = anonymousBudget.msUntilAffordable(DECISION_READ_UNITS);
    if (wait > 0) {
      scheduleVerdictLoad(wait);
      return;
    }
    setVerdict({ mode: "loading", atMs: null });
    try {
      /* Hold the unit while the read is in flight so a queued intake start
         cannot race this read into the same window at the boundary. */
      const response = await withReservedUnits(anonymousBudget, DECISION_READ_UNITS, () =>
        fetch(
          `/api/v1/decision/${encodeURIComponent(committedWallet)}?useCase=${encodeURIComponent(useCase)}&t=${Date.now()}`,
          { cache: "no-store" }
        )
      );
      anonymousBudget.recordSpend(DECISION_READ_UNITS);
      noteRateHeaders(response.headers);
      const body = await response.json().catch(() => null);
      const data = body?.data;
      if (response.ok && body?.ok === true && data?.decision) {
        onVerdict({
          status: "ok",
          wallet: typeof data.wallet === "string" ? data.wallet : committedWallet,
          username: data.username ?? null,
          decision: data.decision,
          score: data.score ?? null,
          riskLevel: data.riskLevel ?? null,
          recommendedLimit: data.recommendedLimit ?? null,
          reasons: Array.isArray(data.reasons) ? data.reasons : [],
          warnings: Array.isArray(data.warnings) ? data.warnings : [],
          note: null
        });
        return;
      }
      if (response.status === 429) {
        verdictAttemptsRef.current += 1;
        if (verdictAttemptsRef.current <= 2) {
          scheduleVerdictLoad(retryDelayMs(parseRetryAfterSeconds(response.headers), anonymousBudget, DECISION_READ_UNITS));
          return;
        }
      }
      setVerdict({ mode: "manual", atMs: null });
    } catch {
      setVerdict({ mode: "manual", atMs: null });
    }
  }

  const intake = useWalletIntake((committedWallet) => {
    committedWalletRef.current = committedWallet;
    verdictAttemptsRef.current = 0;
    scheduleVerdictLoad(anonymousBudget.msUntilAffordable(DECISION_READ_UNITS));
  });

  const { status, stage, message, limitKind, retryAfterSeconds } = intake.state;

  /* Report status up so the tally's bulk button can show live progress. */
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;
  useEffect(() => {
    onStatusRef.current(status);
  }, [status]);

  /* Queue-driven attempts: the engine bumps attemptSignal when it is this
     row's turn; fire once per bump and report the outcome back so the queue
     can advance, retry from Retry-After or stop on the daily cap. */
  const { start } = intake;
  const onReportRef = useRef(onReport);
  onReportRef.current = onReport;
  const handledSignalRef = useRef(0);
  useEffect(() => {
    if (attemptSignal === 0 || attemptSignal === handledSignalRef.current) return;
    handledSignalRef.current = attemptSignal;
    void (async () => {
      const outcome = await start(wallet);
      onReportRef.current(outcome);
    })();
  }, [attemptSignal, start, wallet]);

  /* The queue owns pacing while this row is waiting or attempting; manual
     clicks that hit ordinary window pacing resume by themselves when the
     countdown ends. */
  const queueOwnsRow = queuePhase?.phase === "waiting" || queuePhase?.phase === "attempting";
  const manualResumesRef = useRef(0);
  useEffect(() => {
    if (queueOwnsRow || status !== "cooldown" || limitKind !== "window") return;
    if (manualResumesRef.current >= 2) return;
    const delay = Math.max(1, retryAfterSeconds ?? 60) * 1000 + RETRY_MARGIN_MS;
    const timer = window.setTimeout(() => {
      manualResumesRef.current += 1;
      void start(wallet);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [queueOwnsRow, status, limitKind, retryAfterSeconds, start, wallet]);

  /* One countdown per row: verdict wait, queue wait or pacing wait. */
  const pacingTargetMs = useMemo(() => {
    if (verdict.atMs !== null) return verdict.atMs;
    if (queuePhase?.phase === "waiting") return queuePhase.attemptAtMs;
    if (!queueOwnsRow && status === "cooldown" && limitKind === "window" && retryAfterSeconds !== null) {
      return Date.now() + retryAfterSeconds * 1000;
    }
    return null;
  }, [verdict.atMs, queuePhase, queueOwnsRow, status, limitKind, retryAfterSeconds]);
  const countdown = useCountdownSeconds(pacingTargetMs);

  const quiet = "font-mono text-[0.68rem] uppercase tracking-[0.1em] text-quiet";
  const limited = "font-mono text-[0.68rem] uppercase tracking-[0.1em] text-limited";

  if (verdict.mode === "waiting") {
    return (
      <span className={`animate-pulse ${quiet}`} title="Verdict reads share the anonymous rate budget and load automatically.">
        indexed · verdict in {waitLabel(countdown)}
      </span>
    );
  }
  if (verdict.mode === "loading") {
    return <span className={`animate-pulse ${quiet}`}>indexed · fetching verdict...</span>;
  }
  if (verdict.mode === "manual") {
    return (
      <button
        type="button"
        onClick={() => void loadVerdict()}
        className="bt-index"
        title="Indexed. The verdict read kept hitting the shared rate budget; load it when ready."
      >
        load verdict
      </button>
    );
  }
  if (status === "starting" || status === "indexing") {
    return (
      <span className={`animate-pulse ${quiet}`}>
        indexing{stage ? ` · ${stage}` : "..."}
      </span>
    );
  }
  if (status === "committed") {
    return <span className={quiet}>indexed · fetching verdict...</span>;
  }
  if (status === "cooldown" && limitKind === "daily_cap") {
    return (
      <span className={limited} title={message ?? undefined}>
        daily indexing limit reached
      </span>
    );
  }
  if (status === "cooldown" && limitKind === "wallet_cooldown") {
    return (
      <span className={limited} title={message ?? undefined}>
        recently attempted · retry in {waitLabel(retryAfterSeconds)}
      </span>
    );
  }
  if (status === "cooldown") {
    /* Ordinary window pacing: the queue or this row's own resume timer
       retries by itself; only a paced-out row hands back to the button. */
    if (queuePhase?.phase === "settled" && queuePhase.reason === "rate_exhausted") {
      return (
        <button
          type="button"
          onClick={() => void start(wallet)}
          className="bt-index"
          title="Rate pacing kept rejecting this row. Try again in a fresh minute."
        >
          index now
        </button>
      );
    }
    return (
      <span className={`animate-pulse ${quiet}`} title="Anonymous indexing runs one wallet per minute.">
        paced · next attempt in {waitLabel(countdown)}
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className={limited} title={message ?? undefined}>
        indexing failed
      </span>
    );
  }
  if (status === "timeout") {
    return (
      <span className={limited} title={message ?? undefined}>
        still indexing · check back shortly
      </span>
    );
  }
  if (queuePhase?.phase === "waiting") {
    return (
      <span
        className={`animate-pulse ${quiet}`}
        title="Anonymous indexing runs one wallet per minute. This row starts automatically when its turn comes."
      >
        queued · starts in {waitLabel(countdown)}
      </span>
    );
  }
  if (queuePhase?.phase === "attempting") {
    return <span className={`animate-pulse ${quiet}`}>indexing...</span>;
  }
  if (queuePhase?.phase === "settled" && queuePhase.reason === "daily_cap") {
    return (
      <span className={limited} title="Anonymous callers can start 25 wallet scans per UTC day. This resets at UTC midnight.">
        daily limit reached
      </span>
    );
  }
  if (queuePhase?.phase === "settled" && queuePhase.reason === "rate_exhausted") {
    return (
      <button
        type="button"
        onClick={() => void start(wallet)}
        className="bt-index"
        title="Rate pacing kept rejecting this row. Try again in a fresh minute."
      >
        index now
      </button>
    );
  }
  return (
    <button type="button" onClick={() => void start(wallet)} className="bt-index">
      index now
    </button>
  );
}
