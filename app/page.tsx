import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { ArcIntegrationCard } from "@/components/ArcIntegrationCard";
import { ReportIssueLink } from "@/components/ReportIssueLink";

export default function LandingPage() {
  return (
    <ArcShell>
      <section className="fade-in grid flex-1 items-start gap-7 py-7 sm:gap-10 sm:py-12 lg:grid-cols-[1.08fr_0.92fr] lg:items-center lg:py-16">
        <div className="max-w-4xl">
          <div className="mb-5 inline-flex max-w-full rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3.5 py-2 text-xs font-extrabold tracking-wide text-emerald-100 shadow-[0_0_15px_rgba(110,231,183,0.15)] backdrop-blur-md sm:mb-8 sm:px-4 sm:text-sm">
            Arc wallet intelligence infrastructure
          </div>
          <h1 className="max-w-4xl text-[2.65rem] font-extrabold leading-[1.02] tracking-tight text-white min-[390px]:text-5xl sm:text-6xl lg:text-[4.5rem]">
            Real wallet intelligence for Arc users.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:mt-7 sm:text-[1.125rem]">
            ARC Identity analyzes Arc RPC wallet behavior, counterparty diversity, balance signals, and trust-weighted attestations to generate one portable ARC Score for stablecoin apps.
          </p>
          <div className="mt-7 grid gap-3 sm:mt-10 sm:flex sm:flex-wrap sm:gap-4">
            <WalletConnectButton />
            <Link href="/docs" className="arc-button-secondary w-full px-6 py-3.5 text-center font-bold sm:w-auto">Read Docs</Link>
            <Link href="/directory" className="arc-button-secondary w-full px-6 py-3.5 text-center font-bold sm:w-auto">View Directory</Link>
            <Link href="/developers" className="arc-button-secondary w-full px-6 py-3.5 text-center font-bold sm:w-auto">Developer API</Link>
          </div>
        </div>
        <div className="arc-surface arc-card-hover rounded-2xl p-5 shadow-panel sm:p-8">
          <div className="flex items-center justify-between gap-4 border-b border-white/[0.08] pb-5 sm:pb-6">
            <div>
              <p className="text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-slate-400">Unified signal</p>
              <p className="mt-1 text-2xl font-extrabold text-white sm:text-3xl">ARC Score</p>
            </div>
            <span className="rounded-lg border border-emerald-300/25 bg-emerald-300/15 px-3 py-2 text-sm font-extrabold tabular-nums text-emerald-100 sm:px-4 sm:py-2.5">0-100</span>
          </div>
          <div className="mt-5 grid gap-2.5 sm:mt-7 sm:gap-3.5">
            {["Arc Activity", "Verified Attestations", "Trust Graph", "Verified Counterparties", "Wallet Maturity", "Chain Coverage Context", "Risk Penalty"].map((label) => (
              <div key={label} className="arc-card-hover flex items-center justify-between gap-4 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 sm:px-5 sm:py-4">
                <span className="min-w-0 text-sm font-semibold text-slate-200 sm:text-base">{label}</span>
                <span className="shrink-0 text-sm font-extrabold tracking-wide text-emerald-200 sm:text-base">Live</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="arc-surface mb-8 rounded-2xl p-5 shadow-panel sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <p className="arc-section-label">Found a bug?</p>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              ARC Identity is actively evolving. Report issues, UI glitches, wallet problems, or feedback so we can improve the experience.
            </p>
          </div>
          <ReportIssueLink className="arc-button-secondary w-full px-5 py-3 text-center text-sm font-extrabold sm:w-auto" />
        </div>
      </section>
      <ArcIntegrationCard />
    </ArcShell>
  );
}
