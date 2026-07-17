import Link from "next/link";
import Image from "next/image";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { ReportIssueLink } from "@/components/ReportIssueLink";
import { WalletConnectButton } from "@/components/WalletConnectButton";

const navItems = [
  ["Dashboard", "/dashboard"],
  ["Directory", "/directory"],
  ["Verified Attestations", "/attestations"],
  ["Developer API", "/developers"]
];

export function ArcShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative min-h-screen w-full max-w-full">
      <div className="arc-grid absolute inset-0 opacity-50" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-emerald-300/[0.08] via-cyan-300/[0.04] to-transparent" />
      <div className="pointer-events-none absolute left-1/2 top-8 h-96 w-[52rem] max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-full bg-cyan-300/[0.06] blur-[100px]" />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1760px] flex-col px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.65rem,env(safe-area-inset-top))] sm:px-6 sm:py-4 lg:px-8 2xl:px-12">
        <header className="arc-surface relative z-40 grid gap-2 rounded-2xl px-3 py-2.5 shadow-[0_18px_52px_rgba(0,0,0,0.38),0_0_42px_rgba(212,175,55,0.07),inset_0_1px_0_rgba(255,255,255,0.06)] sm:px-4 md:sticky md:top-4 md:gap-2.5 lg:min-h-[72px] lg:px-5 lg:py-2 xl:grid-cols-[210px_minmax(0,1fr)_minmax(280px,auto)] xl:items-center xl:gap-3">
          <div className="flex min-w-0 items-center justify-between gap-3 md:grid md:grid-cols-[minmax(190px,1fr)_auto] md:items-center xl:contents">
          <Link href="/" className="flex min-w-0 items-center gap-3 transition-opacity duration-200 hover:opacity-90 xl:min-w-[210px]">
            <Image
              src="/brand/arc-identity-icon.png"
              alt="ARC Identity icon"
              width={40}
              height={40}
              priority
              className="h-9 w-9 shrink-0 rounded-xl object-contain shadow-glow transition duration-300 hover:scale-[1.02] sm:h-10 sm:w-10"
            />
            <span className="min-w-0 xl:min-w-[130px]">
              <span className="block whitespace-nowrap text-[0.8125rem] font-extrabold tracking-wide text-white">
                ARC Identity
              </span>
              <span className="hidden whitespace-nowrap text-[0.6875rem] font-medium text-emerald-200/50 sm:block">
                Wallet Intelligence
              </span>
            </span>
          </Link>
          <div className="hidden min-w-0 justify-end md:flex xl:contents">
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 xl:col-start-3 xl:flex-nowrap">
              <ProfileNavButton />
              <WalletConnectButton compact />
            </div>
          </div>
          </div>
          <nav className="arc-mobile-nav -mx-1 flex w-[calc(100%+0.5rem)] min-w-0 gap-1.5 overflow-x-auto px-1 pb-1 text-[0.76rem] font-medium text-slate-400 md:mx-0 md:grid md:w-full md:grid-cols-4 md:overflow-visible md:px-0 md:pb-0 lg:grid-cols-5 xl:col-start-2 xl:flex xl:items-center xl:justify-center xl:gap-1">
            {navItems.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                className="min-w-fit shrink-0 whitespace-nowrap rounded-lg border border-white/[0.06] bg-white/[0.025] px-3 py-2 text-center transition-all duration-200 hover:bg-white/[0.07] hover:text-slate-100 hover:shadow-[0_0_20px_rgba(45,212,191,0.06)] md:min-w-0 md:shrink md:px-2.5 xl:border-0 xl:bg-transparent xl:px-3 xl:py-2"
              >
                {label}
              </Link>
            ))}
            <ReportIssueLink className="min-w-fit shrink-0 whitespace-nowrap rounded-lg border border-amber-300/[0.10] bg-amber-300/[0.04] px-3 py-2 text-center text-amber-100/80 transition-all duration-200 hover:border-amber-300/20 hover:bg-amber-300/[0.08] hover:text-amber-50 md:min-w-0 md:shrink md:px-2.5 xl:px-3" />
          </nav>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] md:hidden">
            <ProfileNavButton />
            <WalletConnectButton compact />
          </div>
        </header>
        {children}
      </div>
    </main>
  );
}
