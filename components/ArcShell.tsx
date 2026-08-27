"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ProfileNavButton } from "@/components/ProfileNavButton";
import { ReportIssueLink } from "@/components/ReportIssueLink";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { WalletNetworkNotice } from "@/components/WalletNetworkNotice";

const toolsNav: Array<[string, string]> = [
  ["Counterparty Check", "/check"]
];

const consoleNav: Array<[string, string]> = [
  ["Overview", "/dashboard"],
  ["Attestations", "/attestations"],
  ["Directory", "/directory"]
];

const developersNav: Array<[string, string]> = [
  ["API", "/developers"],
  ["Docs", "https://docs.thekyro.co"]
];

const marketingNav: Array<[string, string]> = [
  ["Counterparty Check", "/check"],
  ["Directory", "/directory"],
  ["Pricing", "/pricing"],
  ["Docs", "https://docs.thekyro.co"],
  ["Developer API", "/developers"]
];

type ArcShellProps = {
  children: React.ReactNode;
  /** "marketing" = editorial landing chrome; "console" = product workspace chrome */
  variant?: "marketing" | "console";
};

function Wordmark({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="flex min-w-0 items-center gap-3 transition-opacity duration-200 hover:opacity-80">
      <Image
        src="/brand/kyro-tile-site.svg"
        alt="Kyro icon"
        width={40}
        height={40}
        priority
        unoptimized
        className="h-8 w-8 shrink-0 object-contain"
      />
      <span className={`block whitespace-nowrap text-[0.85rem] font-semibold tracking-tight ${dark ? "text-bone" : "text-ink"}`}>
        Kyro
      </span>
    </Link>
  );
}

/** Clicking the nav item for the page you are already on should do nothing. */
function stayPut(active: boolean) {
  return (event: React.MouseEvent) => {
    if (active) event.preventDefault();
  };
}

/**
 * Horizontally scrollable mobile tab strip with edge-fade affordances.
 * - Fades appear only when there is actually more content in that direction,
 *   so tabs never look silently clipped.
 * - On mount, the active tab is scrolled into view instead of parking
 *   off the right edge.
 */
