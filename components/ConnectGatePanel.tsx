import type { ReactNode } from "react";

type ConnectGatePanelProps = {
  kicker: string;
  title: string;
  description: string;
  actions?: ReactNode;
  unlocks?: string[];
  checking?: boolean;
};

/**
 * The one gate device used by every wallet-gated workspace page. Pages supply
 * state-specific copy and actions; the frame, rhythm and "What unlocks" rail
 * stay identical so gated pages read as one system.
 */
export function ConnectGatePanel({ kicker, title, description, actions, unlocks, checking = false }: ConnectGatePanelProps) {
  const hasUnlocks = Boolean(unlocks?.length);
  return (
    <section className={`r4-panel border-l-2 border-l-gold p-6 sm:p-7 ${hasUnlocks ? "grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10" : ""}`}>
      <div className="min-w-0">
        <p className="kicker text-gold">{kicker}</p>
        <h2 className="mt-3 max-w-2xl font-heading text-2xl font-semibold tracking-[-0.02em] text-ink sm:text-3xl">{title}</h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-mutedc">{description}</p>
        {checking ? (
          <div className="mt-6 max-w-sm">
            <span className="skeleton h-3.5 w-full" />
            <span className="skeleton mt-2 h-3.5 w-3/4" />
          </div>
        ) : actions ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">{actions}</div>
        ) : null}
      </div>
      {hasUnlocks ? (
        <div className="border-t border-linec pt-5 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-1">
          <p className="arc-section-label">What unlocks</p>
          <ul className="mt-3">
            {unlocks!.map((item, index) => (
              <li key={item} className="flex items-baseline gap-3 border-b border-linec py-2.5 text-sm text-mutedc last:border-b-0">
                <span className="font-mono text-[0.65rem] text-gold">{String(index + 1).padStart(2, "0")}</span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
