import type { ArcScore } from "@/lib/types";
import type { TrustGraph } from "@/lib/types";
import { getDecisionRecommendations, getRecommendedAction } from "@/lib/score";

export function DecisionPanel({ score, trustGraph }: { score: ArcScore; trustGraph?: TrustGraph | null }) {
  const decision = getDecisionRecommendations(score.arcScore);
  const riskText = `${score.riskLevel} ${decision.risk}`;
  const riskTone = /high risk|anomaly/i.test(riskText) ? "rose" : /review|unproven|new|moderate/i.test(riskText) || score.arcScore <= 40 ? "amber" : "green";
  const rows = [
    ["Send money", decision.sendMoney],
    ["Lending", decision.lending],
    ["High-value deal", decision.highValueDeal]
  ];

  return (
    <section className="r4-panel">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="arc-section-label">
            Decision panel
          </p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-ink">
            {getRecommendedAction(score.arcScore)}
          </h2>
        </div>
        <div className={`chip ${riskTone}`}><span className="dot" />
          <span className="font-mono uppercase tracking-[0.14em]">Risk {decision.risk}</span>
        </div>
      </div>
      <div className="mt-6 grid gap-x-5 md:grid-cols-3 md:divide-x md:divide-linec">
        {rows.map(([label, value]) => (
          <div key={label} className="py-2 md:pl-5 first:pl-0">
            <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-mutedc">{label}</p>
            <p className="mt-2.5 font-extrabold text-ink">{value}</p>
          </div>
        ))}
      </div>
      {trustGraph?.metrics.suspicious ? (
        <p className="mt-5 border-t border-linec pt-4 text-[0.8125rem] leading-relaxed text-limited">
          Trust network anomaly detected. Use enhanced verification for high-value interactions.
        </p>
      ) : trustGraph?.metrics.propagatedTrustScore ? (
        <p className="mt-5 border-t border-linec pt-4 text-[0.8125rem] leading-relaxed text-verified">
          Verified network peers add a capped +{trustGraph.metrics.propagatedTrustScore.toFixed(1)} trust contribution.
        </p>
      ) : null}
    </section>
  );
}
