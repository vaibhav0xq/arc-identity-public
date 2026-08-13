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
  warnings
}: {
  index: string;
  title: string;
  sectionId: string;
  reasons: ReasonLike[];
  warnings: ReasonLike[];
}) {
  const rows: Array<ReasonLike & { advisory: boolean }> = [
    ...reasons.map((reason) => ({ ...reason, advisory: false })),
    ...warnings.map((warning) => ({ ...warning, advisory: true }))
  ];
  const metaParts = [
    `${String(reasons.length).padStart(2, "0")} finding${reasons.length === 1 ? "" : "s"}`,
    ...(warnings.length > 0 ? [`${String(warnings.length).padStart(2, "0")} advisor${warnings.length === 1 ? "y" : "ies"}`] : [])
  ];
  return (
    <section className="rpt-section" aria-labelledby={sectionId}>
      <ReportSectionHead index={index} kicker="Findings" title={title} titleId={sectionId} meta={metaParts.join(" · ")} />
      {rows.length === 0 ? (
        <div className="finding-row is-positive">
          <span className="finding-idx">01</span>
          <div className="min-w-0">
            <p className="finding-title"><i aria-hidden />No flags raised</p>
            <p className="finding-body">Every decision rule passed for this use case.</p>
          </div>
          <span className="chip green"><span className="dot" />clear</span>
        </div>
      ) : (
        rows.map((row, position) => (
          <div className={`finding-row ${severityClass(row.code, row.advisory)}`} key={row.code + row.message}>
            <span className="finding-idx">{String(position + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <p className="finding-title">
                <i aria-hidden />
                {reasonTitle(row.code)}
                {row.advisory ? <span className="font-mono text-[0.6rem] font-normal uppercase tracking-[0.1em] text-quiet">advisory</span> : null}
              </p>
              <p className="finding-body">{row.message}</p>
            </div>
            <span className="code-chip">{row.code}</span>
          </div>
        ))
      )}
    </section>
  );
}

/* ---- Chain coverage section (Phase 0) ---- */

function coverageChainMeta(chain: CoverageLike["chains"][number]): { note: string; code: string; severity: string } {
  /* Cache-fallback states: the chain serves cached indexed evidence while the
     CURRENT scan failed — say so instead of reporting the chain as healthy. */
  if (chain.status === "indexed" && chain.transient) {
    const cappedSuffix = chain.historyCapped === true ? " Provider history is also capped to the oldest rows, so totals are floors." : "";
    return {
      note: `Showing the most recent successful scan — the latest scan failed temporarily (timeout or rate limit) and Kyro retried automatically. Data may lag until a rescan succeeds.${cappedSuffix}`,
      code: "STALE_SCAN",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed" && chain.standing) {
    return {
      note: "Showing previously indexed evidence — the provider now reports a standing coverage restriction for this chain, so newer activity is invisible to Kyro. This is a coverage gap, not suspicion.",
      code: "STANDING_GAP",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed" && chain.historyCapped === true) {
    return {
      note: "Indexed, but provider history is capped to the oldest rows — activity totals are floors and recency on this chain is unreliable.",
      code: "CAPPED",
      severity: "is-notice"
    };
  }
  if (chain.status === "indexed") {
    return { note: "Fully indexed within provider limits.", code: "INDEXED", severity: "is-positive" };
  }
  if (chain.status === "no_activity") {
    return { note: "No on-chain activity observed for this wallet.", code: "NO_ACTIVITY", severity: "is-positive" };
  }
  if (chain.transient) {
    return {
      note: "Temporary provider failure on the last scan (timeout or rate limit). Kyro retried automatically; the chain counts as missing evidence until a rescan succeeds — never as healthy.",
      code: "TRANSIENT",
      severity: "is-notice"
    };
  }
  if (chain.standing) {
    return {
      note: "Standing provider plan gap — activity on this chain is invisible to Kyro. This is a coverage gap, not suspicion.",
      code: "STANDING_GAP",
      severity: "is-notice"
    };
  }
  if (chain.status === "not_configured") {
    return { note: "No provider configured for this chain in this deployment.", code: "NOT_CONFIGURED", severity: "is-advisory" };
  }
  if (chain.status === "limited") {
    return { note: "Provider coverage was limited on the last scan; the chain counts as missing evidence.", code: "LIMITED", severity: "is-notice" };
  }
  return { note: "Chain scan failed on the last refresh; the chain counts as missing evidence.", code: "ERROR", severity: "is-notice" };
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
              <span className="chain-note">{meta.note}</span>
            </div>
          );
        })}
      </div>
      {coverage.hasTransientIssues || coverage.historyCapped || coverage.hasStandingLimitations ? (
        <div className="report-note mt-6">
          <b>Limited coverage means limited confidence</b>
          Coverage gaps never count in a wallet&rsquo;s favor: unscanned chains read as missing evidence, and capped
          history totals are treated as floors, not full counts. A{" "}
          <code className="font-mono text-xs">DATA_LIMITED</code> flag means Kyro could not see enough to be
          confident — it describes the data, not the wallet.
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
      <div className="signal-cols">
        <div className="min-w-0">
          <p className="signal-head"><span>Signal present</span><span>{String(evidence.used.length).padStart(2, "0")}</span></p>
          {evidence.used.map((field) => (
            <div className="signal-row" key={`used-${field}`}>
              <span className="signal-dot" aria-hidden />
              <span className="truncate">{signalLabel(field)}</span>
              <code>{field}</code>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <p className="signal-head"><span>Signal missing</span><span>{String(evidence.missing.length).padStart(2, "0")}</span></p>
          {evidence.missing.length === 0 ? (
            <div className="signal-row">
              <span className="signal-dot" aria-hidden />
              <span className="text-mutedc">None. The full evidence set was available.</span>
            </div>
          ) : (
            evidence.missing.map((field) => (
              <div className="signal-row is-missing" key={`missing-${field}`}>
                <span className="signal-dot" aria-hidden />
                <span className="truncate">{signalLabel(field)}</span>
                <code>{field}</code>
              </div>
            ))
          )}
        </div>
      </div>
      {conservativeNote && evidence.missing.length > 0 ? (
        <div className="report-note mt-8">
          <b>Conservative by design</b>
          Missing evidence keeps the verdict conservative. Kyro never assumes absent data is healthy.
        </div>
      ) : null}
    </section>
  );
}
