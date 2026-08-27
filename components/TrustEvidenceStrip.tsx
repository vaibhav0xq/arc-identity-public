"use client";

import { useState } from "react";
import Link from "next/link";
import type { TrustEdge, TrustGraph } from "@/lib/types";
import type { TrustGraphDisplaySource } from "@/lib/trust-graph-display";
import { RelationshipDrawer } from "@/components/RelationshipDrawer";
import { shortenAddress } from "@/lib/wallet";

/** Compact verified-attestation evidence layer shared by the public profile
    and the signed-in dashboard. Graph consolidation: the interaction map
    above is the primary graph; this strip is deliberately demoted to a small
    evidence layer under it — mono kicker head, hairline rule, one merged
    meta line — so it never reads as a second graph section. Rows come from
    an already-fetched trust graph; the only network request happens inside
    RelationshipDrawer once a row is opened. Cached data must stay visibly
    cached (quiet, but explicit), so the surface that owns the fetch passes
    live/cached provenance in as props. */

const VISIBLE_ROWS = 5;

function ageLabel(value: string | null) {
  if (!value) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function trustObservedAtLabel(value: string | null | undefined) {
  if (!value) return "an earlier session";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "an earlier session";
  return timestamp.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function peerFallbackLabel(edge: TrustEdge) {
  return shortenAddress(edge.peerWallet ?? edge.targetWallet);
}

export function TrustEvidenceStrip({
  graph,
  source = "live",
  observedAt = null
}: {
  graph?: TrustGraph | null;
  source?: TrustGraphDisplaySource;
  observedAt?: string | null;
}) {
  const [activeEdge, setActiveEdge] = useState<TrustEdge | null>(null);
  if (!graph || graph.edges.length === 0) return null;

  const { metrics } = graph;
  const hidden = Math.max(0, graph.edges.length - VISIBLE_ROWS);

  return (
    <section className="border-t border-linec pt-3" data-testid="trust-evidence-strip">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="kicker">Verified attestations</span>
        <span className="flex flex-wrap items-center justify-end gap-2">
          {metrics.suspicious ? (
            <span className="chip rose"><span className="dot" />Unusual patterns</span>
          ) : null}
          <span className="font-mono text-[0.65rem] text-quiet">
            {graph.edges.length} verified · {metrics.reciprocalCount} reciprocal · weight {Math.round(metrics.totalTrustWeight)} · {source === "cached" ? "cached" : "live"}
          </span>
        </span>
      </div>
      {/* cached line: darker ochre than text-limited for AA contrast (~5.2:1) at 12px on paper */}
      {source === "cached" ? (
        <p role="status" className="mt-2 text-xs leading-relaxed text-[#7a571f]">
          Cached snapshot: live verification is unavailable, so these relationships are not being presented as current evidence. Last verified {trustObservedAtLabel(observedAt)}.
        </p>
      ) : null}
      <div className="mt-1">
        {graph.edges.slice(0, VISIBLE_ROWS).map((edge) => (
          <div
            key={edge.id}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-linec py-2.5 text-[0.78rem] text-ink last:border-b-0"
            data-testid="trust-evidence-row"
          >
            <span className="min-w-0">
              <b>
                {edge.peerUsername ? (
                  <Link href={`/profile/${edge.peerUsername}`} className="transition hover:text-verified">{edge.peerUsername}</Link>
                ) : (
                  peerFallbackLabel(edge)
                )}
              </b>
              <small className="mt-0.5 block text-[0.7rem] text-mutedc">{edge.interactionTypes.join(", ").replaceAll("_", " ")} · weight {Math.round(edge.trustWeight)} · {edge.interactionCount} {edge.interactionCount === 1 ? "interaction" : "interactions"} · last verified {ageLabel(edge.lastInteractionAt)}</small>
            </span>
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {edge.reciprocal ? <span className="chip green"><span className="dot" />Reciprocal</span> : null}
              <button
                type="button"
                onClick={() => setActiveEdge(edge)}
                className="rounded-[2px] border border-linec px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc transition hover:border-ink hover:text-ink"
              >
                Evidence
              </button>
            </span>
          </div>
        ))}
      </div>
      {hidden > 0 ? (
        <p className="mt-2 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-quiet">+{hidden} more verified relationships on the record</p>
      ) : null}
      <p className="mt-2.5 border-t border-linec pt-2.5 text-xs leading-relaxed text-mutedc">
        Anchored to verified onchain transactions; each row backs a Trust overlay marker on the map above.
        New attestations appear instantly. The observed map refreshes on its own indexing schedule.
      </p>
      {activeEdge ? (
        <RelationshipDrawer
          walletAddress={graph.walletAddress}
          edge={activeEdge}
          graph={graph}
          onClose={() => setActiveEdge(null)}
        />
      ) : null}
    </section>
  );
}
