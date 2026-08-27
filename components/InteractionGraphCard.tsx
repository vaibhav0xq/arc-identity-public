"use client";

import type {
  InteractionGraph,
  InteractionGraphCoverageStatus
} from "@/lib/types";
import { InteractionGraphLedger, InteractionGraphVisual, type InteractionGraphPeerEdge } from "@/components/InteractionGraphVisual";
import { shortenAddress } from "@/lib/wallet";

type InteractionGraphCardProps = {
  graph: InteractionGraph | null;
  /** Transaction-verified peer↔peer trust edges for the same wallet, if the caller has them. */
  peerEdges?: InteractionGraphPeerEdge[] | null;
  loading?: boolean;
  error?: boolean | string;
  loadingMore?: boolean;
  pageError?: string | null;
  onLoadMore?: (() => void) | null;
  title?: string;
  description?: string;
  variant?: "dashboard" | "public";
};

function statusLabel(status: InteractionGraphCoverageStatus) {
  return status.replaceAll("_", " ");
}

function statusTone(status: InteractionGraphCoverageStatus) {
  if (status === "complete") return "border-verified/45 bg-verified-bg text-verified";
  if (status === "partial" || status === "indexing") return "border-limited/45 bg-limited-bg text-limited";
  if (status === "unavailable") return "border-risk/35 bg-risk-bg text-risk";
  return "border-linec bg-paper-deep text-mutedc";
}

function observedLabel(value: string | null) {
  if (!value) return "Observation time unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Observation time unavailable" : `Observed ${date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`;
}

function EmptyState({ status }: { status?: InteractionGraphCoverageStatus }) {
  /* "No observed counterparties" is only an honest claim when indexing
     actually ran (complete/partial coverage). Every other state means
     "not indexed yet", never "no interactions". */
  const copy = status === "complete"
    ? ["No observed counterparties", "Indexing completed and no counterparties were found in the saved snapshot."]
    : status === "partial"
      ? ["No observed counterparties saved so far", "Indexed coverage is partial, so this is a lower-bound view, not a confirmed empty result."]
      : status === "indexing"
        ? ["Interaction evidence is indexing", "This wallet has not been indexed as a center wallet yet. Indexing is in progress. Counterparties appear when the snapshot is persisted."]
        : status === "unavailable"
          ? ["Interaction evidence unavailable", "The source snapshot could not be read. No relationship is inferred from this state."]
          : ["Not indexed as a center wallet yet", "This wallet has not been indexed as a center wallet yet. Absence here does not mean absence of onchain activity."];
  return <div className="mt-6 border border-dashed border-linec bg-paper-deep/45 px-5 py-9 text-center sm:px-8"><div className="mx-auto flex h-10 w-10 items-center justify-center border border-gold/40 bg-gold-bg font-mono text-xs text-gold" aria-hidden="true">—</div><p className="mt-4 font-heading text-2xl font-semibold text-ink">{copy[0]}</p><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-mutedc">{copy[1]}</p></div>;
}

