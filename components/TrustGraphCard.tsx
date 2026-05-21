import Link from "next/link";
import type { TrustEdge, TrustGraph } from "@/lib/types";
import { shortenAddress } from "@/lib/wallet";

function ageLabel(value: string | null) {
  if (!value) return "Unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "Today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function healthTone(health: string) {
  if (health === "review" || health === "suspicious_cluster") return "border-rose-300/25 bg-rose-400/10 text-rose-100";
  if (health === "trusted" || health === "highly_connected") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
}

function peerLabel(edge: TrustEdge) {
  return edge.peerUsername ?? shortenAddress(edge.peerWallet ?? edge.targetWallet);
}

function ProfileTooltip({ edge }: { edge: TrustEdge }) {
  if (!edge.peerUsername) return null;
  return (
    <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-60 -translate-x-1/2 rounded-xl border border-white/[0.08] bg-[rgba(9,10,11,0.96)] p-3.5 text-left text-xs shadow-panel backdrop-blur-xl group-hover:block">
      <span className="block truncate font-extrabold text-white">{edge.peerUsername}</span>
      <span className="mt-1.5 block text-slate-400">ARC Score {edge.peerArcScore ?? 0}</span>
      <span className="block text-slate-400">Credential {edge.peerCredentialLevel ?? "Unknown"}</span>
      <span className="block text-slate-400">Risk {edge.peerRiskLevel ?? "Unknown"}</span>
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

function MiniGraph({ graph }: { graph: TrustGraph }) {
  const edges = graph.edges.slice(0, 8);
  if (edges.length === 0) return <p className="mt-4 text-sm text-slate-400">No verified transaction edges yet.</p>;
  return (
    <div className="relative mt-8 flex min-h-64 flex-wrap items-center justify-center gap-7 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/30 p-10">
      <div className="arc-ambient pointer-events-none absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.14),transparent_58%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_30%_70%,rgba(161,105,197,0.12),transparent_50%)]" />
      <div className="relative rounded-full border border-emerald-300/35 bg-emerald-300/[0.12] px-6 py-4 text-sm font-extrabold text-emerald-100 shadow-[0_0_32px_rgba(212,175,55,0.25)] transition duration-300 hover:scale-105">You</div>
      {edges.map((edge) => (
        <div key={edge.id} className="relative flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full bg-gradient-to-r from-emerald-400/80 to-cyan-400/80" style={{ width: `${Math.max(28, Math.min(86, edge.trustWeight))}px`, height: `${Math.max(2, Math.min(8, edge.trustWeight / 10))}px` }} />
          <div className="max-w-[12rem] truncate rounded-full border border-cyan-300/20 bg-cyan-300/[0.08] px-3.5 py-2 text-xs font-medium text-cyan-50 shadow-[0_0_20px_rgba(161,105,197,0.12)] transition duration-220 hover:-translate-y-0.5 hover:border-emerald-300/30 hover:bg-emerald-300/[0.08]">
            <PeerIdentity edge={edge} /> {edge.reciprocal ? "↔" : "→"}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TrustGraphCard({ graph, title = "Trust Network" }: { graph?: TrustGraph | null; title?: string }) {
  if (!graph) {
    return (
    <section className="arc-surface rounded-2xl p-7">
        <p className="arc-section-label">{title}</p>
        <p className="mt-3 text-slate-400">Trust graph data is not available yet.</p>
      </section>
    );
  }

  const strongest = graph.strongestPeers[0] ?? null;

  return (
    <section className="arc-surface rounded-2xl p-8 lg:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="arc-section-label">{title}</p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-white">Transaction-verified trust graph</h2>
        </div>
        <span className={`rounded-lg border px-3.5 py-2 text-xs font-extrabold uppercase tracking-[0.14em] ${healthTone(graph.metrics.networkHealth)}`}>
          {graph.metrics.suspicious ? "Review" : graph.metrics.networkHealth}
        </span>
      </div>

      <div className="mt-8 grid gap-3.5 sm:grid-cols-5">
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Trusted peers</p><p className="mt-2.5 text-2xl font-extrabold tabular-nums text-white">{graph.metrics.trustedPeerCount}</p></div>
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Strongest</p><p className="mt-2.5 truncate text-lg font-extrabold text-white">{strongest ? <PeerIdentity edge={strongest} /> : "None"}</p></div>
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Trust weight</p><p className="mt-2.5 text-2xl font-extrabold tabular-nums text-white">{Math.round(graph.metrics.totalTrustWeight)}</p></div>
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Reciprocal</p><p className="mt-2.5 text-2xl font-extrabold tabular-nums text-white">{graph.metrics.reciprocalCount}</p></div>
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Maturity</p><p className="mt-2.5 truncate text-lg font-extrabold text-white">{graph.metrics.networkMaturity}</p></div>
      </div>

      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-3">
        <div className="arc-metric-card !border-emerald-300/15 !bg-emerald-300/[0.06]"><p className="text-[0.6875rem] font-medium text-emerald-200/70">Propagated contribution</p><p className="mt-2.5 text-2xl font-extrabold tabular-nums text-emerald-100">+{graph.metrics.propagatedTrustScore.toFixed(1)}</p></div>
        <div className="arc-metric-card !border-cyan-300/15 !bg-cyan-300/[0.06]"><p className="text-[0.6875rem] font-medium text-cyan-200/70">Trust confidence</p><p className="mt-2.5 text-2xl font-extrabold tabular-nums text-cyan-100">{Math.round(graph.metrics.trustConfidence)}%</p></div>
        <div className="arc-metric-card"><p className="text-[0.6875rem] font-medium text-slate-400">Anomaly score</p><p className={graph.metrics.anomalyScore > 0 ? "mt-2.5 text-2xl font-extrabold tabular-nums text-rose-100" : "mt-2.5 text-2xl font-extrabold tabular-nums text-white"}>{Math.round(graph.metrics.anomalyScore)}</p></div>
      </div>
      {graph.metrics.maturityReason ? <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-sm leading-relaxed text-slate-300">{graph.metrics.maturityReason}</p> : null}

      {graph.anomalies.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {graph.anomalies.map((item) => <span key={item.id} className="rounded-lg border border-rose-300/25 bg-rose-400/10 px-3 py-1.5 text-xs font-bold text-rose-100">{item.anomalyType.replaceAll("_", " ")}</span>)}
        </div>
      ) : null}

      <MiniGraph graph={graph} />

      <div className="mt-6 grid gap-3">
        {graph.edges.slice(0, 5).map((edge) => (
          <div key={edge.id} className="arc-card-hover rounded-xl border border-white/[0.07] bg-white/[0.025] p-4 transition hover:border-emerald-300/25">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="min-w-0 truncate font-bold text-white"><PeerIdentity edge={edge} /></p>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-md bg-emerald-300/[0.12] px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-emerald-100">Verified</span>
                {edge.reciprocal ? <span className="rounded-md bg-cyan-300/[0.12] px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] text-cyan-100">Reciprocal</span> : null}
              </div>
            </div>
            <p className="mt-2.5 text-[0.8125rem] leading-relaxed text-slate-400">{edge.interactionTypes.join(", ").replaceAll("_", " ")} · weight {Math.round(edge.trustWeight)} · {edge.interactionCount} interactions · {ageLabel(edge.lastInteractionAt)}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-2 text-[0.8125rem] leading-relaxed text-slate-400/80">
        {graph.explanations.map((item) => <p key={item}>{item}</p>)}
      </div>
    </section>
  );
}
