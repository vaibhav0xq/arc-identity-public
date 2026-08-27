import type { ReactNode } from "react";

/* Shared presentational vocabulary for Decision Engine verdicts.
   Server-safe (no hooks, no client APIs, no server-only imports) so the live
   /check client and the /check/r/:id server page render the exact same
   report document from the same code — the two surfaces can never drift. */

export type ReasonLike = { code: string; message: string };

export type SnapshotLike = {
  wallet: string;
  username: string | null;
  useCase: string;
  decision: "allow" | "caution" | "block";
  riskLevel: string | null;
  recommendedLimit: { amountUsdc: number; currency: string; basis: string };
  reasons: ReasonLike[];
  warnings?: ReasonLike[];
  score: number | null;
  evidence: { used: string[]; missing: string[] };
  freshness: {
    cacheStatus: string | null;
    lastIndexedAt: string | null;
    refreshInProgress: boolean | null;
    refreshRecommended: boolean | null;
  };
  /* Phase 0: additive per-chain coverage. Optional — stored receipts strip
     it (volatile transient flags would break same-day receipt dedup). */
  coverage?: CoverageLike | null;
  scoreModelVersion: string | null;
  decisionModelVersion: string;
};

export type CoverageLike = {
  chains: Array<{
    chain: string;
    status: string;
    transient: boolean;
    standing: boolean;
    historyCapped: boolean | null;
    recencyReliable: boolean | null;
  }>;
  historyCapped: boolean;
  hasTransientIssues: boolean;
  hasStandingLimitations: boolean;
};

export const USE_CASE_LABELS: Record<string, string> = {
  payment: "Payment",
  escrow: "Escrow",
  lending: "Lending",
  marketplace: "Marketplace"
};

export const VERDICT_META: Record<SnapshotLike["decision"], { label: string; chip: string; tint: string; subline: string }> = {
  allow: {
    label: "ALLOW",
    chip: "chip green",
    tint: "#9fc4a6",
    subline: "Evidence is complete and fresh. Proceed within the recommended limit."
  },
  caution: {
    label: "CAUTION",
    chip: "chip amber",
    tint: "#d3b878",
    subline: "Proceed carefully. Review the findings below before transacting."
  },
  block: {
    label: "BLOCK",
    chip: "chip rose",
    tint: "#d8a396",
    subline: "Kyro recommends against transacting with this wallet."
  }
};

export function useCaseLabel(useCase: string) {
  return USE_CASE_LABELS[useCase] ?? useCase;
}

export function formatUtc(iso: string | null | undefined) {
  if (!iso) return "unknown";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "unknown";
  return parsed.toUTCString().replace(" GMT", " UTC");
}

