"use client";

import { DeveloperApiDemo } from "@/components/DeveloperApiDemo";
import { WalletGate } from "@/components/WalletGate";

const sample = {
  walletAddress: "0x...",
  username: "yourname.arcid",
  score: 68,
  arcIdentityScore: 68,
  riskLevel: "Reliable",
  dataSource: "cached",
  intelligenceStatus: "indexed",
  cacheStatus: "cached",
  lastIndexedAt: "2026-05-18T09:30:00.000Z",
  globalWalletAgeDays: 420,
  arcWalletAgeDays: 14,
  activeChains: ["Ethereum Mainnet", "Base", "Arc Testnet"],
  totalTxCount: 184,
  arcTxCount: 7,
  indexedChains: [
    { chain: "Ethereum Mainnet", status: "indexed", txCount: 120, providerSource: "cached_wallet_intelligence" },
    { chain: "Base", status: "indexed", txCount: 57, providerSource: "cached_wallet_intelligence" },
    { chain: "BNB Chain", status: "limited", txCount: 0, providerSource: "limited_coverage", errorMessage: "Some chain data is temporarily unavailable." }
  ],
  dataSources: {
    global: "cached_wallet_intelligence",
    arc: "cached_wallet_intelligence"
  },
  coverageIssues: [
    { chain: "BNB Chain", status: "limited", message: "Some chain data is temporarily unavailable." }
  ],
  trustGraph: {
    trustedPeerCount: 3,
    totalTrustWeight: 128,
    strongestConnectionWallet: "0xabc...",
    reciprocalCount: 1,
    networkHealth: "healthy",
    propagatedTrustScore: 7.4,
    trustConfidence: 78,
    anomalyScore: 0,
    maturityReason: "Based on verified peers, reciprocal relationships and trust confidence.",
    suspicious: false
  },
  explanations: {
    globalWalletAge: "Wallet maturity supports anti-sybil confidence from 420 indexed days.",
    crossChainActivity: "Global chain coverage provides supporting context from 3 active indexed chains.",
    counterpartyDiversity: "Verified and Arc-weighted counterparties support reputation depth.",
    arcActivity: "Arc ecosystem activity is based on Arc transactions, Arc counterparties and active days.",
    indexedChainDepth: "Chain explorer data is wallet intelligence context, not the primary reputation driver.",
    verifiedAttestations: "Verified transaction-backed attestations are a primary Identity Score driver.",
    riskPenalty: "No risk penalty is currently applied."
  }
};

export function DevelopersPageClient() {
  return (
    <WalletGate
      sectionLabel="Developer API"
      title="Connect your wallet to view Arc Identity developer tools."
      description="Connect your wallet to explore API examples and live credential demos."
    >
      <div className="min-w-0 py-4 sm:py-6 lg:py-2">
        <header className="border-b border-linec pb-7 pt-2 sm:pb-9">
          <p className="kicker">Developer API / credential registry</p>
          <div className="mt-4 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-4xl">
              <h1 className="text-5xl font-semibold text-ink sm:text-6xl lg:text-[4.7rem]">
                Arc-native reputation API
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-mutedc sm:text-lg">
                Query a wallet or username and receive a stable reputation signal built from Arc activity,
                transaction-backed attestations, verified counterparties, trust graph context and wallet intelligence.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <span className="chip"><span className="dot" />Live registry</span>
              <span className="chip">v2 · JSON</span>
            </div>
          </div>
        </header>

        <div className="mt-8 min-w-0">
          <section className="r4-panel min-w-0" aria-labelledby="endpoints-title">
            <div className="r4-panel-head">
              <div>
                <p className="kicker">Surface map</p>
                <h2 id="endpoints-title" className="mt-1 font-heading text-2xl font-semibold">Available endpoints</h2>
              </div>
              <span className="font-mono text-[0.65rem] text-quiet">05 routes</span>
            </div>
            <div className="r4-panel-body px-0 sm:px-0">
              <div className="grid min-w-0 gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                {[
                  ["GET", "/api/score/:wallet", "Identity score + evidence"],
                  ["GET", "/api/profile/:username", "Public identity record"],
                  ["GET", "/api/trust/:wallet", "Trust graph context"],
                  ["GET", "/api/users?sort=score|activity|newest|risk", "Directory query"],
                  ["POST", "/api/attestations/request", "Request a transaction-backed attestation"]
                ].map(([method, route, description]) => (
                  <div className="ledger-row" key={route}>
                    <span className="min-w-0">
                      <code className="block overflow-x-auto whitespace-nowrap font-mono text-xs text-ink">{route}</code>
                      <small>{description}</small>
                    </span>
                    <span className="chip">{method}</span>
                  </div>
                ))}
              </div>
              <div className="verify-note mt-5">
                Score responses are cache-aware. Use the returned source and indexed timestamp when presenting a credential.
              </div>
            </div>
          </section>

          <section className="credential-plate mt-10 min-w-0" aria-labelledby="response-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="kicker" style={{ color: "#b8bdb2" }}>Response specimen</p>
                <h2 id="response-title" className="mt-2 font-heading text-3xl font-semibold text-bone">Credential payload</h2>
              </div>
              <span className="chip">200 · cached</span>
            </div>
            <p className="plate-line mt-5 text-sm">A complete response keeps score, provenance, coverage and trust context together.</p>
            <pre className="mt-5 max-h-[32rem] max-w-full overflow-auto border border-line-dark bg-[#272a28] p-4 font-mono text-xs leading-relaxed text-bone sm:p-5 sm:text-sm">{JSON.stringify(sample, null, 2)}</pre>
            <div className="plate-meta">
              <span>application/json</span>
              <span>read-only sample</span>
            </div>
          </section>
        </div>

        <div className="mt-10 min-w-0">
          <DeveloperApiDemo />
          <section className="r4-panel mt-10 min-w-0">
            <div className="r4-panel-head">
              <div>
                <p className="kicker">Record contract</p>
                <h2 className="mt-1 font-heading text-2xl font-semibold">What the API returns</h2>
              </div>
              <span className="chip">stable</span>
            </div>
            <div className="r4-panel-body px-0 sm:px-0">
              {[
                ["Identity", "Wallet, username, score and risk level"],
                ["Coverage", "Indexed chains, transaction counts and issues"],
                ["Trust graph", "Reciprocal peers, confidence and network health"],
                ["Provenance", "Cache status, source and last indexed timestamp"]
              ].map(([title, detail]) => (
                <div className="ledger-row" key={title}>
                  <span><b className="font-medium text-ink">{title}</b><small>{detail}</small></span>
                  <span className="font-mono text-[0.65rem] text-quiet">JSON</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </WalletGate>
  );
}
