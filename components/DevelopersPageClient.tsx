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
    maturityReason: "Based on verified peers, reciprocal relationships, and trust confidence.",
    suspicious: false
  },
  explanations: {
    globalWalletAge: "Wallet maturity supports anti-sybil confidence from 420 indexed days.",
    crossChainActivity: "Global chain coverage provides supporting context from 3 active indexed chains.",
    counterpartyDiversity: "Verified and Arc-weighted counterparties support reputation depth.",
    arcActivity: "Arc ecosystem activity is based on Arc transactions, Arc counterparties, and active days.",
    indexedChainDepth: "Chain explorer data is wallet intelligence context, not the primary reputation driver.",
    verifiedAttestations: "Verified transaction-backed attestations are a primary ARC Score driver.",
    riskPenalty: "No risk penalty is currently applied."
  }
};

export function DevelopersPageClient() {
  return (
    <WalletGate
      sectionLabel="Developer API locked"
      title="Connect your wallet to access ARC Identity developer tools."
      description="Wallet connection unlocks API examples and live credential demos for this launch build."
    >
      <section className="fade-in grid min-w-0 gap-6 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="arc-surface min-w-0 rounded p-5 sm:p-6">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">Developer API</p>
          <h1 className="mt-2 text-4xl font-black text-white">Arc-native reputation API</h1>
          <p className="mt-4 text-lg leading-8 text-slate-300">
            Query a wallet or username and receive a stable Arc-native reputation signal built from Arc ecosystem activity, transaction-backed attestations, verified counterparties, trust graph context, wallet signatures, and supporting global wallet intelligence.
          </p>
          <div className="mt-8 grid min-w-0 gap-3.5">
            <code className="arc-card-hover block max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-xs text-emerald-100 sm:text-sm">GET /api/score/:wallet</code>
            <code className="arc-card-hover block max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-xs text-emerald-100 sm:text-sm">GET /api/profile/:username</code>
            <code className="arc-card-hover block max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-xs text-emerald-100 sm:text-sm">GET /api/trust/:wallet</code>
            <code className="arc-card-hover block max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-xs text-emerald-100 sm:text-sm">GET /api/users?sort=score|activity|newest|risk</code>
            <code className="arc-card-hover block max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 font-mono text-xs text-emerald-100 sm:text-sm">POST /api/attestations/request JSON: fromWallet, toWallet, txHash, interactionType</code>
          </div>
        </div>
        <div className="arc-surface min-w-0 rounded-2xl p-5 sm:p-8">
          <p className="mb-4 text-[0.6875rem] font-bold uppercase tracking-[0.2em] text-slate-400">Sample JSON response</p>
          <pre className="max-w-full overflow-auto rounded-xl border border-white/[0.06] bg-[rgba(8,16,22,0.95)] p-4 font-mono text-xs leading-relaxed text-emerald-50/80 sm:p-5 sm:text-sm">{JSON.stringify(sample, null, 2)}</pre>
        </div>
      </section>
      <DeveloperApiDemo />
    </WalletGate>
  );
}
