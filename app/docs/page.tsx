import type { Metadata } from "next";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { DocsOnThisPage } from "@/components/DocsOnThisPage";

export const metadata: Metadata = {
  title: "Introducing ARC Identity",
  description: "Learn how ARC Identity combines Arc-native reputation, verified attestations, trust graph context, and global wallet intelligence."
};

const tocItems: { label: string; href: `#${string}` }[] = [
  { label: "Overview", href: "#overview" },
  { label: "Two-layer model", href: "#two-layer-model" },
  { label: "ARC Reputation Score", href: "#arc-reputation-score" },
  { label: "Global Wallet Intelligence", href: "#global-wallet-intelligence" },
  { label: "Verified Attestations", href: "#verified-attestations" },
  { label: "Developer API", href: "#developer-api" },
  { label: "Get started", href: "#get-started" }
];

const reputationSignals = [
  "Arc ecosystem activity",
  "Verified transaction-backed attestations",
  "Trusted counterparties",
  "Trust graph strength",
  "Consistency of Arc activity",
  "Meaningful participation",
  "Wallet maturity as supporting confidence",
  "Risk and anomaly checks"
];

const walletIntelligenceSignals = [
  "Wallet age",
  "Chain coverage",
  "Multi-chain activity",
  "Transaction history",
  "Wallet maturity",
  "Indexed chain data",
  "General wallet behavior"
];

const attestationChecks = [
  "Valid transaction hash required",
  "Registered counterparty required",
  "Self-attestation rejected",
  "Duplicate submissions guarded",
  "Invalid or unverified transactions rejected"
];

const faqItems = [
  {
    question: "Is ARC Score based only on transaction count?",
    answer: "No. ARC Score is primarily based on Arc ecosystem behavior, verified attestations, trust graph strength, and meaningful participation."
  },
  {
    question: "Does global wallet activity affect the score?",
    answer: "It can support confidence and maturity context, but generic multi-chain activity is not the main driver of ARC Reputation Score."
  },
  {
    question: "What are Verified Attestations?",
    answer: "Transaction-backed trust signals between registered ARC Identity users."
  },
  {
    question: "Can developers use ARC Identity data?",
    answer: "Yes. Developers can query wallet and username reputation data, explanations, intelligence status, and coverage context through the Developer API."
  },
  {
    question: "Is ARC Identity still evolving?",
    answer: "Yes. ARC Identity is live in an active building phase. Scoring, verification safeguards, chain coverage, and developer-facing responses will continue improving as usage grows."
  }
];

const ctaLinks = [
  ["Launch ARC Identity", "/"],
  ["View Directory", "/directory"],
  ["Developer API", "/developers"],
  ["Verified Attestations", "/attestations"]
];

