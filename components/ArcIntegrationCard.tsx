const bullets = [
  "EVM-compatible wallet identity",
  "USDC-native financial activity",
  "Ready for Arc testnet transaction history",
  "Designed for stablecoin payments, lending and reputation checks"
];

export function ArcIntegrationCard() {
  return (
    <section className="r4-panel">
      <div className="r4-panel-head !items-end !px-0">
        <div>
          <p className="arc-section-label">Built for Arc</p>
          <h2 className="mt-2 text-3xl tracking-tight text-ink">An identity layer for money that moves.</h2>
        </div>
        <span className="font-mono text-[0.62rem] uppercase tracking-[0.14em] text-gold">03 / integration</span>
      </div>
      <div className="r4-panel-body !px-0">
        {bullets.map((bullet) => (
          <div key={bullet} className="ledger-row">
            <span className="text-sm font-semibold leading-relaxed text-ink">{bullet}</span>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-gold">Arc ready</span>
          </div>
        ))}
      </div>
    </section>
  );
}
