const bullets = [
  "EVM-compatible wallet identity",
  "USDC-native financial activity",
  "Ready for Arc testnet transaction history",
  "Designed for stablecoin payments, lending, and reputation checks"
];

export function ArcIntegrationCard() {
  return (
    <section className="arc-surface rounded-2xl border-emerald-300/15 bg-emerald-300/[0.06] p-7 shadow-[inset_0_1px_0_rgba(212,175,55,0.1)]">
      <p className="arc-section-label">
        Built for Arc
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {bullets.map((bullet) => (
          <div key={bullet} className="arc-card-hover flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
            <span className="text-sm font-bold leading-relaxed text-emerald-50">{bullet}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
