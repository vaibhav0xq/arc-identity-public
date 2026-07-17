import type { Metadata } from "next";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { DocsOnThisPage } from "@/components/DocsOnThisPage";

export const metadata: Metadata = {
  title: "ARC Identity Docs",
  description: "Documentation for ARC Identity wallet intelligence, verified attestations, trust graph context, and developer APIs."
};

const tocItems: { label: string; href: `#${string}` }[] = [
  { label: "Overview", href: "#overview" },
  { label: "Core primitives", href: "#core-primitives" },
  { label: "Score model", href: "#score-model" },
  { label: "Verified attestations", href: "#verified-attestations" },
  { label: "Trust graph", href: "#trust-graph" },
  { label: "Reliability model", href: "#reliability-model" },
  { label: "Developer API", href: "#developer-api" },
  { label: "Get started", href: "#get-started" }
];

const primitives = [
  {
    title: "Wallet identity",
    body: "Users connect an injected EVM wallet, sign an ownership message, and claim a public .arcid username."
  },
  {
    title: "ARC Identity Score",
    body: "A single reputation score that combines indexed wallet behavior, Arc activity, verified attestations, and risk signals."
  },
  {
    title: "Global wallet profile",
    body: "Multi-chain context including wallet age, transaction count, chain coverage, counterparties, and contract interactions."
  },
  {
    title: "Arc network footprint",
    body: "Arc-specific activity from Arc RPC/indexing plus verified Arc transaction attestations when explorer coverage is limited."
  },
  {
    title: "Verified attestations",
    body: "Transaction-backed trust evidence created only when a submitted Arc transaction is verified against both wallets."
  },
  {
    title: "Trust graph",
    body: "Verified wallet-to-wallet edges, reciprocal relationships, network maturity, anomaly hints, and capped trust propagation."
  }
];

const scoreComponents = [
  ["Global Wallet Age", "Based on the earliest real indexed transaction across supported chains."],
  ["Cross-chain Activity", "Based on indexed transaction volume, active chains, recent activity, and contract interaction history."],
  ["Arc Activity", "Based on Arc Testnet footprint, Arc attestations, Arc counterparties, active days, and Arc balance signals."],
  ["Counterparty Diversity", "Based on unique counterparties across indexed chains, with Arc relationships treated as higher-signal context."],
  ["Verified Attestations", "Based only on transaction-backed attestations with unique tx hashes and registered counterparties."],
  ["Trust Propagation", "A capped network signal from verified trust edges. It can help, but it cannot dominate the base score."],
  ["Risk Penalty", "Applied when anomaly signals, low confidence, repetitive behavior, or suspicious trust patterns appear."]
];

const attestationChecks = [
  "Requires a real Arc Testnet transaction hash",
  "Transaction must exist and succeed on Arc",
  "Connected wallet and selected counterparty must both participate",
  "Duplicate transaction hashes cannot be reused",
  "Self-attestations and unsupported interaction types are rejected",
  "Only verified transaction-backed attestations can create trust edges"
];

const providerStates = [
  ["INDEXED", "Provider returned usable activity and the chain contributes real indexed data."],
  ["NO ACTIVITY", "Provider responded successfully, but no transactions were found for the wallet."],
  ["LIMITED", "External provider access is unavailable, rate limited, paywalled, or temporarily restricted."],
  ["NOT CONFIGURED", "Required API key or provider configuration is missing."],
  ["PENDING", "The wallet has not been checked yet or refresh is still running."]
];

const endpoints = [
  ["GET", "/api/score/:wallet", "Cached-first score, breakdown, explanations, chain coverage, and trust summary."],
  ["POST", "/api/score/:wallet/refresh", "Runs a full wallet intelligence refresh in the background-safe refresh pipeline."],
  ["GET", "/api/profile/:username", "Public profile, wallet, score, attestations, reputation events, and trust graph context."],
  ["GET", "/api/users", "Claimed public identities for the directory."],
  ["POST", "/api/attestations/request", "Creates a verified transaction-backed attestation after Arc transaction verification."],
  ["GET", "/api/trust/:wallet", "Trust edges, snapshots, anomalies, reciprocal peers, and network metrics."]
];