export function InteractionGraphCard({
  graph,
  peerEdges = null,
  loading = false,
  error = false,
  loadingMore = false,
  pageError = null,
  onLoadMore = null,
  title = "Interaction evidence",
  description = "A visual map of unique observed onchain counterparties from saved evidence. Observations are not trust endorsements and do not affect score.",
  variant = "dashboard"
}: InteractionGraphCardProps) {
  const errorMessage = typeof error === "string" ? error : "The interaction evidence could not be loaded.";

  return (
    <section className="r4-panel min-w-0" aria-labelledby="interaction-graph-title">
      <div className="flex flex-col gap-4 border-b border-linec pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="arc-section-label">Observed network / {variant === "public" ? "public record" : "wallet workspace"}</p>
          <h2 id="interaction-graph-title" className="mt-2.5 text-2xl font-extrabold text-ink">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-mutedc">{description}</p>
          {graph ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 font-mono text-[0.59rem] uppercase tracking-[0.09em] text-quiet">
              <span>{shortenAddress(graph.walletAddress)}</span>
              <span aria-hidden="true">·</span>
              <span>{observedLabel(graph.coverage.observedAt)}</span>
              {graph.coverage.stale ? <span className="border border-limited/45 bg-limited-bg px-2 py-1 text-limited">Stale snapshot</span> : null}
              {graph.coverage.historyCapped ? <span className="border border-limited/45 bg-limited-bg px-2 py-1 text-limited">History capped</span> : null}
            </div>
          ) : null}
        </div>
        {graph ? <span className={`w-fit shrink-0 rounded-[2px] border px-2.5 py-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] ${statusTone(graph.coverage.status)}`}><span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current align-middle" />{statusLabel(graph.coverage.status)}</span> : null}
      </div>

      {loading ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading interaction evidence">
          <div className="skeleton h-14 w-full" /><div className="grid gap-3 sm:grid-cols-3"><div className="skeleton h-20" /><div className="skeleton h-20" /><div className="skeleton h-20" /></div><div className="skeleton h-24 w-full" />
        </div>
      ) : error ? (
        <div role="alert" className="mt-6 border border-risk/35 bg-risk-bg px-5 py-4 text-sm leading-relaxed text-risk"><strong>Evidence unavailable.</strong> {errorMessage}</div>
      ) : !graph ? (
        <EmptyState />
      ) : (
        <>
          <InteractionGraphVisual
            graph={graph}
            rootLabel={variant === "public" ? "Kyro identity" : "You"}
            peerEdges={peerEdges}
            className="mt-4"
          />

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-y border-linec py-3 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-mutedc" aria-label="Interaction snapshot summary">
            <span><strong className="mr-1.5 text-sm text-ink">{graph.summary.totalCounterparties}</strong> observed</span>
            <span><strong className="mr-1.5 text-sm text-ink">{graph.summary.chainsWithCounterparties}</strong> networks</span>
            <span><strong className="mr-1.5 text-sm text-ink">{graph.summary.kyroProfilesOnPage}</strong> Kyro profiles</span>
            {graph.nodes.length ? (
              <span className="basis-full normal-case tracking-normal text-quiet sm:ml-auto sm:basis-auto">
                {graph.pagination.hasMore ? `${graph.nodes.length} loaded; more saved records available` : "Showing all observed counterparties"}
              </span>
            ) : null}
          </div>

          {graph.nodes.length === 0 ? <EmptyState status={graph.coverage.status} /> : (
            <InteractionGraphLedger nodes={graph.nodes} className="mt-4" />
          )}

          {graph.pagination.hasMore && onLoadMore ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-linec pt-4">
              <button
                type="button"
                onClick={onLoadMore}
                disabled={loadingMore}
                className="arc-button-secondary px-4 py-2 text-sm font-bold disabled:cursor-wait disabled:opacity-60"
              >
                {loadingMore ? "Loading saved records..." : "Load more counterparties"}
              </button>
              <span className="font-mono text-[0.65rem] text-mutedc">
                {graph.nodes.length} of {graph.summary.totalCounterparties} displayed
              </span>
            </div>
          ) : null}
          {pageError ? <p role="alert" className="mt-3 text-xs leading-5 text-risk">{pageError}</p> : null}
          <details className="group mt-5 border-t border-linec pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-mono text-[0.62rem] font-bold uppercase tracking-[0.1em] text-mutedc [&::-webkit-details-marker]:hidden">
              <span>Coverage and limitations</span>
              <span className="transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            </summary>
            <div className="mt-3 grid gap-2 text-xs leading-relaxed text-mutedc">
              {graph.explanations.slice(0, 3).map((explanation, index) => <p key={`${index}-${explanation}`} className="border-l-2 border-gold/45 pl-3">{explanation}</p>)}
              {graph.coverage.hasStandingLimitations ? <p className="border-l-2 border-limited pl-3 text-limited">Some chain coverage has standing limitations.</p> : null}
              {graph.coverage.hasTransientIssues ? <p className="border-l-2 border-limited pl-3 text-limited">Some chain providers reported a transient issue.</p> : null}
              <p className="mt-1 text-[0.68rem] leading-relaxed text-quiet">Per-counterparty counts, direction and first/last seen appear where captured; older snapshots show them after the next refresh. Value and asset details are not available in this evidence view.</p>
            </div>
          </details>
        </>
      )}
    </section>
  );
}