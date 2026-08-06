import type { Metadata } from "next";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { DocsOnThisPage } from "@/components/DocsOnThisPage";

export const metadata: Metadata = {
  title: "Arc Identity Docs",
  description: "How Arc Identity turns wallet history, verified attestations and trust graph evidence into one explainable reputation score."
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
    body: "Connect an injected EVM wallet, sign an ownership message and claim a public .arcid username. The signature proves control before anything is written."
  },
  {
    title: "Identity Score",
    body: "One reputation score from 0 to 100. It combines indexed wallet history, Arc ecosystem activity, verified attestations and risk signals into a single number."
  },
  {
    title: "Global wallet profile",
    body: "Multi-chain context: wallet age, transaction count, chain coverage, counterparties and contract interactions across supported networks."
  },
  {
    title: "Arc network footprint",
    body: "Arc-specific activity read live from Arc RPC and indexing, backed by verified Arc transaction attestations when explorer coverage is limited."
  },
  {
    title: "Verified attestations",
    body: "Transaction-backed trust evidence. An attestation only exists after the submitted Arc transaction is verified against both wallets."
  },
  {
    title: "Trust graph",
    body: "Verified wallet-to-wallet edges with reciprocal relationships, network maturity, anomaly hints and tightly capped trust propagation."
  }
];

const scoreComponents: [string, string, string][] = [
  ["Global wallet age", "20 pts", "Maturity from the earliest real indexed transaction across supported chains."],
  ["Chain coverage", "5 pts", "Supporting context from active chains with successfully indexed activity."],
  ["Indexed transactions", "15 pts", "Maturity context from real indexed transactions. Raw volume alone cannot dominate the score."],
  ["Counterparty diversity", "15 pts", "Unique global counterparties plus higher-signal Arc and verified transaction relationships."],
  ["Arc activity", "25 pts", "Arc transactions, Arc counterparties, active days, Arc age and the current balance signal."],
  ["Verified attestations", "15 pts", "Only transaction-backed attestations with unique tx hashes and registered counterparties."],
  ["Trust propagation", "5 pts", "A tightly capped signal from verified trust edges. Network influence cannot outweigh wallet behavior."],
  ["Risk penalty", "up to -10 pts", "Applied only from supported anomaly evidence or excessive repeated-pair concentration."]
];

const attestationChecks = [
  "Requires a real Arc transaction hash",
  "Transaction must exist and succeed on Arc",
  "Connected wallet and selected counterparty must both participate",
  "Duplicate transaction hashes cannot be reused",
  "Self-attestations and unsupported interaction types are rejected",
  "Only verified transaction-backed attestations can create trust edges"
];

const providerStates: [string, "green" | "amber" | "rose" | null, string][] = [
  ["Indexed", "green", "Provider returned usable activity and the chain contributes real indexed data."],
  ["No activity", null, "Provider responded successfully but found no transactions for the wallet."],
  ["Limited", "amber", "External provider access is unavailable, rate limited, paywalled or temporarily restricted."],
  ["Not configured", "rose", "Required API key or provider configuration is missing."],
  ["Pending", null, "The wallet has not been checked yet or a refresh is still running."]
];

const endpoints: [string, string, string][] = [
  ["GET", "/api/score/:wallet", "Cached-first score with breakdown, explanations, chain coverage and trust summary."],
  ["POST", "/api/score/:wallet/refresh", "Runs a full wallet intelligence refresh through the background-safe pipeline."],
  ["GET", "/api/profile/:username", "Public profile: wallet, score, attestations, reputation events and trust graph context."],
  ["GET", "/api/profile/by-wallet/:wallet", "Resolves a wallet address to its claimed identity and cached profile."],
  ["GET", "/api/users", "Claimed public identities for the directory."],
  ["POST", "/api/attestations/request", "Creates a transaction-backed attestation after Arc transaction verification."],
  ["POST", "/api/attestations/respond", "Lets the counterparty accept or decline a pending attestation."],
  ["GET", "/api/trust/:wallet", "Trust edges, snapshots, anomalies, reciprocal peers and network metrics."],
  ["GET", "/api/onchain/:wallet", "Raw indexed on-chain intelligence for the wallet across supported chains."]
];