function MobileTabNav({
  children,
  navClassName,
  wrapClassName = "",
  ariaLabel
}: {
  children: React.ReactNode;
  navClassName: string;
  wrapClassName?: string;
  ariaLabel: string;
}) {
  const scrollerRef = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges((previous) => {
        const next = { left: el.scrollLeft > 6, right: el.scrollLeft < max - 6 };
        return previous.left === next.left && previous.right === next.right ? previous : next;
      });
    };
    // Land with the active tab visible instead of clipped off the right edge.
    const active = el.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const target = active.offsetLeft - (el.clientWidth - active.offsetWidth) / 2;
      el.scrollLeft = Math.max(0, Math.min(target, el.scrollWidth - el.clientWidth));
    }
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div className={`relative min-w-0 ${wrapClassName}`}>
      <nav
        ref={scrollerRef}
        aria-label={ariaLabel}
        className={`arc-mobile-nav flex min-w-0 gap-1.5 overflow-x-auto ${navClassName}`}
      >
        {children}
      </nav>
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-paper to-transparent transition-opacity duration-200 ${edges.left ? "opacity-100" : "opacity-0"}`}
      />
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-paper to-transparent transition-opacity duration-200 ${edges.right ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isCurrent = (href: string) => pathname === href;

  return (
    <main className="arc4 relative min-h-screen w-full max-w-full bg-paper text-ink">
      <header className="relative z-40 border-b border-linec bg-paper md:sticky md:top-0">
        <div className="flex min-h-[64px] w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-[clamp(24px,3vw,56px)]">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark />
            <span className="hidden whitespace-nowrap border-l border-linec pl-3 font-mono text-[0.6rem] uppercase tracking-[0.14em] text-mutedc sm:block">
              Wallet Intelligence
            </span>
          </div>
          <nav className="hidden items-center gap-6 text-[0.8rem] font-medium text-mutedc lg:flex">
            {marketingNav.map(([label, href]) =>
              href.startsWith("http") ? (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors duration-150 hover:text-ink"
                >
                  {label} <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <Link
                  key={href}
                  href={href}
                  onClick={stayPut(isCurrent(href))}
                  aria-current={isCurrent(href) ? "page" : undefined}
                  className={`transition-colors duration-150 hover:text-ink ${
                    isCurrent(href) ? "text-ink underline decoration-gold decoration-2 underline-offset-8" : ""
                  }`}
                >
                  {label}
                </Link>
              )
            )}
            <ReportIssueLink className="text-limited transition-colors duration-150 hover:text-ink" />
          </nav>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ProfileNavButton />
            <WalletConnectButton compact />
          </div>
        </div>
        <MobileTabNav
          ariaLabel="Primary"
          wrapClassName="lg:hidden"
          navClassName="px-4 pb-2 text-[0.8rem] font-medium text-mutedc sm:px-6"
        >
          {marketingNav.map(([label, href]) =>
            href.startsWith("http") ? (
              <a
                key={href}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border border-linec bg-bone px-3 py-2 text-center transition-colors duration-150 hover:text-ink"
              >
                {label} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <Link
                key={href}
                href={href}
                onClick={stayPut(isCurrent(href))}
                aria-current={isCurrent(href) ? "page" : undefined}
                className={`min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border px-3 py-2 text-center transition-colors duration-150 ${
                  isCurrent(href) ? "border-graphite bg-graphite text-bone" : "border-linec bg-bone hover:text-ink"
                }`}
              >
                {label}
              </Link>
            )
          )}
          <ReportIssueLink className="min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border border-[#d9c9a4] bg-[#f0e3c8]/60 px-3 py-2 text-center text-limited transition-colors duration-150 hover:bg-[#f0e3c8]" />
        </MobileTabNav>
      </header>
      <WalletNetworkNotice />
      <div className="page-enter relative z-10 w-full">{children}</div>
    </main>
  );
}

export function ArcShell({ children, variant = "console" }: ArcShellProps) {
  const pathname = usePathname();

  if (variant === "marketing") {
    return <MarketingShell>{children}</MarketingShell>;
  }

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const railLink = (label: string, href: string) => {
    if (href.startsWith("http")) {
      return (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="-ml-3 border-l-2 border-transparent py-2 pl-3 text-[0.8rem] text-[#a3a89e] transition-colors duration-150 hover:text-bone"
        >
          {label} <span aria-hidden="true">↗</span>
        </a>
      );
    }
    return (
      <Link
        key={href}
        href={href}
        onClick={stayPut(pathname === href)}
        aria-current={pathname === href ? "page" : undefined}
        className={`-ml-3 border-l-2 py-2 pl-3 text-[0.8rem] transition-colors duration-150 ${
          isActive(href)
            ? "border-gold text-bone"
            : "border-transparent text-[#a3a89e] hover:text-bone"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <main className="arc4 relative min-h-screen w-full max-w-full bg-[#e4e0d5] text-ink lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      {/* Desktop workspace rail */}
      <aside className="sticky top-0 hidden h-screen flex-col overflow-y-auto border-r border-[#242725] bg-graphite px-6 py-7 text-bone lg:flex">
        <Wordmark dark />
        <p className="mt-12 font-mono text-[0.56rem] uppercase tracking-[0.2em] text-[#8f948a]">Workspace</p>
        <nav className="mt-3 flex flex-col gap-0.5">
          {consoleNav.map(([label, href]) => railLink(label, href))}
        </nav>
        <p className="mt-9 font-mono text-[0.56rem] uppercase tracking-[0.2em] text-[#8f948a]">Tools</p>
        <nav className="mt-3 flex flex-col gap-0.5">
          {toolsNav.map(([label, href]) => railLink(label, href))}
        </nav>
        <p className="mt-9 font-mono text-[0.56rem] uppercase tracking-[0.2em] text-[#8f948a]">Developers</p>
        <nav className="mt-3 flex flex-col gap-0.5">
          {developersNav.map(([label, href]) => railLink(label, href))}
        </nav>
        <div className="mt-auto border-t border-[#464b44] pb-8 pt-4">
          <ReportIssueLink className="block py-1.5 text-[0.72rem] text-[#d3b878] transition-colors duration-150 hover:text-bone" />
        </div>
      </aside>

      {/* Workspace column */}
      <div className="flex min-h-screen min-w-0 flex-col">
        {/* Desktop workspace bar */}
        <header className="sticky top-0 z-40 hidden border-b border-linec bg-paper lg:block">
          <div className="flex min-h-[56px] w-full items-center justify-between gap-4 px-8">
            <span className="font-heading text-[1.05rem] font-semibold tracking-tight text-ink">Identity workspace</span>
            <div className="flex min-w-0 items-center justify-end gap-2">
              <ProfileNavButton />
              <WalletConnectButton compact />
            </div>
          </div>
        </header>

        {/* Mobile header */}
        <header className="relative z-40 border-b border-linec bg-paper lg:hidden">
          <div className="grid w-full gap-2 px-3 py-2.5 sm:px-6">
            <div className="flex min-w-0 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Wordmark />
                <span className="hidden whitespace-nowrap border-l border-linec pl-2 font-mono text-[0.6rem] uppercase tracking-[0.16em] text-gold sm:block">
                  Console
                </span>
              </div>
            </div>
            <MobileTabNav
              ariaLabel="Workspace"
              wrapClassName="-mx-1 w-[calc(100%+0.5rem)]"
              navClassName="px-1 pb-1 text-[0.8rem] font-medium text-mutedc"
            >
              {[...consoleNav, ...toolsNav, ...developersNav].map(([label, href]) =>
                href.startsWith("http") ? (
                  <a
                    key={href}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border border-linec bg-bone px-3 py-2 text-center transition-colors duration-150 hover:text-ink"
                  >
                    {label} <span aria-hidden="true">↗</span>
                  </a>
                ) : (
                  <Link
                    key={href}
                    href={href}
                    onClick={stayPut(pathname === href)}
                    aria-current={pathname === href ? "page" : undefined}
                    className={`min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border px-3 py-2 text-center transition-colors duration-150 ${
                      isActive(href) ? "border-graphite bg-graphite text-bone" : "border-linec bg-bone hover:text-ink"
                    }`}
                  >
                    {label}
                  </Link>
                )
              )}
              <ReportIssueLink className="min-w-fit shrink-0 whitespace-nowrap rounded-[2px] border border-[#d9c9a4] bg-[#f0e3c8]/60 px-3 py-2 text-center text-limited transition-colors duration-150 hover:bg-[#f0e3c8]" />
            </MobileTabNav>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <ProfileNavButton />
              <WalletConnectButton compact />
            </div>
          </div>
        </header>

        <WalletNetworkNotice />

        <div className="page-enter relative z-10 mx-auto flex w-full max-w-[1500px] flex-1 flex-col px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:py-6 lg:px-8 lg:pt-8">
          {children}
        </div>
      </div>
    </main>
  );
}
