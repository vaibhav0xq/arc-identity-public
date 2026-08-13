"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import {
  CoverageSection,
  EvidenceSection,
  FindingsSection,
  VERDICT_META,
  formatUtc,
  shortWallet,
  useCaseLabel,
  type SnapshotLike
} from "@/components/VerdictReport";

/* Live-only decision workbench.

   After a check runs, /check switches from a scrolling document to a
   two-column console: sticky verdict rail on the left, tabbed detail panels
   on the right. Receipt pages deliberately do NOT use this — a receipt is a
   frozen snapshot document (VerdictReport.tsx renders that register); the
   workbench is the interactive instrument for a live verdict.

   Purely presentational: the only state here is which tab is open. All data
   fetching, receipt minting and intake actions stay in KyroCheckClient and
   arrive as props/slots, so decision behavior cannot drift from this file. */

type TabId = "findings" | "evidence" | "coverage" | "provenance";

export function DecisionWorkbench({
  result,
  notice,
  railActions
}: {
  result: SnapshotLike;
  /* Rendered at the top of the detail column, above the tabs — for the
     one thing the reader must not miss (e.g. the unindexed-wallet intake). */
  notice?: ReactNode;
  railActions?: ReactNode;
}) {
  const verdict = VERDICT_META[result.decision] ?? VERDICT_META.caution;
  const advisories = result.warnings?.length ?? 0;
  const findingsCount = result.reasons.length + advisories;
  const evidenceTotal = result.evidence.used.length + result.evidence.missing.length;
  const hasCoverage = Boolean(result.coverage && result.coverage.chains.length > 0);
  const flaggedChains = hasCoverage
    ? result.coverage!.chains.filter(
        (chain) =>
          chain.transient ||
          chain.standing ||
          chain.historyCapped === true ||
          (chain.status !== "indexed" && chain.status !== "no_activity")
      ).length
    : 0;

  const tabs: Array<{ id: TabId; label: string; count: string | null }> = [
    { id: "findings", label: "Findings", count: String(findingsCount).padStart(2, "0") },
    { id: "evidence", label: "Evidence", count: `${result.evidence.used.length}/${evidenceTotal}` },
    ...(hasCoverage
      ? [{ id: "coverage" as TabId, label: "Coverage", count: flaggedChains > 0 ? String(flaggedChains).padStart(2, "0") : "ok" }]
      : []),
    { id: "provenance", label: "Provenance", count: null }
  ];

  const [tab, setTab] = useState<TabId>("findings");
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  /* Coverage can drop out between checks while the tab id lingers in state —
     fall back to findings instead of showing an empty panel. */
  const active: TabId = tabs.some((candidate) => candidate.id === tab) ? tab : "findings";

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const position = tabs.findIndex((candidate) => candidate.id === active);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : event.key === "ArrowLeft"
            ? (position - 1 + tabs.length) % tabs.length
            : (position + 1) % tabs.length;
    const target = tabs[next].id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  return (
    <div className="wb-grid">
      {/* ── Left: sticky decision summary rail ── */}
      <aside className="wb-rail min-w-0">
        <section className="credential-plate rail-plate min-w-0" aria-labelledby="check-verdict">
          <div className="plate-kicker-row">
            <p className="kicker" style={{ color: "#b8bdb2" }}>
              {useCaseLabel(result.useCase)} verdict
            </p>
            <span className={verdict.chip}>
              <span className="dot" />
              {result.decision}
            </span>
          </div>
          <h2 id="check-verdict" className="rail-verdict" style={{ color: verdict.tint }}>
            {verdict.label}
          </h2>
          <p className="rail-sub">{verdict.subline}</p>
          <dl className="rail-stats">
            <div className="rail-stat">
              <dt>Recommended limit</dt>
              <dd className="gold">
                {result.recommendedLimit.amountUsdc} <span>{result.recommendedLimit.currency}</span>
              </dd>
            </div>
            <div className="rail-stat">
              <dt>Risk level</dt>
              <dd>{result.riskLevel ?? "Unknown"}</dd>
            </div>
            <div className="rail-stat">
              <dt>Identity score</dt>
              <dd>{result.score ?? "N/A"}</dd>
            </div>
            <div className="rail-stat">
              <dt>Advisories</dt>
              <dd>{String(advisories).padStart(2, "0")}</dd>
            </div>
            <div className="rail-stat">
              <dt>Freshness</dt>
              <dd className="small">
                {result.freshness.cacheStatus ?? "unknown"}
                {result.freshness.refreshRecommended ? " · refresh advised" : ""}
              </dd>
            </div>
          </dl>
          <p className="rail-note">{result.recommendedLimit.basis}</p>
          <div className="rail-id">
            <p className="name">{result.username ?? shortWallet(result.wallet)}</p>
            <p className="addr">{result.wallet}</p>
            {result.username ? (
              <Link href={`/profile/${encodeURIComponent(result.username)}`} className="rail-link">
                View full profile →
              </Link>
            ) : null}
          </div>
          {railActions}
          <div className="plate-meta">
            <span>{result.decisionModelVersion}</span>
            <span>live verdict</span>
          </div>
        </section>
      </aside>

      {/* ── Right: tabbed detail panels ── */}
      <div className="wb-main">
        {notice}
        <div className="wb-tabs" role="tablist" aria-label="Verdict detail">
          {tabs.map((candidate) => (
            <button
              key={candidate.id}
              ref={(el) => {
                tabRefs.current[candidate.id] = el;
              }}
              type="button"
              role="tab"
              id={`wb-tab-${candidate.id}`}
              aria-selected={active === candidate.id}
              aria-controls={`wb-panel-${candidate.id}`}
              tabIndex={active === candidate.id ? 0 : -1}
              className="wb-tab"
              onClick={() => setTab(candidate.id)}
              onKeyDown={onTabKeyDown}
            >
              {candidate.label}
              {candidate.count ? <b>{candidate.count}</b> : null}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id="wb-panel-findings"
          aria-labelledby="wb-tab-findings"
          hidden={active !== "findings"}
          className="wb-panel"
        >
          <FindingsSection
            index=""
            title="Why this verdict"
            sectionId="check-reasons-title"
            reasons={result.reasons}
            warnings={result.warnings ?? []}
          />
        </div>

        <div
          role="tabpanel"
          id="wb-panel-evidence"
          aria-labelledby="wb-tab-evidence"
          hidden={active !== "evidence"}
          className="wb-panel"
        >
          <EvidenceSection
            index=""
            title="What the verdict is built on"
            sectionId="check-evidence-title"
            evidence={result.evidence}
            conservativeNote
          />
        </div>

        {hasCoverage ? (
          <div
            role="tabpanel"
            id="wb-panel-coverage"
            aria-labelledby="wb-tab-coverage"
            hidden={active !== "coverage"}
            className="wb-panel"
          >
            <CoverageSection
              index=""
              title="What Kyro could and could not see"
              sectionId="check-coverage-title"
              coverage={result.coverage}
            />
          </div>
        ) : null}

        <div
          role="tabpanel"
          id="wb-panel-provenance"
          aria-labelledby="wb-tab-provenance"
          hidden={active !== "provenance"}
          className="wb-panel"
        >
          <section className="rpt-section" aria-labelledby="check-provenance-title">
            <h3 id="check-provenance-title" className="sr-only">
              Where this data stands
            </h3>
            <dl className="spec-grid">
              <div className="spec-cell">
                <dt>Wallet</dt>
                <dd>{result.wallet}</dd>
              </div>
              <div className="spec-cell">
                <dt>Data freshness</dt>
                <dd>
                  {result.freshness.cacheStatus ?? "unknown"}
                  {result.freshness.refreshInProgress ? <span className="text-limited"> · refresh in progress</span> : null}
                  {result.freshness.refreshRecommended ? <span className="text-limited"> · refresh recommended</span> : null}
                </dd>
              </div>
              <div className="spec-cell">
                <dt>Last indexed</dt>
                <dd>{result.freshness.lastIndexedAt ? formatUtc(result.freshness.lastIndexedAt) : "never indexed"}</dd>
              </div>
              <div className="spec-cell">
                <dt>Score model</dt>
                <dd>{result.scoreModelVersion ?? "unknown"}</dd>
              </div>
              <div className="spec-cell">
                <dt>Decision model</dt>
                <dd>{result.decisionModelVersion}</dd>
              </div>
              <div className="spec-cell">
                <dt>Use case</dt>
                <dd>{useCaseLabel(result.useCase)}</dd>
              </div>
            </dl>
            <p className="api-line mt-4">
              Live read from <code className="font-mono text-xs">GET /api/v1/decision/:wallet</code> — the same verdict
              the API returns.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
