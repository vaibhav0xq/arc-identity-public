import type { TrustGraph } from "@/lib/types";

/* Plain-language explanation of trust propagation for the Score
   intelligence column. Numbers come from the live graph; the copy
   explains the rules without exposing scoring internals. */
export function TrustExplanationCard({ graph }: { graph?: TrustGraph | null }) {
  const propagated = graph?.metrics.propagatedTrustScore ?? 0;
  const points = Math.min(5, Math.round(propagated / 3));
  const peerCount = graph?.metrics.trustedPeerCount ?? 0;

  const lines = [
    "Connections appear only when a real onchain transaction between two wallets is verified. Nobody can hand out trust without evidence.",
    "Each relationship builds weight through repeat interactions, mutual verification and verified volume.",
    "The whole network can add at most 5 points to Identity Score, so a strong network supports a wallet but can never carry a weak one."
  ];

  return (
    <section className="r4-panel">
      <div className="r4-panel-head">
        <span>How trust works here</span>
        <span className="font-mono text-xs text-mutedc">plain language</span>
      </div>
      <div className="r4-panel-body">
        <ul className="space-y-3">
          {lines.map((line) => (
            <li key={line} className="flex gap-3 text-sm leading-relaxed text-mutedc">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold" aria-hidden="true" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-linec pt-3.5 text-sm leading-relaxed text-ink">
          {peerCount === 0
            ? "This network has no verified peers yet, so it adds no points."
            : points > 0
              ? `Right now this network adds +${points} of those 5 points.`
              : "Right now this network exists but is not strong enough to add points yet."}
          {graph?.metrics.suspicious ? " Unusual trust patterns were detected, which limits how much the network can contribute." : ""}
        </p>
      </div>
    </section>
  );
}
