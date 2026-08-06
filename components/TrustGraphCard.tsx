import Link from "next/link";
import type { TrustEdge, TrustGraph } from "@/lib/types";
import { shortenAddress } from "@/lib/wallet";
import { TrustConstellation } from "@/components/TrustConstellation";

function ageLabel(value: string | null) {
  if (!value) return "Unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function healthTone(health: string) {
  if (health === "review" || health === "suspicious_cluster") return "rose";
  if (health === "trusted" || health === "highly_connected") return "green";
  return "amber";
}

function peerLabel(edge: TrustEdge) {
  return edge.peerUsername ?? shortenAddress(edge.peerWallet ?? edge.targetWallet);
}

function ProfileTooltip({ edge }: { edge: TrustEdge }) {
  if (!edge.peerUsername) return null;
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-60 -translate-x-1/2 rounded-[2px] border border-[#555a52] bg-graphite p-3.5 text-left text-xs shadow-panel group-hover:block">
      <span className="block truncate font-extrabold text-bone">{edge.peerUsername}</span>
      <span className="mt-1.5 block text-[#b3b8ae]">Identity Score {edge.peerArcScore ?? 0}</span>
      <span className="block text-[#b3b8ae]">Credential {edge.peerCredentialLevel ?? "Unknown"}</span>
      <span className="block text-[#b3b8ae]">Risk {edge.peerRiskLevel ?? "Unknown"}</span>
    </span>
  );
}

function PeerIdentity({ edge, className = "" }: { edge: TrustEdge; className?: string }) {
  const content = (
    <span className={`group relative inline-flex max-w-full items-center truncate ${className}`}>
      <span className="truncate">{peerLabel(edge)}</span>
      <ProfileTooltip edge={edge} />
    </span>
  );
  if (!edge.peerUsername) return content;
  return (
    <Link href={`/profile/${edge.peerUsername}`} className="max-w-full transition hover:text-emerald-100">
      {content}
    </Link>
  );
}

export function TrustGraphCard({ graph, title = "Trust Network" }: { graph?: TrustGraph | null; title?: string }) {
  if (!graph) {
    return (
    <section className="r4-panel pt-6">
        <p className="arc-section-label">{title}</p>
        <p className="mt-3 text-sm text-mutedc">Trust graph data is not available yet.</p>
      </section>
    );
  }

  const strongest = graph.strongestPeers[0] ?? null;

  return (
    <section className="r4-panel pt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="arc-section-label">{title}</p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-ink">Transaction-verified trust graph</h2>
        </div>
        <span className={`chip ${healthTone(graph.metrics.networkHealth)}`}><span className="dot" />
          {graph.metrics.suspicious ? "Review" : graph.metrics.networkHealth}
        </span>
      </div>

      <div className="mt-8 grid gap-x-6 sm:grid-cols-5">
        {[
          ["Trusted peers", graph.metrics.trustedPeerCount],
          ["Strongest", strongest ? <PeerIdentity edge={strongest} /> : "None"],
          ["Trust weight", Math.round(graph.metrics.totalTrustWeight)],
          ["Reciprocal", graph.metrics.reciprocalCount],
          ["Maturity", graph.metrics.networkMaturity]
        ].map(([label, value]) => <div key={label as string} className="flex min-w-0 flex-col border-t border-linec py-3.5"><p className="kicker">{label}</p><p className="mt-auto truncate pt-2 text-xl font-extrabold tabular-nums text-ink">{value}</p></div>)}
        <div className="flex min-w-0 flex-col border-t border-linec py-3.5 sm:col-span-2"><p className="kicker">Propagated contribution</p><p className={`mt-auto pt-2 text-xl font-extrabold tabular-nums ${graph.metrics.propagatedTrustScore > 0 && graph.metrics.suspicious === false ? "text-verified" : "text-mutedc"}`}>+{graph.metrics.propagatedTrustScore.toFixed(1)}</p></div>
        <div className="flex min-w-0 flex-col border-t border-linec py-3.5 sm:col-span-2"><p className="kicker">Trust confidence</p><p className={`mt-auto pt-2 text-xl font-extrabold tabular-nums ${graph.metrics.trustConfidence > 0 && graph.metrics.networkHealth === "trusted" ? "text-verified" : "text-mutedc"}`}>{Math.round(graph.metrics.trustConfidence)}%</p></div>
        <div className="flex min-w-0 flex-col border-t border-linec py-3.5"><p className="kicker">Anomaly score</p><p className={graph.metrics.anomalyScore > 0 ? "mt-auto pt-2 text-xl font-extrabold tabular-nums text-[#8c4a3f]" : "mt-auto pt-2 text-xl font-extrabold tabular-nums text-mutedc"}>{Math.round(graph.metrics.anomalyScore)}</p></div>
      </div>
      {graph.metrics.maturityReason ? <p className="mt-6 border-t border-linec pt-4 text-sm leading-relaxed text-mutedc">{graph.metrics.maturityReason}</p> : null}

      {graph.anomalies.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {graph.anomalies.map((item) => <span key={item.id} className="rounded-[2px] border border-risk/50 bg-risk-bg px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-risk">{item.anomalyType.replaceAll("_", " ")}</span>)}
        </div>
      ) : null}

      <TrustConstellation graph={graph} />

      {graph.edges.length > 0 ? (
        <details className="mt-6 border-t border-linec">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 [&::-webkit-details-marker]:hidden">
            <span className="kicker">Peer relationship ledger</span>
            <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc">{graph.edges.length} verified +</span>
          </summary>
          <div className="grid gap-3 pb-2">
            {graph.edges.slice(0, 5).map((edge) => (
              <div key={edge.id} className="ledger-row">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="min-w-0 truncate font-bold text-white"><PeerIdentity edge={edge} /></p>
                  <div className="flex flex-wrap gap-2">
                    <span className="chip green"><span className="dot" />Verified</span>
                    {edge.reciprocal ? <span className="chip green"><span className="dot" />Reciprocal</span> : null}
                  </div>
                </div>
                <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-slate-400">{edge.interactionTypes.join(", ").replaceAll("_", " ")} · weight {Math.round(edge.trustWeight)} · {edge.interactionCount} interactions · {ageLabel(edge.lastInteractionAt)}</p>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </section>
  );
}