function SectionShell({
  id,
  label,
  title,
  children
}: {
  id: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-40 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel md:scroll-mt-44 sm:p-7 lg:p-8">
      <p className="arc-section-label">{label}</p>
      <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">{title}</h2>
      <div className="mt-5 max-w-4xl text-[0.95rem] leading-7 text-slate-300 sm:text-base sm:leading-8">
        {children}
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <ArcShell>
      <div className="mx-auto w-full max-w-6xl px-1 py-8 sm:px-0 sm:py-12 lg:py-16">
        <header className="fade-in grid gap-7 rounded-3xl border border-emerald-300/15 bg-white/[0.035] p-5 shadow-panel sm:p-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
          <div className="min-w-0">
            <p className="arc-section-label">ARC Identity docs</p>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl">
              Introducing ARC Identity
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
              Understand wallet reputation through Arc-native activity, verified attestations, trust graph context, and supporting on-chain intelligence.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Live launch</p>
            <p className="mt-3 text-sm leading-7 text-amber-50/85">
              ARC Identity is now live as an early reputation layer for Arc users and builders. This page explains how ARC Reputation Score, verified attestations, trust graph context, and wallet intelligence work together.
            </p>
          </div>
        </header>

        <div className="docs-content-grid mt-14 grid gap-7 md:mt-16 md:grid-cols-[240px_minmax(0,1fr)] md:items-start lg:mt-20 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="docs-sidebar-column min-w-0 md:sticky md:top-32 md:self-start lg:top-28">
            <DocsOnThisPage items={tocItems} />
          </aside>

          <article className="docs-article grid min-w-0 gap-6 md:gap-7">
            <section id="overview" className="scroll-mt-40 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-5 md:scroll-mt-44 sm:p-7 lg:p-8">
              <p className="arc-section-label">Overview</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">What is ARC Identity?</h2>
              <div className="mt-5 grid gap-4 text-[0.95rem] leading-8 text-slate-300 sm:text-base">
                <p>
                  ARC Identity helps turn wallet activity into a readable reputation profile. Users can claim a <span className="font-bold text-emerald-100">.arcid</span> identity, view wallet intelligence, create verified attestations, explore public profiles, and query reputation data through the Developer API.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["Claim an identity", "Understand reputation", "Share trusted context"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-sm font-bold text-emerald-50">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] p-5 shadow-panel sm:p-7">
              <p className="arc-section-label">Launch phase</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Active development, transparent improvement</h2>
              <div className="mt-5 grid gap-4 text-[0.95rem] leading-7 text-amber-50/85 sm:text-base">
                <p>
                  ARC Identity is launching in an active building phase. The current release focuses on identity claiming, ARC Reputation Score, Global Wallet Intelligence, verified attestations, public profiles, directory discovery, and API access.
                </p>
                <p>
                  Scoring logic, verification safeguards, chain coverage, and developer responses may continue to improve as more users test the platform. If something looks incorrect, use the Report issue button to share bugs, wallet issues, UI glitches, or feedback.
                </p>
              </div>
            </section>

            <section id="two-layer-model" className="scroll-mt-40 md:scroll-mt-44">
              <div className="mb-5 max-w-3xl">
                <p className="arc-section-label">Two-layer model</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Reputation first, context second</h2>
                <p className="mt-4 text-[0.95rem] leading-8 text-slate-300 sm:text-base">
                  ARC Identity separates Arc-native reputation from broader wallet analytics so the score stays meaningful, explainable, and harder to inflate through random activity.
                </p>
              </div>
              <div className="grid gap-5 lg:grid-cols-2">
                <div className="arc-card-hover rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.075] p-5 sm:p-7">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100">Primary layer</p>
                  <h3 className="mt-3 text-2xl font-black text-white">ARC Reputation Score</h3>
                  <p className="mt-4 text-sm leading-7 text-emerald-50/85">
                    ARC Reputation Score measures reputation inside Arc.
                  </p>
                </div>
                <div className="arc-card-hover rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.075] p-5 sm:p-7">
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-100">Secondary layer</p>
                  <h3 className="mt-3 text-2xl font-black text-white">Global Wallet Intelligence</h3>
                  <p className="mt-4 text-sm leading-7 text-cyan-50/85">
                    Global Wallet Intelligence explains broader wallet context.
                  </p>
                </div>
              </div>
            </section>

            <SectionShell id="arc-reputation-score" label="ARC Reputation Score - Primary" title="The main trust signal">
              <div className="grid gap-4">
                <p>
                  ARC Reputation Score is the primary trust signal. It focuses on Arc ecosystem behavior, verified counterparties, transaction-backed attestations, trust graph strength, activity consistency, wallet maturity, and risk checks.
                </p>
                <p>
                  It answers: <span className="font-bold text-emerald-100">&quot;How reputable is this wallet inside the Arc ecosystem?&quot;</span>
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {reputationSignals.map((signal) => (
                  <div key={signal} className="rounded-xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-200">
                    {signal}
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell id="global-wallet-intelligence" label="Global Wallet Intelligence - Secondary" title="Broader wallet context">
              <div className="grid gap-4">
                <p>
                  Global Wallet Intelligence is the supporting context layer. It helps users understand a wallet&apos;s broader on-chain footprint through wallet age, chain coverage, indexed activity, transaction history, and general wallet behavior.
                </p>
                <p>
                  It answers: <span className="font-bold text-cyan-100">&quot;What does this wallet&apos;s broader on-chain history look like?&quot;</span>
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {walletIntelligenceSignals.map((signal) => (
                  <div key={signal} className="rounded-xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-sm font-semibold text-slate-200">
                    {signal}
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell id="why-separation-matters" label="Why this separation matters" title="Reputation is not raw activity volume">
              <div className="grid gap-4">
                <p>
                  Many scoring systems reward raw transaction volume. ARC Identity avoids making random multi-chain activity the main reputation driver.
                </p>
                <p>
                  Broader wallet data can support confidence, but the primary score remains focused on Arc-native reputation and verified relationships.
                </p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-emerald-300/20 bg-emerald-300/[0.07] p-5">
                  <p className="text-sm font-black text-white">ARC Reputation Score</p>
                  <p className="mt-2 text-sm leading-6 text-emerald-50/80">Reputation inside the Arc ecosystem.</p>
                </div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.07] p-5">
                  <p className="text-sm font-black text-white">Global Wallet Intelligence</p>
                  <p className="mt-2 text-sm leading-6 text-cyan-50/80">Broader wallet history and context.</p>
                </div>
              </div>
            </SectionShell>

            <section id="verified-attestations" className="scroll-mt-40 grid gap-5 md:scroll-mt-44 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Verified Attestations</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Transaction-backed trust</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  Verified Attestations let registered ARC Identity users create transaction-backed trust signals with each other. They are designed to prove real interactions, strengthen reputation history, and improve trust graph context.
                </p>
                <div className="mt-6 grid gap-2.5 text-sm text-slate-300">
                  {attestationChecks.map((item) => (
                    <p key={item} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">{item}</p>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Trust Graph</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Relationships make reputation contextual</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  The Trust Graph adds relationship context to reputation. Instead of treating a wallet as an isolated score, it looks at verified counterparties, relationship quality, and network strength.
                </p>
                <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-5">
                  <p className="text-sm font-bold leading-7 text-slate-200">
                    A wallet&apos;s reputation becomes stronger when it connects to verified, meaningful, and non-abusive interactions across the Arc ecosystem.
                  </p>
                </div>
              </div>
            </section>

            <section id="developer-api" className="scroll-mt-40 grid gap-5 md:scroll-mt-44 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Public Profiles and Directory</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Shareable identity pages</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  Public profiles make ARC Identity shareable. The directory helps users discover registered identities and inspect reputation context before interacting.
                </p>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Developer API</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Reputation data for builders</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  The Developer API gives builders access to ARC Score and wallet reputation context through clean public responses. It supports wallet lookup, username lookup, score explanations, intelligence status, and coverage context.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7 lg:p-8">
              <p className="arc-section-label">FAQ</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Common questions</h2>
              <div className="mt-6 grid gap-3">
                {faqItems.map((item) => (
                  <div key={item.question} className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4 sm:p-5">
                    <h3 className="text-base font-black text-white">{item.question}</h3>
                    <p className="mt-2 text-sm leading-7 text-slate-300">{item.answer}</p>
                  </div>
                ))}
              </div>
            </section>

            <section id="get-started" className="scroll-mt-40 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.075] p-5 shadow-panel md:scroll-mt-44 sm:p-8">
              <p className="arc-section-label">Get started</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Start using ARC Identity</h2>
              <p className="mt-4 max-w-3xl text-[0.95rem] leading-8 text-emerald-50/85 sm:text-base">
                Start with your wallet, then build reputation through verified Arc activity.
              </p>
              <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {ctaLinks.map(([label, href], index) => (
                  <Link
                    key={href}
                    href={href}
                    className={index === 0
                      ? "arc-button-primary rounded-xl px-4 py-4 text-center text-sm font-black"
                      : "arc-button-secondary rounded-xl px-4 py-4 text-center text-sm font-extrabold"}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            </section>
          </article>
        </div>
      </div>
    </ArcShell>
  );
}