const faqItems = [
  {
    question: "Is Arc Identity a manual reputation form?",
    answer: "No. Profiles are wallet-owned. Reputation comes from indexed wallet activity, verified transaction-backed attestations and trust graph context. Claiming a username adds zero points."
  },
  {
    question: "Why can some chains show Limited?",
    answer: "Some external indexers have rate limits, plan restrictions or temporary outages. Limited means provider coverage is constrained, not that the wallet is risky."
  },
  {
    question: "Can someone farm score with fake attestations?",
    answer: "Attestations only count after the Arc transaction is verified on chain. The backend checks participants, duplicate use and relationship rules before any trust is created."
  },
  {
    question: "Does the score update instantly?",
    answer: "Score reads are cached-first for fast pages. Full indexing runs through a refresh pipeline and the dashboard keeps the last good score visible while a refresh completes."
  },
  {
    question: "Is the system final?",
    answer: "No. Arc Identity is in an active launch phase. Score explanations, provider coverage, trust safeguards and developer responses keep improving as usage grows."
  }
];

function DocSection({
  id,
  label,
  title,
  children
}: {
  id?: string;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="r4-panel scroll-mt-40 pt-6 md:scroll-mt-44">
      <p className="arc-section-label">{label}</p>
      <h2 className="mt-2.5 text-2xl font-extrabold text-ink sm:text-3xl">{title}</h2>
      <div className="mt-5 text-[0.95rem] leading-7 text-mutedc">{children}</div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <ArcShell>
      <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8 lg:py-14">
        <header>
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-mutedc">Docs / Identity model</p>
          <h1 className="mt-3 font-heading text-5xl font-semibold tracking-tight text-ink sm:text-6xl">Identity model</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-mutedc">
            Arc Identity indexes wallet activity, verifies Arc transactions and turns trust relationships into one portable reputation credential for stablecoin apps. This page documents how every point of that credential is earned.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {["Wallet-owned identity", "Transaction-verified trust", "Cached API intelligence"].map((item) => (
              <span key={item} className="rounded-[2px] border border-linec px-3 py-1.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-ink">{item}</span>
            ))}
          </div>
        </header>

        <div className="docs-content-grid mt-12 grid gap-10 md:grid-cols-[240px_minmax(0,1fr)] md:items-start lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="docs-sidebar-column min-w-0 md:sticky md:top-32 md:self-start lg:top-28">
            <DocsOnThisPage items={tocItems} />
          </aside>

          <article className="docs-article grid min-w-0 gap-12">
            <DocSection id="overview" label="Overview" title="What Arc Identity does">
              <div className="grid gap-4">
                <p>
                  Arc Identity is a wallet credential layer for Arc and stablecoin applications. A user connects an EVM wallet, signs a verification message, claims a public <span className="font-bold text-ink">.arcid</span> profile and receives an Identity Score based on real indexed activity and verified transaction evidence.
                </p>
                <p>
                  The product is built for checks that happen before payments, lending, escrow, protected deals, merchant flows and higher-value stablecoin interactions.
                </p>
              </div>
              <div className="mt-6 border-t border-linec pt-4">
                <p className="kicker">Launch phase</p>
                <p className="mt-2.5 leading-7">
                  Arc Identity runs on wallet signatures, Supabase persistence, Arc transaction verification, external chain indexers, cached score snapshots and verified trust graph records. Some external providers can be rate limited or plan restricted. The UI reports those cases as Limited coverage so the product stays understandable while Arc-native data and cached intelligence remain visible.
                </p>
              </div>
            </DocSection>

            <DocSection id="core-primitives" label="Core primitives" title="The building blocks">
              <div className="grid gap-x-8 sm:grid-cols-2">
                {primitives.map((item) => (
                  <div key={item.title} className="border-t border-linec py-4">
                    <h3 className="text-base font-extrabold text-ink">{item.title}</h3>
                    <p className="mt-1.5 text-sm leading-6">{item.body}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="score-model" label="Score model" title="One score, explainable components">
              <div className="grid gap-4">
                <p>
                  Arc Identity exposes one primary score. Supporting components explain why the score moved but they are not separate competing scores.
                </p>
                <p>
                  Score model <span className="font-mono text-[0.85rem] font-bold text-ink">v2_2026_07</span> combines global wallet maturity, Arc-specific activity, verified transaction attestations, capped trust propagation and evidence-based risk controls. Component points sum to the score after any risk penalty, then clamp from 0 to 100.
                </p>
                <p>
                  Claiming a username grants no points. A fresh wallet with no indexed activity, no Arc footprint, no verified attestations and no trust graph evidence starts at the real component total: 0. The score rises only when Arc Identity can verify meaningful wallet behavior.
                </p>
              </div>
              <div className="mt-6 grid">
                {scoreComponents.map(([name, points, description]) => (
                  <div key={name} className="grid gap-x-6 gap-y-1 border-t border-linec py-3.5 sm:grid-cols-[210px_92px_minmax(0,1fr)]">
                    <p className="text-sm font-extrabold text-ink">{name}</p>
                    <p className="font-mono text-[0.72rem] font-bold uppercase tracking-[0.08em] text-gold">{points}</p>
                    <p className="text-sm leading-6">{description}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 border-t-2 border-gold pt-4">
                <p className="kicker text-gold">Score stability</p>
                <p className="mt-2.5 text-sm leading-7">
                  The same persisted evidence always produces the same score. A refresh commits atomically only after indexing finishes. Temporary provider failures preserve the last verified evidence instead of treating unavailable chains as zero, so repeating refresh cannot walk a score up or down.
                </p>
              </div>
            </DocSection>

            <DocSection id="verified-attestations" label="Verified attestations" title="Transaction-backed trust">
              <p>
                Verified attestations are not social claims. A user submits an Arc transaction hash, a registered counterparty and an interaction type. The backend verifies the transaction on chain before any reputation or trust graph effect is applied, and the counterparty can accept or decline.
              </p>
              <div className="mt-5 grid">
                {attestationChecks.map((item, index) => (
                  <div key={item} className="flex items-baseline gap-4 border-t border-linec py-3">
                    <span className="font-mono text-[0.65rem] font-bold text-mutedc">{String(index + 1).padStart(2, "0")}</span>
                    <p className="text-sm leading-6 text-ink">{item}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-[2px] border border-limited/50 bg-[#ece3cf] p-4">
                <p className="text-sm font-semibold leading-6 text-[#6d5b33]">
                  Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity or abusive verification behavior can reduce trust confidence and trigger anomaly records.
                </p>
              </div>
            </DocSection>

            <DocSection id="trust-graph" label="Trust graph" title="Verified relationships, not social follows">
              <div className="grid gap-4">
                <p>
                  Trust edges are created only from accepted, verified transaction-backed attestations. Usernames, manual profile data and unverified activity do not create graph relationships.
                </p>
                <p>
                  The graph tracks trusted peers, strongest relationships, reciprocal edges, total trust weight, network maturity, anomaly hints and a capped propagated trust contribution. The dashboard renders it as a live instrument where distance from the center reflects trust weight.
                </p>
              </div>
              <div className="mt-6 grid gap-x-8 sm:grid-cols-3">
                {[
                  ["Verified edges only", "Every edge maps to a real Arc transaction between two registered identities."],
                  ["Reciprocal confidence", "Two-way relationships carry more signal than one-way attestations."],
                  ["Capped propagation", "Trust flowing through the network is limited to 5 points of the score."]
                ].map(([title, body]) => (
                  <div key={title} className="border-t border-linec py-4">
                    <p className="text-sm font-extrabold text-ink">{title}</p>
                    <p className="mt-1.5 text-sm leading-6">{body}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="reliability-model" label="Reliability model" title="Fast reads, careful refreshes">
              <div className="grid gap-4">
                <p>
                  Score reads are cached-first. <span className="font-mono text-[0.85rem] font-bold text-ink">GET /api/score/:wallet</span> returns the best available cached profile quickly, including cache status, refresh status, last indexed time, explanations, chain coverage and trust summary.
                </p>
                <p>
                  Full indexing happens through <span className="font-mono text-[0.85rem] font-bold text-ink">POST /api/score/:wallet/refresh</span>. The pipeline uses lifecycle states so incomplete or failed provider checks never overwrite the last good cached score.
                </p>
              </div>
              <div className="mt-6 grid">
                {providerStates.map(([state, tone, description]) => (
                  <div key={state} className="grid items-baseline gap-x-6 gap-y-1 border-t border-linec py-3.5 sm:grid-cols-[160px_minmax(0,1fr)]">
                    {tone ? (
                      <span className={`chip ${tone} justify-self-start`}><span className="dot" />{state}</span>
                    ) : (
                      <span className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.12em] text-mutedc">{state}</span>
                    )}
                    <p className="text-sm leading-6">{description}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="developer-api" label="Developer API" title="Reputation data for builders">
              <p>
                Any Arc app can query Arc Identity before payments, lending, escrow, protected deals, merchant flows or high-value stablecoin interactions. Full request and response documentation lives on the <Link href="/developers" className="font-bold text-ink underline decoration-gold decoration-2 underline-offset-4 transition hover:text-gold">Developer API page</Link>.
              </p>
              <div className="mt-5 grid">
                {endpoints.map(([method, path, description]) => (
                  <div key={path} className="grid gap-x-5 gap-y-1 border-t border-linec py-3.5 lg:grid-cols-[56px_300px_minmax(0,1fr)]">
                    <p className={`font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] ${method === "POST" ? "text-gold" : "text-mutedc"}`}>{method}</p>
                    <p className="break-all font-mono text-[0.82rem] font-bold text-ink">{path}</p>
                    <p className="text-sm leading-6">{description}</p>
                  </div>
                ))}
              </div>
              <div className="credential-plate mt-7">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <p className="kicker" style={{ color: "#b8bdb2" }}>Sample response</p>
                  <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em]" style={{ color: "#9aa093" }}>GET /api/score/:wallet</p>
                </div>
                <pre className="mt-4 overflow-x-auto font-mono text-xs leading-6" style={{ color: "#e6e2d4" }}>
                  <code>{`{
  "walletAddress": "0x...",
  "username": "example.arcid",
  "arcIdentityScore": 72,
  "scoreModelVersion": "arc_score_v2_2026_07",
  "riskLevel": "Reliable",
  "cacheStatus": "cached",
  "refreshStatus": "committed",
  "breakdown": {
    "globalWalletAge": 16,
    "crossChainActivity": 4,
    "transactionActivity": 11,
    "arcActivity": 18,
    "counterpartyDiversity": 9,
    "verifiedAttestations": 10,
    "propagatedTrust": 4,
    "riskPenalty": 0
  },
  "trustGraph": {
    "trustedPeerCount": 2,
    "networkHealth": "emerging",
    "trustConfidence": 64
  }
}`}</code>
                </pre>
              </div>
            </DocSection>

            <DocSection label="FAQ" title="Common questions">
              <div className="grid">
                {faqItems.map((item) => (
                  <div key={item.question} className="border-t border-linec py-4">
                    <h3 className="text-base font-extrabold text-ink">{item.question}</h3>
                    <p className="mt-1.5 text-sm leading-7">{item.answer}</p>
                  </div>
                ))}
              </div>
            </DocSection>

            <DocSection id="get-started" label="Get started" title="Run the launch flow">
              <p>
                Connect a wallet, sign the ownership message, claim a username and refresh wallet intelligence. Then inspect your public profile and try a transaction-backed attestation once you have a real Arc transaction with another registered identity.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Link href="/dashboard" className="border-2 border-ink bg-ink px-4 py-3.5 text-center text-sm font-bold text-bone transition hover:bg-[#3a3e3a]">
                  Launch Arc Identity
                </Link>
                {[
                  ["View directory", "/directory"],
                  ["Developer API", "/developers"],
                  ["Verified attestations", "/attestations"]
                ].map(([label, href]) => (
                  <Link key={href} href={href} className="border border-linec px-4 py-3.5 text-center text-sm font-bold text-ink transition hover:border-ink">
                    {label}
                  </Link>
                ))}
              </div>
            </DocSection>
          </article>
        </div>
      </div>
    </ArcShell>
  );
}