export function shortWallet(wallet: string) {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

/* ---- Plain-language layer ----
   The workbench leads with a human answer; codes and raw fields stay one
   layer down. Deterministic templates only — nothing here guesses. */

const REASON_PRIORITY = [
  "SUSPICIOUS_TRUST_GRAPH",
  "HIGH_TRUST_ANOMALY",
  "HIGH_RISK_PENALTY",
  "BEHAVIORAL_RISK_ELEVATED",
  "SCORE_BELOW_THRESHOLD",
  "WALLET_TOO_NEW",
  "KYRO_TRUST_GRAPH_MISSING",
  "DATA_LIMITED",
  "DATA_STALE",
  "COVERAGE_LIMITED",
  "EVIDENCE_INCOMPLETE",
  "SCORE_MODEL_OUTDATED"
];

export function primaryReasonCode(reasons: ReasonLike[]): string | null {
  for (const code of REASON_PRIORITY) {
    if (reasons.some((reason) => reason.code === code)) return code;
  }
  return reasons[0]?.code ?? null;
}

/* One or two sentences that answer the reader's actual question — what did
   Kyro decide, why, and what does the limit mean. Rendered under the verdict
   label so nobody has to assemble the story from six finding rows. */
export function buildVerdictSummary(snapshot: SnapshotLike): string {
  const uc = useCaseLabel(snapshot.useCase).toLowerCase();
  const limit = `${snapshot.recommendedLimit.amountUsdc} ${snapshot.recommendedLimit.currency}`;
  const primary = primaryReasonCode(snapshot.reasons);
  if (snapshot.decision === "allow") {
    /* An allow with advisories means coverage was only partly seen — never
       claim a clean pass when part of the record went unread. */
    if ((snapshot.warnings ?? []).length > 0) {
      return `Nothing Kyro could see argues against this ${uc}, but coverage has gaps and unseen history never counts in a wallet's favor. Stay within ${limit}.`;
    }
    return `Nothing in the record argues against this ${uc}. Every decision rule passed. Stay within ${limit} and you are inside what the evidence supports.`;
  }
  if (snapshot.decision === "block") {
    if (primary === "SUSPICIOUS_TRUST_GRAPH" || primary === "HIGH_TRUST_ANOMALY") {
      return "The trust evidence around this wallet looks manufactured rather than earned. Kyro recommends not transacting.";
    }
    if (primary === "HIGH_RISK_PENALTY") {
      return "Risk signals on this wallet outweigh everything in its favor. Kyro recommends not transacting.";
    }
    return `The evidence weighs against this ${uc}. Kyro recommends not transacting.`;
  }
  switch (primary) {
    case "KYRO_TRUST_GRAPH_MISSING": {
      /* Qualify the record using the engine's own band, never a duplicated
         numeric bar that could drift from policy. */
      const strength = snapshot.riskLevel === "Trusted" ? "strong" : snapshot.riskLevel === "Reliable" ? "solid" : "real";
      return `The on-chain record is ${strength}, but no verified Kyro relationship vouches for this wallet yet. The ${uc} limit stays conservative at ${limit}.`;
    }
    case "SCORE_BELOW_THRESHOLD":
      return `The record is too thin to clear the bar for ${uc}. Until it deepens, the limit stays at ${limit}.`;
    case "WALLET_TOO_NEW":
      return `This wallet is too new to judge. There is almost no track record yet, so Kyro holds the ${uc} at ${limit} rather than guessing.`;
    case "DATA_LIMITED":
    case "COVERAGE_LIMITED":
      return `Kyro could not see enough of this wallet's record to vouch for more. Unseen history never counts in a wallet's favor, so the ${uc} limit stays at ${limit}.`;
    case "DATA_STALE":
      return `The record is real but out of date. Refresh before relying on it. Until then the ${uc} limit stays at ${limit}.`;
    case "EVIDENCE_INCOMPLETE":
      return `Key evidence is missing from this read, and missing evidence never counts in a wallet's favor. The ${uc} limit stays at ${limit}.`;
    case "SCORE_MODEL_OUTDATED":
      return `This wallet's score comes from an older model. Until it re-scores, the verdict stays conservative at ${limit}.`;
    case "BEHAVIORAL_RISK_ELEVATED":
      return `Recent activity patterns raised flags the rest of the record does not outweigh. Keep this ${uc} at ${limit} and read the findings.`;
    default:
      return `Something in the record is thin, stale or below the bar. The findings name it. The ${uc} limit stays at ${limit}.`;
  }
}

/* Short chip labels for the batch register; the raw code stays in the
   title attribute and the CSV export. */
const SHORT_FINDING_LABELS: Record<string, string> = {
  EVIDENCE_INCOMPLETE: "evidence gaps",
  KYRO_TRUST_GRAPH_MISSING: "no Kyro peers",
  DATA_LIMITED: "data limited",
  DATA_STALE: "stale data",
  COVERAGE_LIMITED: "coverage gaps",
  WALLET_TOO_NEW: "too new",
  SCORE_BELOW_THRESHOLD: "below the bar",
  SCORE_MEETS_THRESHOLD: "meets the bar",
  SCORE_MODEL_OUTDATED: "old score model",
  SUSPICIOUS_TRUST_GRAPH: "suspicious graph",
  HIGH_RISK_PENALTY: "high risk",
  HIGH_TRUST_ANOMALY: "trust anomaly",
  BEHAVIORAL_RISK_ELEVATED: "behavioral risk",
  DATA_PROVIDER_TRANSIENT: "provider blip",
  DATA_PROVIDER_UNSUPPORTED: "provider gap",
  DATA_NOT_INDEXED: "not indexed",
  DATA_HISTORY_CAPPED: "history capped"
};

export function shortFindingLabel(code: string) {
  return SHORT_FINDING_LABELS[code] ?? code.toLowerCase().replace(/_/g, " ");
}

/* Compact finding bodies for the live workbench: one clause, dynamic facts
   kept. The docs carry the full explanation; receipts keep the engine's full
   sentences. Truncation happens only at author-written boundaries — nothing
   here rewrites or guesses. */
const SHORT_FINDING_BODIES: Record<string, string> = {
  KYRO_TRUST_GRAPH_MISSING: "No verified peers or attestations on Kyro yet. The verdict stays conservative until they exist."
};

export function shortFindingBody(code: string, message: string): string {
  const mapped = SHORT_FINDING_BODIES[code];
  if (mapped) return mapped;
  const cut = message.split(/(?<=[.;:])\s+/)[0] ?? message;
  const trimmed = cut.replace(/[;:]$/, ".");
  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

export function relativeAge(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "unknown";
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 2) return "just now";
  if (mins < 90) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/* ---- Findings: humanized titles + severity classing ---- */

const REASON_TITLES: Record<string, string> = {
  EVIDENCE_INCOMPLETE: "Evidence incomplete",
  KYRO_TRUST_GRAPH_MISSING: "Kyro relationship evidence missing",
  DATA_LIMITED: "Wallet intelligence limited",
  DATA_STALE: "Wallet data is stale",
  COVERAGE_LIMITED: "Coverage limited",
  WALLET_TOO_NEW: "Wallet too new",
  SCORE_BELOW_THRESHOLD: "Score below the bar",
  SCORE_MEETS_THRESHOLD: "Score meets the bar",
  SCORE_MODEL_OUTDATED: "Score model outdated",
  SUSPICIOUS_TRUST_GRAPH: "Suspicious trust graph",
  HIGH_RISK_PENALTY: "High risk penalty applied",
  HIGH_TRUST_ANOMALY: "Trust anomaly detected",
  BEHAVIORAL_RISK_ELEVATED: "Behavioral risk elevated",
  DATA_PROVIDER_TRANSIENT: "Temporary provider failure",
  DATA_PROVIDER_UNSUPPORTED: "Standing provider gap",
  DATA_NOT_INDEXED: "Wallet not indexed yet",
  DATA_HISTORY_CAPPED: "History capped by provider"
};

const CRITICAL_CODES = new Set(["SUSPICIOUS_TRUST_GRAPH", "HIGH_RISK_PENALTY", "HIGH_TRUST_ANOMALY"]);
const POSITIVE_CODES = new Set(["SCORE_MEETS_THRESHOLD"]);

export function reasonTitle(code: string) {
  if (REASON_TITLES[code]) return REASON_TITLES[code];
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function severityClass(code: string, isAdvisory: boolean) {
  if (isAdvisory) return "is-advisory";
  if (POSITIVE_CODES.has(code)) return "is-positive";
  if (CRITICAL_CODES.has(code)) return "is-critical";
  return "is-notice";
}

/* ---- Evidence: humanized signal names ---- */

const SIGNAL_LABELS: Record<string, string> = {
  score: "Identity score",
  riskLevel: "Risk level",
  riskPenalty: "Risk penalty",
  scoreModelVersion: "Score model version",
  globalWalletAgeDays: "Wallet age (global)",
  cacheStatus: "Cache status",
  intelligenceStatus: "Intelligence status",
  refreshInProgress: "Refresh in progress",
  refreshRecommended: "Refresh recommended",
  lastIndexedAt: "Last indexed",
  trustGraph: "Trust graph",
  "trustGraph.trustConfidence": "Trust confidence"
};

export function signalLabel(field: string) {
  if (SIGNAL_LABELS[field]) return SIGNAL_LABELS[field];
  const last = field.split(".").pop() ?? field;
  const spaced = last.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* ---- Report scaffolding ---- */

export function ReportSectionHead({
  index,
  kicker,
  title,
  titleId,
  meta
}: {
  index: string;
  kicker: string;
  title: string;
  titleId?: string;
  meta?: ReactNode;
}) {
  return (
    <div className="rpt-head">
      <div className="min-w-0">
        <p className="rpt-kicker">{index} / {kicker}</p>
        <h3 id={titleId} className="rpt-title">{title}</h3>
      </div>
      {meta ? <span className="rpt-meta">{meta}</span> : null}
    </div>
  );
}

export function SpecRow({ label, value, mono = true, action }: { label: string; value: ReactNode; mono?: boolean; action?: ReactNode }) {
  return (
    <div className="spec-row">
      <dt>{label}</dt>
      <dd className={mono ? undefined : "sans"}>{value}</dd>
      {action ?? null}
    </div>
  );
}

/* ---- Verdict plate (dark credential seal, landing-scale) ---- */

export function VerdictPlate({
  snapshot,
  subline,
  kickerSuffix = "",
  headingId
}: {
  snapshot: SnapshotLike;
  subline: string;
  kickerSuffix?: string;
  headingId: string;
}) {
  const meta = VERDICT_META[snapshot.decision] ?? VERDICT_META.caution;
  return (
    <section className="credential-plate verdict-plate min-w-0" aria-labelledby={headingId}>
      <div className="plate-kicker-row">
        <p className="kicker" style={{ color: "#b8bdb2" }}>
          Decision Engine / {useCaseLabel(snapshot.useCase)} verdict{kickerSuffix}
        </p>
        <span className={meta.chip}><span className="dot" />{snapshot.decision}</span>
      </div>
      <h2 id={headingId} className="plate-verdict" style={{ color: meta.tint }}>
        {meta.label}
      </h2>
      <p className="plate-sub">{subline}</p>
      <div className="plate-stats cols-4">
        <div>
          <p className="stat-label">Recommended limit</p>
          <p className="stat-value gold">
            {snapshot.recommendedLimit.amountUsdc}
            <span className="ml-2 align-middle font-mono text-[0.62rem] font-medium tracking-[0.1em] text-[#a0a69a]">
              {snapshot.recommendedLimit.currency}
            </span>
          </p>
        </div>
        <div>
          <p className="stat-label">Risk level</p>
          <p className="stat-value">{snapshot.riskLevel ?? "Unknown"}</p>
        </div>
        <div>
          <p className="stat-label">Identity score</p>
          <p className="stat-value">{snapshot.score ?? "N/A"}</p>
        </div>
        <div>
          <p className="stat-label">Advisories</p>
          <p className="stat-value">{String(snapshot.warnings?.length ?? 0).padStart(2, "0")}</p>
        </div>
      </div>
      <div className="plate-basis">
        <span>Basis</span>
        <p>{snapshot.recommendedLimit.basis}</p>
      </div>
      <div className="plate-meta">
        <span className="min-w-0 truncate font-mono">{snapshot.username ?? snapshot.wallet}</span>
        <span>{snapshot.decisionModelVersion}</span>
      </div>
    </section>
  );
}

/* ---- Findings section ---- */

export function FindingsSection({
  index,
  title,
  sectionId,
  reasons,
  warnings,
  groupAdvisories = false,
  compact = false
}: {
  index: string;
  title: string;
  sectionId: string;
  reasons: ReasonLike[];
  warnings: ReasonLike[];
  /* Live workbench: decisive reasons stay up top, advisory data notes fold
     into a quiet expandable group — they describe the data, not the wallet.
     Receipts keep the flat document list. */
  groupAdvisories?: boolean;
  /* Live workbench: one-clause finding bodies (docs hold the detail).
     Receipts keep the engine's full sentences. */
  compact?: boolean;
}) {
  const reasonRows: Array<ReasonLike & { advisory: boolean }> = reasons.map((reason) => ({ ...reason, advisory: false }));
  const advisoryRows: Array<ReasonLike & { advisory: boolean }> = warnings.map((warning) => ({ ...warning, advisory: true }));
  const split = groupAdvisories && advisoryRows.length > 0;
  const rows = split ? reasonRows : [...reasonRows, ...advisoryRows];
  const metaParts = [
    `${String(reasons.length).padStart(2, "0")} finding${reasons.length === 1 ? "" : "s"}`,
    ...(warnings.length > 0 ? [`${String(warnings.length).padStart(2, "0")} advisor${warnings.length === 1 ? "y" : "ies"}`] : [])
  ];
  const renderRow = (row: ReasonLike & { advisory: boolean }, position: number) => (
    <div className={`finding-row ${severityClass(row.code, row.advisory)}`} key={row.code + row.message}>
      <span className="finding-idx">{String(position + 1).padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="finding-title">
          <i aria-hidden />
          {reasonTitle(row.code)}
          {row.advisory ? <span className="font-mono text-[0.6rem] font-normal uppercase tracking-[0.1em] text-quiet">advisory</span> : null}
        </p>
        <p className="finding-body">{compact ? shortFindingBody(row.code, row.message) : row.message}</p>
      </div>
      <span className="code-chip">{row.code}</span>
    </div>
  );
  return (
    <section className="rpt-section" aria-labelledby={sectionId}>
      <ReportSectionHead index={index} kicker="Findings" title={title} titleId={sectionId} meta={metaParts.join(" · ")} />
      {rows.length === 0 ? (
        split ? (
          /* Advisories exist, so this is not an unqualified pass — say what
             the fold below holds instead of stamping the report "clear". */
          <div className="finding-row is-positive">
            <span className="finding-idx">01</span>
            <div className="min-w-0">
              <p className="finding-title"><i aria-hidden />No decisive flags</p>
              <p className="finding-body">
                No decision rule failed. The data notes below cover what Kyro could not see.
              </p>
            </div>
          </div>
        ) : (
          <div className="finding-row is-positive">
            <span className="finding-idx">01</span>
            <div className="min-w-0">
              <p className="finding-title"><i aria-hidden />No flags raised</p>
              <p className="finding-body">Every decision rule passed for this use case.</p>
            </div>
            <span className="chip green"><span className="dot" />clear</span>
          </div>
        )
      ) : (
        rows.map((row, position) => renderRow(row, position))
      )}
      {split ? (
        <details className="data-notes">
          <summary>
            Data notes · {String(advisoryRows.length).padStart(2, "0")}
            <span className="dn-sub">what Kyro could and could not see: about the data, not the wallet</span>
          </summary>
          {advisoryRows.map((row, position) => renderRow(row, reasonRows.length + position))}
        </details>
      ) : null}
    </section>
  );
}

/* ---- Chain coverage section (Phase 0) ---- */

function coverageChainMeta(chain: CoverageLike["chains"][number]): { note: string; short: string; code: string; severity: string } {
  /* Cache-fallback states: the chain serves cached indexed evidence while the
     CURRENT scan failed — say so instead of reporting the chain as healthy.
     `short` is the one-line table reading; `note` is the full explanation
     that lives in the shared status legend. */
  if (chain.status === "indexed" && chain.transient) {
    const cappedSuffix = chain.historyCapped === true ? " Provider history is also capped to the oldest rows, so totals are floors." : "";
    return {
      note: `Showing the most recent successful scan. The latest scan failed temporarily (timeout or rate limit) and Kyro retried automatically. Data may lag until a rescan succeeds.${cappedSuffix}`,
      short: chain.historyCapped === true ? "indexed · showing last good scan · history capped" : "indexed · showing last good scan",
      code: "STALE_SCAN",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed" && chain.standing) {
    return {
      note: "Showing previously indexed evidence. The provider now reports a standing coverage restriction for this chain, so newer activity is invisible to Kyro. This is a coverage gap, not suspicion.",
      short: "indexed · provider gap: newer activity invisible",
      code: "STANDING_GAP",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed" && chain.historyCapped === true) {
    return {
      note: "Indexed, but provider history is capped to the oldest rows, so activity totals are floors and recency on this chain is unreliable.",
      short: "indexed · history capped: totals are floors",
      code: "CAPPED",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed") {
    return { note: "Fully indexed within provider limits.", short: "fully indexed", code: "INDEXED", severity: "is-positive" };
  }
  if (chain.status === "no_activity") {
    return { note: "No on-chain activity observed for this wallet.", short: "no activity observed", code: "NO_ACTIVITY", severity: "is-positive" };
  }
  if (chain.transient) {
    return {
      note: "Temporary provider failure on the last scan (timeout or rate limit). Kyro retried automatically; the chain counts as missing evidence until a rescan succeeds, never as healthy.",
      short: "scan failed temporarily: counts as missing evidence",
      code: "TRANSIENT",
      severity: "is-notice"
    };
  }
  if (chain.standing) {
    return {
      note: "Standing provider plan gap: activity on this chain is invisible to Kyro. This is a coverage gap, not suspicion.",
      short: "provider gap: counts as missing evidence",
      code: "STANDING_GAP",
      severity: "is-notice"
    };
  }
  if (chain.status === "not_configured") {
    return { note: "No provider configured for this chain in this deployment.", short: "no provider configured", code: "NOT_CONFIGURED", severity: "is-advisory" };
  }
  if (chain.status === "limited") {
    return { note: "Provider coverage was limited on the last scan; the chain counts as missing evidence.", short: "limited scan: counts as missing evidence", code: "LIMITED", severity: "is-notice" };
  }
  return { note: "Chain scan failed on the last refresh; the chain counts as missing evidence.", short: "scan failed: counts as missing evidence", code: "ERROR", severity: "is-notice" };
}

export function CoverageSection({
  index,
  title,
  sectionId,
  coverage
}: {
  index: string;
  title: string;
  sectionId: string;
  coverage: CoverageLike | null | undefined;
}) {
  if (!coverage || coverage.chains.length === 0) return null;
  const flagged = coverage.chains.filter(
    (chain) => chain.transient || chain.standing || chain.historyCapped === true || (chain.status !== "indexed" && chain.status !== "no_activity")
  ).length;
  return (
    <section className="rpt-section" aria-labelledby={sectionId}>
      <ReportSectionHead
        index={index}
        kicker="Chain coverage"
        title={title}
        titleId={sectionId}
        meta={flagged === 0 ? "all chains healthy" : `${String(flagged).padStart(2, "0")} chain${flagged === 1 ? "" : "s"} flagged`}
      />
      <div className="chain-grid">
        <div className="chain-row head" aria-hidden>
          <span>Chain</span>
          <span>Status</span>
          <span className="chain-note">Reading</span>
        </div>
        {coverage.chains.map((chain) => {
          const meta = coverageChainMeta(chain);
          return (
            <div className={`chain-row ${meta.severity}`} key={chain.chain}>
              <span className="chain-name"><i aria-hidden />{chain.chain}</span>
              <span className="code-chip">{meta.code}</span>
              <span className="chain-note">{meta.short}</span>
            </div>
          );
        })}
      </div>
      {(() => {
        /* One shared legend instead of repeating the same two-line paragraph
           on every capped chain — full explanations, each status once. */
        const legend = new Map<string, string>();
        for (const chain of coverage.chains) {
          const meta = coverageChainMeta(chain);
          if (!legend.has(meta.code)) legend.set(meta.code, meta.note);
        }
        return legend.size > 0 ? (
          <details className="data-notes">
            <summary>
              What these statuses mean
              <span className="dn-sub">{legend.size} status{legend.size === 1 ? "" : "es"} in this scan</span>
            </summary>
            {Array.from(legend.entries()).map(([code, note]) => (
              <div className="legend-note" key={code}>
                <span className="code-chip">{code}</span>
                <span>{note}</span>
              </div>
            ))}
          </details>
        ) : null;
      })()}
      {coverage.hasTransientIssues || coverage.historyCapped || coverage.hasStandingLimitations ? (
        <div className="report-note mt-6">
          <b>Limited coverage means limited confidence</b>
          Coverage gaps never count in a wallet&rsquo;s favor: unscanned chains read as missing evidence, and capped
          history totals are treated as floors, not full counts. A{" "}
          <code className="font-mono text-xs">DATA_LIMITED</code> flag means Kyro could not see enough to be
          confident. It describes the data, not the wallet.
        </div>
      ) : null}
    </section>
  );
}

/* ---- Evidence section (coverage strip + signal table) ---- */

export function EvidenceSection({
  index,
  title,
  sectionId,
  evidence,
  conservativeNote
}: {
  index: string;
  title: string;
  sectionId: string;
  evidence: { used: string[]; missing: string[] };
  conservativeNote: boolean;
}) {
  const total = evidence.used.length + evidence.missing.length;
  const coverage = total > 0 ? Math.round((evidence.used.length / total) * 100) : 0;
  return (
    <section className="rpt-section" aria-labelledby={sectionId}>
      <ReportSectionHead
        index={index}
        kicker="Evidence"
        title={title}
        titleId={sectionId}
        meta={evidence.missing.length > 0 ? "partial evidence set" : "full evidence set"}
      />
      <div className="cov-strip">
        <div>
          <p className="cov-num">
            {evidence.used.length}
            <span> / {total}</span>
          </p>
          <p className="cov-label">signals present · coverage {coverage}%</p>
        </div>
        <div className="sig-bar" aria-hidden>
          {Array.from({ length: total }, (_, cell) => (
            <i key={cell} className={cell < evidence.used.length ? undefined : "off"} />
          ))}
        </div>
      </div>
      {(() => {
        /* Grouped by what the signals mean, not by present/missing — twelve
           debug rows become three readable clusters. Missing signals sit in
           their group, marked, so the gap is visible in context. */
        const SIGNAL_GROUPS: Array<{ title: string; fields: string[] }> = [
          { title: "Score & identity", fields: ["score", "riskLevel", "riskPenalty", "scoreModelVersion", "globalWalletAgeDays"] },
          { title: "Data freshness", fields: ["cacheStatus", "intelligenceStatus", "refreshInProgress", "refreshRecommended", "lastIndexedAt"] },
          { title: "Trust relationships", fields: ["trustGraph", "trustGraph.trustConfidence"] }
        ];
        const used = new Set(evidence.used);
        const missingSet = new Set(evidence.missing);
        const all = [...evidence.used, ...evidence.missing];
        const grouped = SIGNAL_GROUPS.map((group) => ({
          title: group.title,
          fields: group.fields.filter((field) => used.has(field) || missingSet.has(field))
        })).filter((group) => group.fields.length > 0);
        const covered = new Set(grouped.flatMap((group) => group.fields));
        const leftovers = all.filter((field) => !covered.has(field));
        if (leftovers.length > 0) grouped.push({ title: "Other signals", fields: leftovers });
        return (
          <div className="mt-2">
            {grouped.map((group) => {
              const present = group.fields.filter((field) => used.has(field)).length;
              return (
                <div className="sig-group" key={group.title}>
                  <p className="sig-group-head">
                    <span>{group.title}</span>
                    <span>{present}/{group.fields.length}</span>
                  </p>
                  {group.fields.map((field) => {
                    const isMissing = missingSet.has(field);
                    return (
                      <div className={`signal-row${isMissing ? " is-missing" : ""}`} key={field}>
                        <span className="signal-dot" aria-hidden />
                        <span className="truncate">
                          {signalLabel(field)}
                          {isMissing ? <span className="miss-tag"> · missing</span> : null}
                        </span>
                        <code>{field}</code>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}
      {conservativeNote && evidence.missing.length > 0 ? (
        <div className="report-note mt-8">
          <b>Conservative by design</b>
          Missing evidence keeps the verdict conservative. Kyro never assumes absent data is healthy.
        </div>
      ) : null}
    </section>
  );
}