const faqItems = [
  {
    question: "Is ARC Identity a manual reputation form?",
    answer: "No. Profiles are wallet-owned, and reputation comes from indexed wallet activity, verified transaction-backed attestations, and trust graph context."
  },
  {
    question: "Why can some chains show LIMITED?",
    answer: "Some external indexers have rate limits, API plan restrictions, or temporary outages. LIMITED means provider coverage is constrained, not that the wallet is risky."
  },
  {
    question: "Can someone farm score with fake attestations?",
    answer: "ARC Identity only scores transaction-backed attestations. The backend verifies the Arc transaction, participants, duplicate use, and relationship rules before trust is created."
  },
  {
    question: "Does the score update instantly?",
    answer: "The score API is cached-first for fast UX. Full indexing runs through a refresh pipeline, and the dashboard keeps the last good cached score visible while refreshes complete."
  },
  {
    question: "Is the system final?",
    answer: "No. ARC Identity is in an active launch phase. Score explanations, provider coverage, trust safeguards, and developer responses will keep improving as usage grows."
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

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mt-5 overflow-x-auto rounded-2xl border border-white/[0.08] bg-slate-950/70 p-4 text-xs leading-6 text-emerald-100 sm:text-sm">
      <code>{children}</code>
    </pre>
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
              Real wallet intelligence for Arc users.
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
              ARC Identity indexes wallet activity, verifies Arc transactions, and turns trust relationships into one portable reputation credential for stablecoin apps.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-5">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-100">Launch guide</p>
            <p className="mt-3 text-sm leading-7 text-amber-50/85">
              This page documents the current production architecture: wallet signatures, Supabase persistence, cached score refreshes, transaction-backed attestations, provider fallbacks, and trust graph intelligence.
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
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">What ARC Identity does</h2>
              <div className="mt-5 grid gap-4 text-[0.95rem] leading-8 text-slate-300 sm:text-base">
                <p>
                  ARC Identity is a wallet credential layer for Arc and stablecoin applications. A user connects an EVM wallet, signs a verification message, claims a public <span className="font-bold text-emerald-100">.arcid</span> profile, and receives an ARC Identity Score based on real indexed activity and verified transaction evidence.
                </p>
                <p>
                  The product is built for checks that happen before payments, lending, escrow, protected deals, merchant flows, and higher-value stablecoin interactions.
                </p>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {["Wallet-owned identity", "Transaction-verified trust", "Cached API intelligence"].map((item) => (
                  <div key={item} className="rounded-xl border border-white/[0.06] bg-white/[0.035] px-4 py-3 text-sm font-bold text-emerald-50">
                    {item}
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.055] p-5 shadow-panel sm:p-7">
              <p className="arc-section-label">Launch phase</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Production-minded, still improving</h2>
              <div className="mt-5 grid gap-4 text-[0.95rem] leading-7 text-amber-50/85 sm:text-base">
                <p>
                  ARC Identity no longer depends on demo users, local JSON storage, or manual score farming. Current data flows through wallet signatures, Supabase, Arc transaction verification, external chain indexers, cached score snapshots, and verified trust graph records.
                </p>
                <p>
                  Some external chain providers can be rate limited or plan restricted. The UI treats those cases as LIMITED provider availability so the product stays understandable while Arc-native data and cached intelligence remain visible.
                </p>
              </div>
            </section>

            <SectionShell id="core-primitives" label="Core primitives" title="The building blocks">
              <div className="grid gap-4 sm:grid-cols-2">
                {primitives.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-4">
                    <h3 className="text-base font-black text-white">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.body}</p>
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell id="score-model" label="Score model" title="One score, explainable components">
              <div className="grid gap-4">
                <p>
                  ARC Identity exposes one primary score. Supporting components explain why the score moved, but they are not separate competing scores.
                </p>
                <p>
                  The score combines global wallet credibility, Arc-specific activity, verified attestations, trust graph context, and risk analysis. It is clamped from 0 to 100 and mapped into familiar risk levels: High Risk, New / Unproven, Reliable, and Trusted.
                </p>
                <p>
                  Claiming a username or creating a profile does not grant reputation points. A fresh wallet with no indexed activity, no Arc footprint, no verified transaction attestations, and no trust graph evidence starts from the real component total: 0. The score rises only when ARC Identity can verify meaningful wallet behavior.
                </p>
              </div>
              <div className="mt-6 grid gap-3">
                {scoreComponents.map(([name, description]) => (
                  <div key={name} className="rounded-xl border border-white/[0.06] bg-white/[0.035] p-4">
                    <p className="text-sm font-black text-white">{name}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-300">{description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5">
                <p className="text-sm font-black text-cyan-50">Score stability</p>
                <p className="mt-2 text-sm leading-7 text-cyan-50/80">
                  Refreshes are dampened to avoid scary unexplained drops. Passive recalculations are labeled as score recalibrations, while strong negative styling is reserved for real risk events, anomaly signals, or suspicious behavior.
                </p>
              </div>
            </SectionShell>

            <section id="verified-attestations" className="scroll-mt-40 grid gap-5 md:scroll-mt-44 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Verified Attestations</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Transaction-backed trust</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  Verified Attestations are not social claims. A user submits an Arc transaction hash, a registered counterparty, and an interaction type. The backend verifies the transaction before any reputation or trust graph effect is applied.
                </p>
                <div className="mt-6 grid gap-2.5 text-sm text-slate-300">
                  {attestationChecks.map((item) => (
                    <p key={item} className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3">{item}</p>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel sm:p-7">
                <p className="arc-section-label">Anti-spam model</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Trust has friction</h2>
                <p className="mt-5 text-[0.95rem] leading-8 text-slate-300">
                  Attestations use duplicate prevention, self-attestation blocking, relationship cooldowns, counterparty checks, and diminishing relationship influence. Circular trust farming or low-diversity behavior can reduce trust confidence and trigger anomaly records.
                </p>
                <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-300/[0.06] p-5">
                  <p className="text-sm font-bold leading-7 text-amber-50/85">
                    Only submit attestations for legitimate economic interactions. ARC Identity is designed to reward real transaction evidence, not coordinated self-reporting.
                  </p>
                </div>
              </div>
            </section>

            <SectionShell id="trust-graph" label="Trust graph" title="Verified relationships, not social follows">
              <div className="grid gap-4">
                <p>
                  Trust edges are created only from accepted, verified transaction-backed attestations. Usernames, manual profile data, and unverified activity do not create graph relationships.
                </p>
                <p>
                  The trust graph tracks trusted peers, strongest relationships, reciprocal edges, total trust weight, network maturity, anomaly hints, and capped propagated trust contribution.
                </p>
              </div>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                {["Verified edges only", "Reciprocal confidence", "Capped propagation"].map((item) => (
                  <div key={item} className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 text-sm font-black text-emerald-50">
                    {item}
                  </div>
                ))}
              </div>
            </SectionShell>

            <SectionShell id="reliability-model" label="Reliability model" title="Fast reads, careful refreshes">
              <div className="grid gap-4">
                <p>
                  Score reads are cached-first. <span className="font-bold text-white">GET /api/score/:wallet</span> returns the best available cached profile quickly, including cache status, refresh status, last indexed time, explanations, chain coverage, and trust summary.
                </p>
                <p>
                  Full indexing happens through <span className="font-bold text-white">POST /api/score/:wallet/refresh</span>. The refresh pipeline uses lifecycle states so incomplete or failed provider checks do not overwrite the last good cached score.
                </p>
              </div>
              <div className="mt-6 grid gap-3">
                {providerStates.map(([state, description]) => (
                  <div key={state} className="grid gap-2 rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 sm:grid-cols-[150px_minmax(0,1fr)]">
                    <p className="text-sm font-black text-white">{state}</p>
                    <p className="text-sm leading-6 text-slate-300">{description}</p>
                  </div>
                ))}
              </div>
            </SectionShell>

            <section id="developer-api" className="scroll-mt-40 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-5 shadow-panel md:scroll-mt-44 sm:p-7 lg:p-8">
              <p className="arc-section-label">Developer API</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Reputation data for builders</h2>
              <p className="mt-5 max-w-4xl text-[0.95rem] leading-8 text-slate-300 sm:text-base">
                Any Arc app can use ARC Identity before payments, lending, escrow, protected deals, merchant flows, or high-value stablecoin interactions.
              </p>
              <div className="mt-6 grid gap-3">
                {endpoints.map(([method, path, description]) => (
                  <div key={path} className="grid gap-3 rounded-xl border border-white/[0.06] bg-white/[0.035] p-4 lg:grid-cols-[72px_260px_minmax(0,1fr)]">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-100">{method}</p>
                    <p className="break-all font-mono text-sm font-bold text-white">{path}</p>
                    <p className="text-sm leading-6 text-slate-300">{description}</p>
                  </div>
                ))}
              </div>
              <CodeBlock>{`{
  "walletAddress": "0x...",
  "username": "example.arcid",
  "arcIdentityScore": 72,
  "riskLevel": "Reliable",
  "cacheStatus": "cached",
  "refreshStatus": "committed",
  "dataSource": "arc_rpc_plus_transaction_verified_attestations",
  "breakdown": {
    "globalWalletAge": 16,
    "crossChainActivity": 12,
    "arcActivity": 18,
    "verifiedAttestations": 15,
    "propagatedTrust": 6,
    "riskPenalty": 0
  },
  "explanations": {
    "globalWalletAge": "Based on earliest indexed transaction.",
    "verifiedAttestations": "Based on verified transaction attestations."
  },
  "trustGraph": {
    "trustedPeerCount": 2,
    "networkHealth": "emerging",
    "trustConfidence": 64
  }
}`}</CodeBlock>
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
              <h2 className="mt-3 text-3xl font-black tracking-tight text-white">Run the launch flow</h2>
              <p className="mt-4 max-w-3xl text-[0.95rem] leading-8 text-emerald-50/85 sm:text-base">
                Connect a wallet, sign the ownership message, claim a username, refresh wallet intelligence, inspect the public profile, and try a transaction-backed attestation when you have a real Arc transaction with another registered identity.
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

