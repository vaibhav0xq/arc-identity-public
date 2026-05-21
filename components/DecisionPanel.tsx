import type { ArcScore } from "@/lib/types";
import type { TrustGraph } from "@/lib/types";
import { getDecisionRecommendations, getRecommendedAction } from "@/lib/score";

export function DecisionPanel({ score, trustGraph }: { score: ArcScore; trustGraph?: TrustGraph | null }) {
  const decision = getDecisionRecommendations(score.arcScore);
  const rows = [
    ["Send money", decision.sendMoney],
    ["Lending", decision.lending],
    ["High-value deal", decision.highValueDeal]
  ];

  return (
    <section className="arc-surface rounded-2xl p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="arc-section-label">
            Decision panel
          </p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-white">
            {getRecommendedAction(score.arcScore)}
          </h2>
        </div>
        <div className="rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-right">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-100/70">Risk</p>
          <p className="mt-1 text-xl font-extrabold text-emerald-100">{decision.risk}</p>
        </div>
      </div>
      <div className="mt-6 grid gap-3.5 md:grid-cols-3">
        {rows.map(([label, value]) => (
          <div key={label} className="arc-metric-card">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-2.5 font-extrabold text-white">{value}</p>
          </div>
        ))}
      </div>
      {trustGraph?.metrics.suspicious ? (
        <p className="mt-5 rounded-xl border border-rose-300/20 bg-rose-400/10 p-4 text-[0.8125rem] leading-relaxed text-rose-100">
          Trust network anomaly detected. Use enhanced verification for high-value interactions.
        </p>
      ) : trustGraph?.metrics.propagatedTrustScore ? (
        <p className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-[0.8125rem] leading-relaxed text-emerald-100">
          Verified network peers add a capped +{trustGraph.metrics.propagatedTrustScore.toFixed(1)} trust contribution.
        </p>
      ) : null}
    </section>
  );
}
