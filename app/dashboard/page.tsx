"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { createPortal } from "react-dom";
import { ArcIntegrationCard } from "@/components/ArcIntegrationCard";
import { ArcShell } from "@/components/ArcShell";
import { ChainCoverageExplorer } from "@/components/ChainCoverageExplorer";
import { ConnectGatePanel } from "@/components/ConnectGatePanel";
import { DecisionPanel } from "@/components/DecisionPanel";
import { OnchainActivityCard } from "@/components/OnchainActivityCard";
import { ScoreRing } from "@/components/ScoreRing";
import { TrustGraphCard } from "@/components/TrustGraphCard";
import { TrustExplanationCard } from "@/components/TrustExplanationCard";
import { TxLink } from "@/components/TxLink";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import type { Attestation, ChainSnapshot, IdentityRecord, ReputationEvent, ScoreExplanations, TrustGraph, WalletActivitySnapshot } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { publicAppUrl } from "@/lib/links";
import { maybeArcUsername, profileRouteFor } from "@/lib/username";
import { ARC_SCORE_COMPONENT_MAX, ARC_SCORE_MODEL_VERSION } from "@/lib/score-contract";
import { shortenAddress } from "@/lib/wallet";
import { getBadge } from "@/lib/score";
import { deriveIntelligenceState, intelligenceStateCopy } from "@/lib/intelligence-state";
import { hasIndexedActivity, isBaselineScore, mergeScoreState } from "@/lib/score-precedence";
import { useArcIdentity } from "@/hooks/useArcIdentity";

type ScoreLookupResponse = {
  walletAddress?: string;
  username: string | null;
  cacheStatus: "cached" | "indexing_required";
  lastIndexedAt: string | null;
  scoreUpdatedAt?: string | null;
  refreshRecommended: boolean;
  refreshInProgress: boolean;
  refreshFailed?: boolean;
  refreshStatus?: string | null;
  refreshStartedAt?: string | null;
  refreshCompletedAt?: string | null;
  refreshError?: string | null;
  refreshVersion?: string | null;
  usernameClaimed?: boolean;
  arcIdentityScore?: number;
  riskLevel?: "High Risk" | "New / Unproven" | "Reliable" | "Trusted";
  globalWalletAgeDays?: number;
  activeChains?: string[];
  totalTxCount?: number;
  arcTxCount?: number;
  indexedChains?: ChainSnapshot[];
  onchain?: Partial<WalletActivitySnapshot> & {
    balance?: number | null;
    latestBlock?: number | null;
    firstSeenAt?: string | null;
    lastActivityAt?: string | null;
    uniqueCounterparties?: number;
  };
  breakdown?: {
    globalWalletAge?: number;
    crossChainActivity?: number;
    transactionActivity?: number;
    arcActivity?: number;
    counterpartyDiversity?: number;
    verifiedAttestations?: number;
    propagatedTrust?: number;
    riskPenalty?: number;
  };
  explanations?: ScoreExplanations;
  arcBalance?: number | null;
  arcBalanceFormatted?: string | null;
  arcBalanceSource?: string | null;
  arcBalanceUpdatedAt?: string | null;
  arcDataFreshness?: string | null;
  arcProviderStatus?: string | null;
  latestArcBlock?: number | null;
  attestations?: { acceptedCount: number; uniqueCounterparties: number };
  providerErrors?: Array<{ chain: string; status: string; providerSource?: string | null; errorMessage?: string | null }>;
  dataSource?: "live" | "cached" | "baseline" | "provider_unavailable" | "partial" | string;
  hasIndexedActivity?: boolean;
  indexedTx?: number;
};

type ProfileEnsureResponse = {
  profile: { username: string | null } | null;
  usernameClaimed?: boolean;
};

type DashboardLoadState = "loading_cached_profile" | "showing_cached_data" | "refreshing_background_intelligence" | "new_wallet_no_data" | "refresh_failed_showing_cached_data" | "ready";

type CachedDashboard = {
  wallet: string;
  identity: IdentityRecord;
  attestations: Attestation[];
  trustGraph: TrustGraph | null;
  scoreMeta: ScoreLookupResponse | null;
  cachedAt: string;
};

type DashboardSessionState = {
  wallet: string | null;
  signatureVerified: boolean;
};

type DashboardLoadTrigger = "initial" | "session" | "focus" | "visibility" | "indexing_poll";

const PASSIVE_REFRESH_MIN_INTERVAL_MS = 60_000;
// First-index polling: while the backend runs the very first index for a wallet,
// the score endpoint returns an unconfirmed baseline. Instead of parking the UI in
// a loading state forever, re-check a few times, then show the honest result.
const INDEXING_POLL_MAX_ATTEMPTS = 5;
const INDEXING_POLL_DELAY_MS = 6_000;
const MAX_PROMINENT_LOCAL_CACHE_AGE_MS = 6 * 60 * 60 * 1000;

type DisplayedDashboardSnapshot = {
  wallet: string;
  freshnessMs: number;
  score: number | null;
  source: string | null;
};

function refreshCompletionMessage(state: ReturnType<typeof deriveIntelligenceState>) {
  if (state === "indexed") return "Wallet intelligence refreshed.";
  if (state === "partial_indexed" || state === "provider_unavailable") {
    return "Partial network coverage this refresh. Your score reflects the most recent complete data.";
  }
  return intelligenceStateCopy(state);
}

function dashboardStatusClass(message: string) {
  const base = "rounded-[2px] border p-3.5 text-sm";
  if (/could not complete|failed/i.test(message)) return `${base} border-risk/30 bg-risk-bg text-risk`;
  if (/partial network coverage|temporarily unavailable/i.test(message)) return `${base} border-limited/30 bg-limited-bg text-limited`;
  if (/already in progress|refreshing|loading|checking|pending|waiting|updating/i.test(message)) return `${base} border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-100`;
  if (/cached/i.test(message)) return `${base} border-white/[0.06] bg-white/[0.025] text-slate-300`;
  return `${base} border-verified/30 bg-verified-bg text-verified`;
}

function maskWalletAddress(address: string) {
  return `${address.slice(0, 2)}${"•".repeat(Math.max(address.length - 2, 0))}`;
}

function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3l18 18" /><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.9 17.9 0 0 1-3.2 4.2" /><path d="M6.1 6.1A17.4 17.4 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 4.3-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
  );
}

function baselineIdentity(wallet: string, username: string): IdentityRecord {
  const now = new Date().toISOString();
  return {
    profile: {
      id: `baseline-${wallet.toLowerCase()}`,
      walletAddress: wallet.toLowerCase(),
      username,
      signature: null,
      verifiedWallet: true,
      arcScore: 0,
      riskLevel: "High Risk",
      riskFlags: [],
      scoreTrend: 0,
      activityLevel: "Dormant",
      txCount: 0,
      firstSeen: now,
      lastSeen: now,
      createdAt: now,
      updatedAt: now,
      globalWalletAgeDays: 0,
      arcWalletAgeDays: 0,
      activeChainCount: 0,
      credentialScore: 0,
      credentialLevel: "High Risk",
      indexedChains: [],
      scoreModelVersion: ARC_SCORE_MODEL_VERSION,
      scoreInputs: null,
      scoreBreakdown: null,
      scoreCalculatedAt: now
    },
    score: {
      walletAddress: wallet.toLowerCase(),
      arcScore: 0,
      riskLevel: "High Risk",
      activityScore: 0,
      longevityScore: 0,
      counterpartyDiversityScore: 0,
      balanceSignalScore: 0,
      attestationScore: 0,
      trustPropagationScore: 0,
      consistencyScore: 0,
      riskPenalty: 0,
      lastSyncedAt: now,
      modelVersion: ARC_SCORE_MODEL_VERSION
    },
    snapshot: null,
    acceptedAttestations: 0,
    uniqueCounterparties: 0,
    attestations: [],
    reputationEvents: [],
    trustConnections: [],
    trustGraph: null,
    multiChain: null,
    explanations: {
      globalWalletAge: "This wallet appears freshly created.",
      crossChainActivity: "No wallet activity detected yet.",
      counterpartyDiversity: "No counterparties detected yet.",
      arcActivity: "No Arc activity detected yet.",
      indexedChainDepth: "No chains detected yet.",
      verifiedAttestations: "No verified transaction attestations exist yet.",
      propagatedTrust: "No propagated trust contribution is currently applied.",
      riskPenalty: "No risk penalty is applied while ARC Intelligence initializes."
    },
    refreshJob: null
  };
}

function cleanUsername(value?: string | null) {
  return maybeArcUsername(value);
}

function withResolvedUsername(identity: IdentityRecord, username?: string | null): IdentityRecord {
  const resolved = cleanUsername(username) ?? cleanUsername(identity.profile.username);
  if (!resolved || identity.profile.username === resolved) return identity;
  return { ...identity, profile: { ...identity.profile, username: resolved } };
}

function applyScoreMeta(identity: IdentityRecord, score: ScoreLookupResponse | null): IdentityRecord {
  if (!score) return identity;
  const now = new Date().toISOString();
  const indexedChains = score.indexedChains ?? identity.multiChain?.chains ?? [];
  const activeChains = score.activeChains ?? identity.multiChain?.activeChains ?? identity.profile.indexedChains ?? [];
  const totalTxCount = score.totalTxCount ?? identity.multiChain?.totalTxCount ?? identity.profile.txCount ?? 0;
  const globalWalletAgeDays = score.globalWalletAgeDays ?? identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays ?? 0;
  const scoreValue = typeof score.arcIdentityScore === "number" ? score.arcIdentityScore : identity.score.arcScore;
  const riskLevel = score.riskLevel ?? identity.score.riskLevel;
  const onchain = score.onchain;
  const snapshot: WalletActivitySnapshot | null = onchain || score.arcTxCount != null || score.arcBalance != null || score.latestArcBlock != null
    ? {
      id: identity.snapshot?.id ?? `score-meta-${identity.profile.walletAddress}`,
      walletAddress: identity.profile.walletAddress,
      txCount: Number(score.arcTxCount ?? onchain?.txCount ?? identity.snapshot?.txCount ?? 0),
      volume: Number(identity.snapshot?.volume ?? 0),
      counterparties: Number(onchain?.counterparties ?? onchain?.uniqueCounterparties ?? identity.snapshot?.counterparties ?? 0),
      activeDays: Number(onchain?.activeDays ?? identity.snapshot?.activeDays ?? 0),
      counterpartyAddresses: identity.snapshot?.counterpartyAddresses ?? [],
      recentActivityCount: Number(onchain?.recentActivityCount ?? identity.snapshot?.recentActivityCount ?? 0),
      walletAgeDays: Number(onchain?.walletAgeDays ?? identity.snapshot?.walletAgeDays ?? 0),
      activityFrequency: Number(onchain?.activityFrequency ?? identity.snapshot?.activityFrequency ?? 0),
      transferCount: Number(onchain?.transferCount ?? identity.snapshot?.transferCount ?? 0),
      contractInteractionCount: Number(onchain?.contractInteractionCount ?? identity.snapshot?.contractInteractionCount ?? 0),
      indexerSource: score.arcBalanceSource ?? identity.snapshot?.indexerSource ?? "score_api",
      calculatedScore: Number(identity.snapshot?.calculatedScore ?? 0),
      latestBlock: Number(score.latestArcBlock ?? onchain?.latestBlock ?? identity.snapshot?.latestBlock ?? 0),
      nativeBalance: Number(score.arcBalance ?? onchain?.balance ?? identity.snapshot?.nativeBalance ?? 0),
      lastActivityAt: onchain?.lastActivityAt ?? identity.snapshot?.lastActivityAt ?? null,
      createdAt: score.arcBalanceUpdatedAt ?? identity.snapshot?.createdAt ?? now
    }
    : identity.snapshot;

  return {
    ...identity,
    profile: {
      ...identity.profile,
      arcScore: scoreValue,
      credentialScore: scoreValue,
      riskLevel,
      credentialLevel: riskLevel,
      txCount: totalTxCount,
      globalWalletAgeDays,
      activeChainCount: activeChains.length,
      indexedChains: activeChains,
      updatedAt: score.lastIndexedAt ?? identity.profile.updatedAt
    },
    score: {
      ...identity.score,
      arcScore: scoreValue,
      riskLevel,
      activityScore: score.breakdown?.crossChainActivity ?? identity.score.activityScore,
      longevityScore: score.breakdown?.globalWalletAge ?? identity.score.longevityScore,
      counterpartyDiversityScore: score.breakdown?.counterpartyDiversity ?? identity.score.counterpartyDiversityScore,
      balanceSignalScore: score.breakdown?.arcActivity ?? identity.score.balanceSignalScore,
      attestationScore: score.breakdown?.verifiedAttestations ?? identity.score.attestationScore,
      trustPropagationScore: score.breakdown?.propagatedTrust ?? identity.score.trustPropagationScore,
      consistencyScore: score.breakdown?.transactionActivity ?? identity.score.consistencyScore,
      riskPenalty: score.breakdown?.riskPenalty ?? identity.score.riskPenalty,
      lastSyncedAt: score.lastIndexedAt ?? identity.score.lastSyncedAt
    },
    snapshot,
    acceptedAttestations: score.attestations?.acceptedCount ?? identity.acceptedAttestations,
    uniqueCounterparties: score.attestations?.uniqueCounterparties ?? identity.uniqueCounterparties,
    multiChain: {
      walletAddress: identity.profile.walletAddress,
      globalFirstSeenAt: identity.multiChain?.globalFirstSeenAt ?? null,
      globalWalletAgeDays,
      totalTxCount,
      activeChains,
      uniqueCounterparties: indexedChains.reduce((sum, chain) => sum + chain.uniqueCounterparties, 0),
      totalContractInteractions: indexedChains.reduce((sum, chain) => sum + chain.contractInteractions, 0),
      chains: indexedChains
    },
    explanations: score.explanations ?? identity.explanations
  };
}

function uniqueUsernames(...values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  return values.reduce<string[]>((items, value) => {
    const username = cleanUsername(value);
    if (!username || seen.has(username)) return items;
    seen.add(username);
    return [...items, username];
  }, []);
}

function isConfirmedFreshScore(score: ScoreLookupResponse | null | undefined) {
  if (!score) return false;
  if (!isBaselineScore(score)) return false;
  if (score.refreshInProgress || score.cacheStatus === "indexing_required") return false;
  return Boolean(score.usernameClaimed || score.lastIndexedAt || score.refreshCompletedAt || score.refreshStatus === "committed" || score.refreshStatus === "failed");
}

function dashboardPendingMessage(hasSignature: boolean) {
  return hasSignature ? "Checking identity..." : "Verifying wallet session...";
}

function timestampMs(value?: string | null) {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function dashboardSnapshotFreshness(identity?: IdentityRecord | null, score?: ScoreLookupResponse | null, cachedAt?: string | null) {
  const chainTimes = identity?.multiChain?.chains?.map((chain) => timestampMs(chain.indexedAt)) ?? [];
  return Math.max(
    timestampMs(score?.lastIndexedAt),
    timestampMs(score?.scoreUpdatedAt),
    timestampMs(score?.refreshCompletedAt),
    timestampMs(identity?.profile.updatedAt),
    timestampMs(identity?.score.lastSyncedAt),
    timestampMs(identity?.snapshot?.createdAt),
    timestampMs(cachedAt),
    ...chainTimes
  );
}

function scoreValue(score?: ScoreLookupResponse | null, identity?: IdentityRecord | null) {
  if (typeof score?.arcIdentityScore === "number") return score.arcIdentityScore;
  if (typeof identity?.score.arcScore === "number") return identity.score.arcScore;
  return null;
}

function usernameWalletKey(wallet: string) {
  return `arcIdentityUsernameWallet:${wallet.toLowerCase()}`;
}

function walletUsernameKey(wallet: string) {
  return `arcIdentityUsername:${wallet.toLowerCase()}`;
}

function getTrustedCachedUsername(wallet: string) {
  const scopedUsername = localStorage.getItem(walletUsernameKey(wallet)) ?? "";
  if (scopedUsername) return scopedUsername;
  const username = localStorage.getItem("arcIdentityUsername") ?? "";
  const usernameWallet = localStorage.getItem(usernameWalletKey(wallet)) ?? "";
  return username && usernameWallet.toLowerCase() === wallet.toLowerCase() ? username : "";
}

function storeUsernameForWallet(wallet: string, username: string) {
  const previousUsername = localStorage.getItem(walletUsernameKey(wallet));
  const previousWallet = localStorage.getItem(usernameWalletKey(wallet));
  localStorage.setItem(walletUsernameKey(wallet), username);
  localStorage.setItem("arcIdentityUsername", username);
  localStorage.setItem(usernameWalletKey(wallet), wallet.toLowerCase());
  if (previousUsername !== username || previousWallet?.toLowerCase() !== wallet.toLowerCase()) {
    window.dispatchEvent(new Event("arc-identity-wallet-changed"));
  }
}

function postClaimKey(wallet: string) {
  return `arcIdentityPostClaim:${wallet.toLowerCase()}`;
}

function clearIdentityCaches(wallet: string, clearUsername = false) {
    localStorage.removeItem(`arcIdentityDashboardCache:${wallet.toLowerCase()}`);
    localStorage.removeItem(postClaimKey(wallet));
    localStorage.removeItem(walletUsernameKey(wallet));
    if (clearUsername) {
      localStorage.removeItem("arcIdentityUsername");
      localStorage.removeItem(usernameWalletKey(wallet));
      localStorage.removeItem(`arcIdentityLastRealScore:${wallet.toLowerCase()}`);
  }
  console.log("[arc-identity] dashboard_cleared_stale_locked_cache", { wallet, clearUsername });
}

function IdentitySummary({ identity, onCopyProfile, historyAction, refreshing = false }: { identity: IdentityRecord; onCopyProfile: () => void; historyAction: React.ReactNode; refreshing?: boolean }) {
  const globalAge = identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays;
  const activeChains = identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount;
  const totalTx = identity.multiChain?.totalTxCount ?? 0;
  const username = cleanUsername(identity.profile.username);
  const profileHref = username ? "/profile/me" : "/create";
  const arcChain = identity.multiChain?.chains.find((chain) => chain.chain.toLowerCase().includes("arc")) ?? null;

  return (
    <section className="relative overflow-hidden rounded-[2px] border border-line-dark bg-graphite p-5 text-bone shadow-plate sm:p-7 lg:p-9">
      <div className="arc-ambient pointer-events-none absolute inset-0 opacity-60" />
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(242,238,227,.12)_1px,transparent_1px),linear-gradient(90deg,rgba(242,238,227,.12)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative grid min-w-0 gap-8 sm:gap-10 xl:grid-cols-[0.65fr_1.35fr] xl:items-center">
      <div className="flex flex-col items-center justify-center gap-6 text-center">
        <ScoreRing score={identity.score.arcScore} pulsing={refreshing} />
        <span className={username ? "rounded-[2px] border border-verified/40 bg-verified-bg px-3.5 py-2 font-mono text-[0.6875rem] font-extrabold uppercase tracking-[0.18em] text-verified" : "rounded-[2px] border border-limited/40 bg-limited-bg px-3.5 py-2 font-mono text-[0.6875rem] font-extrabold uppercase tracking-[0.18em] text-limited"}>{username ? "Public Identity Active" : "Username Not Claimed"}</span>
      </div>
      <div>
        <p className="arc-section-label">Identity Summary</p>
        <h2 className="mt-3 break-words text-2xl font-extrabold text-bone sm:text-3xl">{username ?? "Claim your identity"}</h2>
        <p className="mt-3 break-all font-mono text-sm text-[#b6b9ae] sm:break-normal">{shortenAddress(identity.profile.walletAddress)}</p>
        <p className="mt-5 text-xl font-bold text-gold">{getBadge(identity.score.arcScore)}</p>
        <div className="mt-9 grid gap-x-5 sm:grid-cols-3 sm:divide-x sm:divide-[#555a52]">
          <div className="py-2 sm:pr-5"><p className="kicker text-[#b6b9ae]">Risk level</p><p className="mt-2 font-extrabold text-bone">{identity.score.riskLevel}</p></div>
          <div className="py-2 sm:px-5"><p className="kicker text-[#b6b9ae]">Global wallet age</p><p className="mt-2 font-extrabold tabular-nums text-bone">{globalAge}d</p></div>
          <div className="py-2 sm:pl-5"><p className="kicker text-[#b6b9ae]">Indexed tx</p><p className="mt-2 font-extrabold tabular-nums text-bone">{totalTx}</p><p className="mt-0.5 text-xs text-[#9b9d94]">{activeChains} chains</p></div>
        </div>
        <div className="mt-9 grid gap-3 sm:flex sm:flex-wrap sm:items-center">
          {username ? (
            <>
              <Link href={profileHref} className="arc-button-primary px-5 py-3 text-center text-sm font-extrabold">View public profile</Link>
              <button onClick={onCopyProfile} className="arc-button-secondary px-5 py-3 text-sm font-bold">Copy profile URL</button>
              {historyAction}
            </>
          ) : (
            <>
              <Link href="/create" className="arc-button-primary px-5 py-3 text-center text-sm font-extrabold">Claim username</Link>
              {historyAction}
            </>
          )}
        </div>
      </div>
      </div>
    </section>
  );
}

function ScoreBreakdownChart({ identity }: { identity: IdentityRecord }) {
  const rows = [
    ["Global wallet age", identity.score.longevityScore, ARC_SCORE_COMPONENT_MAX.walletAge],
    ["Chain coverage", identity.score.activityScore, ARC_SCORE_COMPONENT_MAX.crossChain],
    ["Indexed transactions", identity.score.consistencyScore, ARC_SCORE_COMPONENT_MAX.transactionActivity],
    ["Counterparty diversity", identity.score.counterpartyDiversityScore, ARC_SCORE_COMPONENT_MAX.diversity],
    ["Arc activity", identity.score.balanceSignalScore, ARC_SCORE_COMPONENT_MAX.arcActivity],
    ["Verified attestations", identity.score.attestationScore, ARC_SCORE_COMPONENT_MAX.attestations],
    ["Trust propagation", identity.score.trustPropagationScore, ARC_SCORE_COMPONENT_MAX.propagatedTrust]
  ] as const;

  return (
    <section>
      <p className="arc-section-label">Score breakdown chart</p>
      <div className="cal-grid">
        {rows.map(([label, value, max], index) => {
          const reading = Number.isFinite(value) ? Math.max(0, Math.min(max, Math.round(value))) : 0;
          const barPct = Math.round((reading / max) * 100);
          return (
            <div key={label} className="cal-row">
              <span className="cal-idx">{String(index + 1).padStart(2, "0")}</span>
              <span className="cal-label">{label}</span>
              <span className="cal-val">{String(reading).padStart(2, "0")}<small>pts</small></span>
              <span className="cal-scale" aria-hidden="true"><i style={{ width: `${barPct}%` }} /></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function eventCategory(event: ReputationEvent) {
  return typeof event.metadata.eventCategory === "string" ? event.metadata.eventCategory : event.eventType === "score_refresh" ? "SCORE_RECALCULATION" : event.eventType;
}

function eventTypeLabel(event: ReputationEvent) {
  const category = eventCategory(event);
  if (category === "SCORE_RECALCULATION") return "SCORE RECALIBRATION";
  if (category === "TRUST_UPDATE") return "TRUST UPDATE";
  if (category === "VERIFIED_ACTIVITY") return "VERIFIED ACTIVITY";
  if (category === "RISK_EVENT") return "RISK EVENT";
  if (category === "ANOMALY_DETECTED") return "ANOMALY DETECTED";
  const eventType = event.eventType;
  if (eventType.includes("attestation")) return "VERIFIED ATTESTATION";
  if (eventType.includes("trust")) return "TRUST UPDATE";
  if (eventType.includes("anomaly")) return "ANOMALY DETECTED";
  return eventType.replaceAll("_", " ").toUpperCase();
}

function eventPillClass(event: ReputationEvent) {
  const category = eventCategory(event);
  if (category === "SCORE_RECALCULATION") return "border-white/10 bg-white/[0.06] text-slate-300";
  if (category === "TRUST_UPDATE") return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
  if (category === "VERIFIED_ACTIVITY") return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (category === "RISK_EVENT" || category === "ANOMALY_DETECTED") return "border-rose-300/20 bg-rose-400/10 text-rose-100";
  const eventType = event.eventType;
  if (eventType.includes("attestation")) return "border-emerald-300/20 bg-emerald-300/10 text-emerald-100";
  if (eventType.includes("anomaly")) return "border-rose-300/20 bg-rose-400/10 text-rose-100";
  return "border-white/10 bg-white/[0.06] text-slate-300";
}

function eventIconLabel(event: ReputationEvent) {
  const category = eventCategory(event);
  if (category === "TRUST_UPDATE") return "T";
  if (category === "VERIFIED_ACTIVITY") return "V";
  if (category === "RISK_EVENT" || category === "ANOMALY_DETECTED") return "!";
  return "S";
}

function eventIconClass(event: ReputationEvent) {
  const category = eventCategory(event);
  if (category === "TRUST_UPDATE") return "border-cyan-300/25 bg-cyan-300/12 text-cyan-100 shadow-[0_0_26px_rgba(103,232,249,0.12)]";
  if (category === "VERIFIED_ACTIVITY") return "border-emerald-300/25 bg-emerald-300/12 text-emerald-100 shadow-[0_0_26px_rgba(110,231,183,0.12)]";
  if (category === "RISK_EVENT" || category === "ANOMALY_DETECTED") return "border-rose-300/25 bg-rose-400/12 text-rose-100 shadow-[0_0_26px_rgba(251,113,133,0.12)]";
  return "border-amber-200/25 bg-amber-200/10 text-amber-100 shadow-[0_0_26px_rgba(212,175,55,0.12)]";
}

const arcNativeRecalibrationReason = "Identity Score recalibrated from latest Arc ecosystem activity, verified attestations, trust graph strength and supporting wallet intelligence context.";

function normalizeHistoryReason(reason: string) {
  const lower = reason.toLowerCase();
  if (
    lower.includes("cross-chain activity weighting")
    || lower.includes("indexed chain weighting")
    || lower.includes("cross-chain score")
    || lower.includes("chain contribution")
  ) {
    return arcNativeRecalibrationReason;
  }
  return reason;
}

function scoreComponentLabel(component: string) {
  const labels: Record<string, string> = {
    globalWalletAge: "Wallet maturity confidence",
    crossChainActivity: "Supporting chain coverage context",
    transactionActivity: "Supporting transaction context",
    arcActivity: "Arc ecosystem activity",
    counterpartyDiversity: "Verified counterparty context",
    verifiedAttestations: "Verified attestations",
    trustPropagation: "Trust graph strength",
    indexedChainDepth: "Supporting wallet intelligence context",
    riskPenalty: "Risk and anomaly controls"
  };
  return labels[component] ?? component.replaceAll("_", " ");
}

function eventReason(event: ReputationEvent) {
  const summary = typeof event.metadata.reasonSummary === "string" ? event.metadata.reasonSummary : null;
  if (summary) return normalizeHistoryReason(summary);
  const category = eventCategory(event);
  if (category === "SCORE_RECALCULATION") return arcNativeRecalibrationReason;
  if (category === "TRUST_UPDATE") return "Verified interactions improved trust confidence.";
  if (category === "VERIFIED_ACTIVITY") return "Additional verified Arc activity increased wallet credibility.";
  if (event.eventType.includes("attestation")) return "Verified transaction attestation updated reputation.";
  if (event.eventType.includes("trust")) return "Trust graph updated from verified relationships.";
  return normalizeHistoryReason(event.eventType.replaceAll("_", " "));
}

function summaryPills(event: ReputationEvent) {
  const changed = Array.isArray(event.metadata.changedComponents) ? event.metadata.changedComponents.filter((item): item is string => typeof item === "string") : [];
  const pills: string[] = [];
  if (changed.includes("trustPropagation") || eventCategory(event) === "TRUST_UPDATE") pills.push("Trust expanded");
  if (changed.includes("crossChainActivity") || changed.includes("arcActivity")) pills.push("New activity indexed");
  if (changed.includes("counterpartyDiversity")) pills.push("Additional counterparties detected");
  if (typeof event.metadata.scoreConfidence === "string" && event.metadata.scoreConfidence !== "stabilizing") pills.push("Confidence improved");
  if (eventCategory(event) === "SCORE_RECALCULATION" && pills.length === 0) pills.push("Indexing recalibrated");
  return pills.slice(0, 3);
}

function EventDetails({ event }: { event: ReputationEvent }) {
  const previousScore = typeof event.metadata.previousScore === "number" ? event.metadata.previousScore : null;
  const newScore = typeof event.metadata.newScore === "number" ? event.metadata.newScore : null;
  const changed = Array.isArray(event.metadata.changedComponents) ? event.metadata.changedComponents.filter((item): item is string => typeof item === "string") : [];
  const affected = Array.isArray(event.metadata.affectedCategories) ? event.metadata.affectedCategories.filter((item): item is string => typeof item === "string") : changed;
  const txHash = typeof event.metadata.txHash === "string" ? event.metadata.txHash : null;
  const confidenceMessage = typeof event.metadata.confidenceMessage === "string" ? event.metadata.confidenceMessage : null;
  const legacy = previousScore == null && newScore == null && changed.length === 0 && typeof event.metadata.reasonSummary !== "string";
  const whatChanged = changed.length ? changed.map(scoreComponentLabel).join(", ") : null;
  const impact = affected.length ? affected.map(scoreComponentLabel).join(", ") : null;
  return (
    <div className="arc-history-details">
      {legacy ? <p className="arc-history-detail-muted">Recorded before enhanced reputation explanations were enabled.</p> : null}
      {previousScore != null || newScore != null ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {previousScore != null ? <p className="arc-history-detail-tile"><span>Previous score</span><strong>{previousScore}</strong></p> : null}
          {newScore != null ? <p className="arc-history-detail-tile"><span>New score</span><strong>{newScore}</strong></p> : null}
        </div>
      ) : null}
      {whatChanged ? <p className="arc-history-detail-row"><span>What changed</span><strong>{whatChanged}</strong></p> : null}
      {impact ? <p className="arc-history-detail-row"><span>Impact</span><strong>{impact}</strong></p> : null}
      {!legacy && !whatChanged && !impact && previousScore == null && newScore == null ? <p className="arc-history-detail-muted">Detailed scoring metadata was not available for this refresh.</p> : null}
      {confidenceMessage ? <p className="arc-history-detail-row"><span>Score confidence</span><strong className="text-cyan-100">{confidenceMessage}</strong></p> : null}
      {txHash ? <div className="arc-history-detail-row"><span>Transaction</span><strong><TxLink txHash={txHash} /></strong></div> : null}
    </div>
  );
}

type HistoryItem = { kind: "event"; event: ReputationEvent } | { kind: "group"; id: string; events: ReputationEvent[] };

function isRecalibration(event: ReputationEvent) {
  return eventCategory(event) === "SCORE_RECALCULATION";
}

function groupHistoryEvents(events: ReputationEvent[]): HistoryItem[] {
  const items: HistoryItem[] = [];
  let group: ReputationEvent[] = [];
  function flush() {
    if (group.length >= 2) items.push({ kind: "group", id: `group-${group[0].id}-${group[group.length - 1].id}`, events: group });
    else if (group[0]) items.push({ kind: "event", event: group[0] });
    group = [];
  }
  for (const event of events) {
    const previous = group[group.length - 1];
    const closeToPrevious = previous ? Math.abs(new Date(previous.createdAt).getTime() - new Date(event.createdAt).getTime()) <= 10 * 60 * 1000 : true;
    if (isRecalibration(event) && closeToPrevious) group.push(event);
    else {
      flush();
      if (isRecalibration(event)) group.push(event);
      else items.push({ kind: "event", event });
    }
  }
  flush();
  return items;
}

function ReputationHistoryDrawer({ events }: { events: ReputationEvent[] }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function eventLabel(event: ReputationEvent) {
    const username = typeof event.metadata.username === "string" ? event.metadata.username : null;
    const fromUsername = typeof event.metadata.fromUsername === "string" ? event.metadata.fromUsername : null;
    const toUsername = typeof event.metadata.toUsername === "string" ? event.metadata.toUsername : null;
    const fromWallet = typeof event.metadata.fromWallet === "string" ? shortenAddress(event.metadata.fromWallet) : null;
    const toWallet = typeof event.metadata.toWallet === "string" ? shortenAddress(event.metadata.toWallet) : null;
    if (fromUsername || toUsername || fromWallet || toWallet) return [fromUsername ?? fromWallet, toUsername ?? toWallet].filter(Boolean).join(" to ");
    return username ?? event.eventType.replaceAll("_", " ");
  }
  const sortedEvents = [...events].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const historyItems = groupHistoryEvents(sortedEvents);
  const modal = (
    <div
      className="arc-history-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Reputation history"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="arc-history-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="arc-history-header">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="arc-section-label">REPUTATION HISTORY</p>
              <h3 className="mt-2.5 text-2xl font-extrabold text-white sm:text-3xl">Score and trust events</h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300/85">Review Identity Score recalibrations, verified trust updates and supporting wallet intelligence context.</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-base font-black text-white transition hover:border-emerald-200/40 hover:bg-emerald-300/10"
              aria-label="Close reputation history"
            >
              X
            </button>
          </div>
        </div>
        <div className="arc-history-list">
          {historyItems.length === 0 ? <p className="rounded-[2px] border border-white/10 bg-white/[0.045] p-5 text-slate-400">No reputation history yet.</p> : (
            <div className="grid gap-4">
              {historyItems.map((item) => {
                if (item.kind === "group") {
                  const isOpen = Boolean(expanded[item.id]);
                  const latest = item.events[0];
                  const totalDelta = item.events.reduce((sum, event) => sum + event.scoreDelta, 0);
                  return (
                    <div key={item.id} className="arc-history-event-card">
                      <div className="arc-history-event-grid">
                        <span className={`arc-history-event-icon ${eventIconClass(latest)}`}>{eventIconLabel(latest)}</span>
                        <div className="arc-history-event-main">
                          <p className="arc-history-event-title">{item.events.length} recalibrations during indexing</p>
                          <p className="arc-history-event-description">{arcNativeRecalibrationReason}</p>
                          <div className="arc-history-chip-row">
                            <span className="arc-history-event-badge border-white/10 bg-white/[0.06] text-slate-300">SCORE RECALIBRATION</span>
                          </div>
                          <p className="arc-history-event-time">{new Date(latest.createdAt).toLocaleString()}</p>
                        </div>
                        <div className="arc-history-event-actions">
                          <p className="text-sm font-black text-slate-300">{totalDelta > 0 ? "+" : ""}{totalDelta} net</p>
                          <button onClick={() => setExpanded((current) => ({ ...current, [item.id]: !isOpen }))} className="text-sm font-bold text-white underline decoration-white/20 underline-offset-4 transition hover:text-emerald-200">
                            {isOpen ? "Hide details" : "View details"}
                          </button>
                        </div>
                      </div>
                      {isOpen ? (
                        <div className="arc-history-details">
                          {item.events.map((event) => <p key={event.id} className="arc-history-detail-row"><span>{new Date(event.createdAt).toLocaleString()}</span><strong>{eventReason(event)}</strong></p>)}
                        </div>
                      ) : null}
                    </div>
                  );
                }
                const event = item.event;
                const isOpen = Boolean(expanded[event.id]);
                const category = eventCategory(event);
                const punitive = category === "RISK_EVENT" || category === "ANOMALY_DETECTED";
                const deltaClass = event.scoreDelta > 0 ? "text-emerald-200" : event.scoreDelta < 0 && punitive ? "text-rose-200" : "text-slate-300";
                const pills = summaryPills(event);
                const deltaLabel = category === "SCORE_RECALCULATION" ? "Recalibrated" : `${event.scoreDelta > 0 ? "+" : ""}${event.scoreDelta}`;
                const stabilizing = event.metadata.scoreConfidence === "stabilizing";
                return (
                  <div key={event.id} className="arc-history-event-card">
                    <div className="arc-history-event-grid">
                      <span className={`arc-history-event-icon ${eventIconClass(event)}`}>{eventIconLabel(event)}</span>
                      <div className="arc-history-event-main">
                        <p className="arc-history-event-title">{eventLabel(event)}</p>
                        <p className="arc-history-event-description">{eventReason(event)}</p>
                        {stabilizing ? <p className="mt-2 text-xs font-semibold text-cyan-100/75">Reputation is still stabilizing while indexing completes.</p> : null}
                        <div className="arc-history-chip-row">
                          <span className={`arc-history-event-badge ${eventPillClass(event)}`}>{eventTypeLabel(event)}</span>
                          {pills.map((pill) => <span key={pill} className="arc-history-chip">{pill}</span>)}
                        </div>
                        <p className="arc-history-event-time">{new Date(event.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="arc-history-event-actions">
                        <p className={`text-base font-black md:text-lg ${deltaClass}`}>{deltaLabel}</p>
                        <button onClick={() => setExpanded((current) => ({ ...current, [event.id]: !isOpen }))} className="text-sm font-bold text-white underline decoration-white/20 underline-offset-4 transition hover:text-emerald-200">
                          {isOpen ? "Hide details" : "View details"}
                        </button>
                      </div>
                    </div>
                    {isOpen ? <EventDetails event={event} /> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="arc-history-footer">
          History is rendered from saved reputation events. Stored legacy wording is normalized in the UI without changing the underlying records.
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button onClick={() => setOpen(true)} className="arc-button-secondary px-4 py-3 text-sm font-bold text-white">
        View history
      </button>
      {mounted && open ? createPortal(modal, document.body) : null}
    </>
  );
}

export default function DashboardPage() {
  const { identity: arcIdentity } = useArcIdentity();
  const mountedRef = useRef(false);
  const loadRequestIdRef = useRef(0);
  const loadActiveWalletRef = useRef<string | null>(null);
  const refreshRequestIdRef = useRef(0);
  const refreshInFlightRef = useRef(false);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const refreshActiveWalletRef = useRef<string | null>(null);
  const displayedSnapshotRef = useRef<DisplayedDashboardSnapshot | null>(null);
  const lastPassiveRefreshAtRef = useRef<Record<string, number>>({});
  const indexingPollRef = useRef<{ wallet: string; attempts: number; timer: number | null }>({ wallet: "", attempts: 0, timer: null });
  const [identity, setIdentity] = useState<IdentityRecord | null>(null);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [trustGraph, setTrustGraph] = useState<TrustGraph | null>(null);
  const [message, setMessage] = useState("Loading Kyro...");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [addressHidden, setAddressHidden] = useState(false);

  useEffect(() => {
    try { setAddressHidden(localStorage.getItem("arcAddressHidden") === "1"); } catch { /* storage unavailable */ }
  }, []);

  function toggleAddressHidden() {
    setAddressHidden((current) => {
      const next = !current;
      try { localStorage.setItem("arcAddressHidden", next ? "1" : "0"); } catch { /* storage unavailable */ }
      return next;
    });
  }
  const [scoreMeta, setScoreMeta] = useState<ScoreLookupResponse | null>(null);
  const [copiedProfile, setCopiedProfile] = useState(false);
  const [loadState, setLoadState] = useState<DashboardLoadState>("loading_cached_profile");
  const [knownUsername, setKnownUsername] = useState<string | null>(null);
  const [sessionState, setSessionState] = useState<DashboardSessionState>({ wallet: null, signatureVerified: false });

  function readDashboardSessionState(): DashboardSessionState {
    if (typeof window === "undefined") return { wallet: null, signatureVerified: false };
    const wallet = localStorage.getItem("arcIdentityWallet")?.trim() || arcIdentity.normalizedWallet || null;
    /* Cached signature pairs are gone; a present wallet is the
       session signal (verified state arrives with the server profile). */
    return {
      wallet,
      signatureVerified: Boolean(wallet)
    };
  }

  function syncDashboardSessionState() {
    const next = readDashboardSessionState();
    setSessionState(next);
    return next;
  }

  // Pre-paint seed: hydrate the session wallet and the trusted username hint
  // before the first frame, so a registered wallet never flashes an anonymous
  // or unclaimed header while the authoritative lookup is still in flight.
  useIsomorphicLayoutEffect(() => {
    const session = readDashboardSessionState();
    if (!session.wallet) return;
    setSessionState(session);
    const hint = cleanUsername(getTrustedCachedUsername(session.wallet));
    if (hint) setKnownUsername(hint);
  }, []);

  function isCurrentRefresh(requestId: number, wallet: string) {
    const activeWallet = refreshActiveWalletRef.current;
    const sessionWallet = readDashboardSessionState().wallet;
    return Boolean(
      mountedRef.current
      && refreshRequestIdRef.current === requestId
      && activeWallet
      && activeWallet === wallet.toLowerCase()
      && sessionWallet
      && sessionWallet.toLowerCase() === wallet.toLowerCase()
    );
  }

  function isCurrentDashboardLoad(requestId: number, wallet: string) {
    const sessionWallet = readDashboardSessionState().wallet;
    return Boolean(
      mountedRef.current
      && loadRequestIdRef.current === requestId
      && loadActiveWalletRef.current === wallet.toLowerCase()
      && sessionWallet
      && sessionWallet.toLowerCase() === wallet.toLowerCase()
    );
  }

  function rememberDisplayedSnapshot(wallet: string, nextIdentity: IdentityRecord | null, nextScoreMeta: ScoreLookupResponse | null, cachedAt?: string | null) {
    displayedSnapshotRef.current = {
      wallet: wallet.toLowerCase(),
      freshnessMs: dashboardSnapshotFreshness(nextIdentity, nextScoreMeta, cachedAt),
      score: scoreValue(nextScoreMeta, nextIdentity),
      source: nextScoreMeta?.dataSource ?? nextScoreMeta?.cacheStatus ?? null
    };
  }

  function markPassiveRefresh(wallet: string) {
    lastPassiveRefreshAtRef.current[wallet.toLowerCase()] = Date.now();
  }

  function clearIndexingPollTimer() {
    if (indexingPollRef.current.timer !== null) {
      window.clearTimeout(indexingPollRef.current.timer);
      indexingPollRef.current.timer = null;
    }
  }

  function resetIndexingPoll(wallet: string | null) {
    clearIndexingPollTimer();
    indexingPollRef.current = { wallet: wallet?.toLowerCase() ?? "", attempts: 0, timer: null };
  }

  function scheduleIndexingPoll(wallet: string) {
    const normalized = wallet.toLowerCase();
    if (indexingPollRef.current.wallet !== normalized) resetIndexingPoll(wallet);
    clearIndexingPollTimer();
    indexingPollRef.current.attempts += 1;
    const attempt = indexingPollRef.current.attempts;
    indexingPollRef.current.timer = window.setTimeout(() => {
      indexingPollRef.current.timer = null;
      if (!mountedRef.current || loadActiveWalletRef.current !== normalized) return;
      console.log("[arc-identity] dashboard_indexing_poll", { wallet, attempt });
      void load({ trigger: "indexing_poll" });
    }, INDEXING_POLL_DELAY_MS);
  }

  function shouldApplyDashboardSnapshot(wallet: string, nextIdentity: IdentityRecord | null, nextScoreMeta: ScoreLookupResponse | null, source: string, cachedAt?: string | null) {
    const current = displayedSnapshotRef.current;
    const incomingFreshness = dashboardSnapshotFreshness(nextIdentity, nextScoreMeta, cachedAt);
    if (!current || current.wallet !== wallet.toLowerCase()) return true;
    if (current.freshnessMs > 0 && incomingFreshness > 0 && incomingFreshness < current.freshnessMs) {
      console.log("[arc-identity] dashboard_snapshot_stale_ignored", {
        wallet,
        source,
        currentFreshness: new Date(current.freshnessMs).toISOString(),
        incomingFreshness: new Date(incomingFreshness).toISOString(),
        currentScore: current.score,
        incomingScore: scoreValue(nextScoreMeta, nextIdentity)
      });
      return false;
    }
    if (current.freshnessMs > 0 && incomingFreshness === 0) {
      console.log("[arc-identity] dashboard_snapshot_stale_ignored", {
        wallet,
        source,
        reason: "incoming_missing_freshness",
        currentFreshness: new Date(current.freshnessMs).toISOString()
      });
      return false;
    }
    return true;
  }

  function abortRefreshIfWalletChanged(nextWallet: string | null, reason: string) {
    const activeWallet = refreshActiveWalletRef.current;
    if (!refreshInFlightRef.current || !activeWallet) return;
    if (nextWallet && nextWallet.toLowerCase() === activeWallet) return;
    refreshRequestIdRef.current += 1;
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    refreshActiveWalletRef.current = null;
    refreshInFlightRef.current = false;
    setRefreshing(false);
    setRefreshMessage("");
    console.log("[arc-identity] dashboard_manual_refresh_cancelled", { activeWallet, nextWallet, reason });
  }

  function cacheKey(wallet: string) {
    return `arcIdentityDashboardCache:${wallet.toLowerCase()}`;
  }

  function realScoreCacheKey(wallet: string) {
    return `arcIdentityLastRealScore:${wallet.toLowerCase()}`;
  }

  function readLastRealDashboard(wallet: string): CachedDashboard | null {
    try {
      const raw = localStorage.getItem(realScoreCacheKey(wallet));
      if (!raw) return null;
      const cached = JSON.parse(raw) as CachedDashboard;
      if (cached.wallet.toLowerCase() !== wallet.toLowerCase()) return null;
      if (!hasIndexedActivity(cached.scoreMeta ?? cached.identity)) return null;
      return cached;
    } catch {
      return null;
    }
  }

  function writeLastRealDashboard(wallet: string, payload: CachedDashboard) {
    try {
      if (hasIndexedActivity(payload.scoreMeta ?? payload.identity)) {
        localStorage.setItem(realScoreCacheKey(wallet), JSON.stringify(payload));
      }
    } catch {
      // Best-effort optimistic cache only.
    }
  }

  function applyDashboardState(wallet: string, nextIdentity: IdentityRecord, nextAttestations: Attestation[], nextTrustGraph: TrustGraph | null, nextScoreMeta: ScoreLookupResponse | null) {
    if (!shouldApplyDashboardSnapshot(wallet, nextIdentity, nextScoreMeta, "dashboard_load")) {
      return { identity: identity ?? nextIdentity, score: scoreMeta, accepted: false, stale: true };
    }
    const previousScore = scoreMeta ?? readLastRealDashboard(wallet)?.scoreMeta ?? null;
    const walletChanged = identity?.profile.walletAddress?.toLowerCase() !== wallet.toLowerCase();
    const merged = mergeScoreState(previousScore, nextScoreMeta, walletChanged);
    const effectiveScore = merged.score as ScoreLookupResponse | null;
    if (!merged.accepted) {
      console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: merged.reason, incomingSource: nextScoreMeta?.dataSource ?? nextScoreMeta?.cacheStatus ?? null });
      console.log("[arc-identity] dashboard_score_ignored", { wallet, reason: merged.reason });
    } else {
      console.log("[arc-identity] dashboard_score_applied", { wallet, source: effectiveScore?.dataSource ?? effectiveScore?.cacheStatus ?? null, indexedTx: effectiveScore?.indexedTx ?? effectiveScore?.totalTxCount ?? 0, activeChains: effectiveScore?.activeChains?.length ?? 0 });
    }
    const baseIdentity = !merged.accepted && identity?.profile.walletAddress.toLowerCase() === wallet.toLowerCase() ? identity : nextIdentity;
    const enriched = applyScoreMeta(baseIdentity, effectiveScore);
    setIdentity(enriched);
    setAttestations(nextAttestations);
    setTrustGraph(nextTrustGraph);
    setScoreMeta(effectiveScore);
    rememberDisplayedSnapshot(wallet, enriched, effectiveScore);
    saveCachedDashboard(wallet, enriched, nextAttestations, nextTrustGraph, effectiveScore);
    return { identity: enriched, score: effectiveScore, accepted: merged.accepted, stale: false };
  }

  function saveCachedDashboard(wallet: string, nextIdentity: IdentityRecord, nextAttestations: Attestation[], nextTrustGraph: TrustGraph | null, nextScoreMeta: ScoreLookupResponse | null) {
    try {
      const previousReal = readLastRealDashboard(wallet);
      if (previousReal && isBaselineScore(nextScoreMeta ?? nextIdentity)) {
        console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: "cache_write_baseline_over_real" });
        return;
      }
      const resolvedUsername = cleanUsername(nextScoreMeta?.username) ?? cleanUsername(nextIdentity.profile.username) ?? cleanUsername(localStorage.getItem("arcIdentityUsername"));
      const normalizedIdentity = withResolvedUsername(nextIdentity, resolvedUsername);
      if (resolvedUsername) storeUsernameForWallet(wallet, resolvedUsername);
      if (resolvedUsername) setKnownUsername(resolvedUsername);
      const payload: CachedDashboard = {
        wallet,
        identity: normalizedIdentity,
        attestations: nextAttestations,
        trustGraph: nextTrustGraph,
        scoreMeta: nextScoreMeta ? { ...nextScoreMeta, username: resolvedUsername ?? nextScoreMeta.username } : nextScoreMeta,
        cachedAt: new Date().toISOString()
      };
      localStorage.setItem(cacheKey(wallet), JSON.stringify(payload));
      writeLastRealDashboard(wallet, payload);
    } catch {
      // Local cache is a UX nicety only.
    }
  }

  function hydrateCachedDashboard(wallet: string) {
    try {
      const raw = localStorage.getItem(cacheKey(wallet));
      const realCached = readLastRealDashboard(wallet);
      if (!raw && !realCached) return false;
      const cached = raw ? JSON.parse(raw) as CachedDashboard : realCached as CachedDashboard;
      const selected = realCached && isBaselineScore(cached.scoreMeta ?? cached.identity) ? realCached : cached;
      if (selected !== cached) console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: "hydrate_preferred_last_real" });
      if (selected.wallet.toLowerCase() !== wallet.toLowerCase() || !selected.identity?.profile) return false;
      const cacheFreshness = dashboardSnapshotFreshness(selected.identity, selected.scoreMeta ?? null, selected.cachedAt);
      if (cacheFreshness > 0 && Date.now() - cacheFreshness > MAX_PROMINENT_LOCAL_CACHE_AGE_MS) {
        console.log("[arc-identity] dashboard_local_cache_too_old_for_prominent_score", {
          wallet,
          cachedAt: selected.cachedAt,
          freshness: new Date(cacheFreshness).toISOString()
        });
        return false;
      }
      const resolvedUsername = cleanUsername(selected.identity.profile.username) ?? cleanUsername(selected.scoreMeta?.username);
      const normalizedIdentity = withResolvedUsername(selected.identity, resolvedUsername);
      if (!shouldApplyDashboardSnapshot(wallet, normalizedIdentity, selected.scoreMeta ?? null, "local_cache_hydration", selected.cachedAt)) {
        return Boolean(identity?.profile.walletAddress.toLowerCase() === wallet.toLowerCase());
      }
      if (resolvedUsername) storeUsernameForWallet(wallet, resolvedUsername);
      if (resolvedUsername) setKnownUsername(resolvedUsername);
      setIdentity(normalizedIdentity);
      setAttestations(selected.attestations ?? []);
      setTrustGraph(selected.trustGraph ?? null);
      setScoreMeta(selected.scoreMeta ?? null);
      rememberDisplayedSnapshot(wallet, normalizedIdentity, selected.scoreMeta ?? null, selected.cachedAt);
      setMessage("");
      setLoadState("showing_cached_data");
      return true;
    } catch {
      return false;
    }
  }

  async function copyProfileUrl() {
    const username = cleanUsername(identity?.profile.username) ?? cleanUsername(scoreMeta?.username) ?? cleanUsername(localStorage.getItem("arcIdentityUsername"));
    if (!username) return;
    await navigator.clipboard.writeText(publicAppUrl(profileRouteFor(username)));
    setCopiedProfile(true);
    window.setTimeout(() => setCopiedProfile(false), 1600);
  }

  function scoreHasNoData(score: ScoreLookupResponse) {
    return !score.username && !score.usernameClaimed && (score.arcIdentityScore ?? 0) <= 0 && (score.totalTxCount ?? 0) <= 0 && (score.arcTxCount ?? 0) <= 0 && (score.attestations?.acceptedCount ?? 0) <= 0;
  }

  async function load({ preserveExisting = true, trigger = "session" }: { preserveExisting?: boolean; trigger?: DashboardLoadTrigger } = {}) {
    const session = syncDashboardSessionState();
    const wallet = session.wallet;
    abortRefreshIfWalletChanged(wallet, wallet ? "wallet_changed" : "wallet_disconnected");
    if (wallet && refreshInFlightRef.current && refreshActiveWalletRef.current === wallet.toLowerCase()) {
      console.log("[arc-identity] dashboard_load_skipped_during_manual_refresh", { wallet, trigger });
      return;
    }
    if (!wallet) {
      loadRequestIdRef.current += 1;
      loadActiveWalletRef.current = null;
      displayedSnapshotRef.current = null;
      resetIndexingPoll(null);
      setKnownUsername(null);
      setIdentity(null);
      setAttestations([]);
      setTrustGraph(null);
      setScoreMeta(null);
      setRefreshMessage("");
      setMessage("Connect an EVM wallet to open your identity dashboard.");
      setLoadState("new_wallet_no_data");
      return;
    }
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    // Clear the previous wallet's username synchronously on a wallet switch so
    // the header never briefly wears the old identity's name.
    if (loadActiveWalletRef.current && loadActiveWalletRef.current !== wallet.toLowerCase()) setKnownUsername(null);
    loadActiveWalletRef.current = wallet.toLowerCase();
    // Any load supersedes a pending first-index poll; it is rescheduled below if still waiting.
    clearIndexingPollTimer();
    const passiveRefresh = trigger === "focus" || trigger === "visibility" || (trigger === "session" && Boolean(identity || displayedSnapshotRef.current));

    const currentIdentityMatchesWallet = identity?.profile.walletAddress.toLowerCase() === wallet.toLowerCase();
    const postClaimUsername = cleanUsername(localStorage.getItem(postClaimKey(wallet)));
    if (postClaimUsername) localStorage.removeItem(cacheKey(wallet));
    const hadCachedDashboard = !postClaimUsername && preserveExisting && ((identity !== null && currentIdentityMatchesWallet) || hydrateCachedDashboard(wallet));
    const cachedUsername = currentIdentityMatchesWallet ? cleanUsername(identity?.profile.username) : null;
    const storedUsername = cleanUsername(getTrustedCachedUsername(wallet));
    if (!hadCachedDashboard && !passiveRefresh) {
      setLoadState("loading_cached_profile");
      setMessage(dashboardPendingMessage(session.signatureVerified));
    }

    try {
      let ensuredUsername: string | null = null;
      /* Wallet-only ensure since the challenge migration: it always runs, so
         the dashboard never blocks on a cached signature. Block braces kept
         to avoid re-indenting the long ensure pipeline. */
      {
        console.log("[arc-identity] dashboard_ensure_started", { wallet });
        console.log("[arc-identity] dashboard_identity_refetch_started", { wallet, source: "profile_ensure" });
        const ensure = await fetchJsonWithTimeout<ProfileEnsureResponse>(`/api/profile/ensure?t=${Date.now()}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          body: JSON.stringify({ walletAddress: wallet })
        }, 8000).catch((error) => {
          console.log("[arc-identity] dashboard_identity_refetch_failed", { wallet, error: error instanceof Error ? error.message : "Unknown error" });
          return null;
        });
        if (!isCurrentDashboardLoad(requestId, wallet)) {
          console.log("[arc-identity] dashboard_load_stale_response_ignored", { wallet, requestId, stage: "ensure", trigger });
          return;
        }
        console.log("[arc-identity] dashboard_ensure_response", { wallet, usernameClaimed: Boolean(ensure?.usernameClaimed), username: ensure?.profile?.username ?? null });
        if (!ensure) {
          const fallbackUsername = postClaimUsername ?? cachedUsername ?? storedUsername;
          if (fallbackUsername) {
            setKnownUsername(fallbackUsername);
            const realCached = readLastRealDashboard(wallet);
            if (hadCachedDashboard || realCached) {
              if (realCached) {
                const cachedIdentity = withResolvedUsername(realCached.identity, fallbackUsername);
                const cachedScore = realCached.scoreMeta ? { ...realCached.scoreMeta, username: fallbackUsername } : realCached.scoreMeta;
                if (shouldApplyDashboardSnapshot(wallet, cachedIdentity, cachedScore, "ensure_failed_last_real_cache", realCached.cachedAt)) {
                  setIdentity(cachedIdentity);
                  setAttestations(realCached.attestations ?? []);
                  setTrustGraph(realCached.trustGraph ?? null);
                  setScoreMeta(cachedScore);
                  rememberDisplayedSnapshot(wallet, cachedIdentity, cachedScore, realCached.cachedAt);
                }
              }
              console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: "ensure_failed_kept_cached_real" });
              setMessage("");
              if (!passiveRefresh) setRefreshMessage("Loading wallet intelligence...");
              setLoadState("showing_cached_data");
              console.log("[arc-identity] dashboard_identity_unlocked_from_cached_username", { wallet, username: fallbackUsername });
              return;
            }
            // No cached dashboard to show. Returning here would strand the
            // page on "Loading wallet intelligence..." with nothing scheduled
            // to finish the load, so fall through to a direct profile fetch
            // using the cached username instead.
            setIdentity(null);
            setAttestations([]);
            setTrustGraph(null);
            setScoreMeta(null);
            setMessage("Loading wallet intelligence...");
            if (!passiveRefresh) setRefreshMessage("Loading wallet intelligence...");
            setLoadState("loading_cached_profile");
            console.log("[arc-identity] dashboard_identity_unlocked_from_cached_username", { wallet, username: fallbackUsername, mode: "direct_profile_fetch" });
            ensuredUsername = fallbackUsername;
          } else {
            setIdentity(null);
            setKnownUsername(null);
            setAttestations([]);
            setTrustGraph(null);
            setScoreMeta(null);
            setLoadState("loading_cached_profile");
            setMessage(dashboardPendingMessage(true));
            setRefreshMessage("Profile lookup is still pending. Keeping the dashboard in a loading state.");
            console.log("[arc-identity] dashboard_locked_reason", { wallet, reason: "ensure_timeout_or_failed" });
            console.log("[arc-identity] dashboard_identity_locked_from_ensure", { wallet, reason: "ensure_timeout_or_failed" });
            return;
          }
        }
        ensuredUsername = cleanUsername(ensure?.profile?.username) ?? ensuredUsername;
        if (ensure?.usernameClaimed || ensuredUsername) {
          if (!ensuredUsername) {
            setLoadState("new_wallet_no_data");
            setMessage("Complete your identity to unlock wallet intelligence.");
            console.log("[arc-identity] dashboard_locked_reason", { wallet, reason: "claimed_without_username" });
            console.log("[arc-identity] dashboard_identity_locked_from_ensure", { wallet, reason: "claimed_without_username" });
            return;
          }
          storeUsernameForWallet(wallet, ensuredUsername);
          setKnownUsername(ensuredUsername);
          localStorage.removeItem(postClaimKey(wallet));
          const realCached = readLastRealDashboard(wallet);
          if (!hadCachedDashboard && !realCached) {
            setIdentity(null);
            setAttestations([]);
            setTrustGraph(null);
            setScoreMeta(null);
            setMessage("Loading wallet intelligence...");
            if (!passiveRefresh) setRefreshMessage("Loading wallet intelligence...");
            setLoadState("loading_cached_profile");
          } else if (realCached) {
            const cachedIdentity = withResolvedUsername(realCached.identity, ensuredUsername);
            const cachedScore = realCached.scoreMeta ? { ...realCached.scoreMeta, username: ensuredUsername } : realCached.scoreMeta;
            if (shouldApplyDashboardSnapshot(wallet, cachedIdentity, cachedScore, "claimed_last_real_cache", realCached.cachedAt)) {
              setIdentity(cachedIdentity);
              setAttestations(realCached.attestations ?? []);
              setTrustGraph(realCached.trustGraph ?? null);
              setScoreMeta(cachedScore);
              rememberDisplayedSnapshot(wallet, cachedIdentity, cachedScore, realCached.cachedAt);
            }
          }
          setMessage(realCached || hadCachedDashboard ? "" : "Loading wallet intelligence...");
          if (!passiveRefresh) setRefreshMessage(realCached || hadCachedDashboard ? "" : "Loading wallet intelligence...");
          setLoadState(realCached || hadCachedDashboard ? "showing_cached_data" : "loading_cached_profile");
          console.log("[arc-identity] dashboard_identity_refetch_success", { wallet, username: ensuredUsername });
          try {
            console.log("[arc-identity] dashboard_identity_refetch_started", { wallet, source: "profile_page", username: ensuredUsername });
            const candidateProfile = await fetchJsonWithTimeout<IdentityRecord & { attestations: Attestation[]; trustGraph?: TrustGraph }>(`/api/profile/${ensuredUsername}?t=${Date.now()}`, {}, 12000);
            if (!isCurrentDashboardLoad(requestId, wallet)) {
              console.log("[arc-identity] dashboard_load_stale_response_ignored", { wallet, requestId, stage: "profile", trigger });
              return;
            }
            if (candidateProfile.profile.walletAddress.toLowerCase() !== wallet.toLowerCase()) throw new Error("Profile wallet mismatch");
            const normalizedProfile = withResolvedUsername(candidateProfile, ensuredUsername) as IdentityRecord & { attestations: Attestation[]; trustGraph?: TrustGraph };
            const trustData = normalizedProfile.trustGraph
              ?? await fetchJsonWithTimeout<TrustGraph>(`/api/trust/${wallet}`, {}, 12000).catch(() => null);
            const score = await fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${wallet}`, {}, 12000).catch(() => null);
            if (!isCurrentDashboardLoad(requestId, wallet)) {
              console.log("[arc-identity] dashboard_load_stale_response_ignored", { wallet, requestId, stage: "score", trigger });
              return;
            }
            const scoreWithResolvedUsername = score ? { ...score, username: ensuredUsername } : null;
            const waitingForFirstIndex = isBaselineScore(scoreWithResolvedUsername) && !isConfirmedFreshScore(scoreWithResolvedUsername) && !hasIndexedActivity(normalizedProfile);
            if (waitingForFirstIndex && indexingPollRef.current.attempts < INDEXING_POLL_MAX_ATTEMPTS) {
              setIdentity(null);
              setAttestations([]);
              setTrustGraph(null);
              setScoreMeta(null);
              setMessage("Setting up your identity. Running your first wallet index...");
              if (!passiveRefresh) setRefreshMessage("Setting up your identity. Running your first wallet index...");
              setLoadState("loading_cached_profile");
              scheduleIndexingPoll(wallet);
              console.log("[arc-identity] dashboard_score_ignored", { wallet, reason: "unconfirmed_baseline_waiting_for_indexing", pollAttempt: indexingPollRef.current.attempts });
              return;
            }
            if (waitingForFirstIndex) {
              console.log("[arc-identity] dashboard_indexing_poll_exhausted", { wallet, attempts: indexingPollRef.current.attempts });
            }
            const applied = applyDashboardState(wallet, normalizedProfile, normalizedProfile.attestations ?? [], normalizedProfile.trustGraph ?? trustData ?? null, scoreWithResolvedUsername);
            if (applied.stale) return;
            resetIndexingPoll(wallet);
            setMessage("");
            const intelligenceState = deriveIntelligenceState({
              walletConnected: true,
              usernameClaimed: true,
              identity: applied.identity,
              score: applied.score,
              snapshot: applied.identity.snapshot,
              chains: applied.identity.multiChain?.chains
            });
            if (!passiveRefresh) {
              setRefreshMessage(score?.refreshInProgress && !hadCachedDashboard && !identity ? intelligenceStateCopy("indexing") : intelligenceState === "indexed" ? "" : refreshCompletionMessage(intelligenceState));
              setLoadState(score?.refreshInProgress && !hadCachedDashboard && !identity ? "refreshing_background_intelligence" : "ready");
            } else {
              setRefreshMessage("");
              setLoadState("ready");
            }
            console.log("[arc-identity] dashboard_identity_unlocked_from_ensure", { wallet, username: ensuredUsername });
            console.log("[arc-identity] dashboard_identity_refetch_success", { wallet, username: ensuredUsername, source: "profile_page" });
            return;
          } catch (profileError) {
            const realCached = readLastRealDashboard(wallet);
            if (realCached) {
              const cachedIdentity = withResolvedUsername(realCached.identity, ensuredUsername);
              const cachedScore = realCached.scoreMeta ? { ...realCached.scoreMeta, username: ensuredUsername } : realCached.scoreMeta;
              if (shouldApplyDashboardSnapshot(wallet, cachedIdentity, cachedScore, "profile_failed_last_real_cache", realCached.cachedAt)) {
                setIdentity(cachedIdentity);
                setAttestations(realCached.attestations ?? []);
                setTrustGraph(realCached.trustGraph ?? null);
                setScoreMeta(cachedScore);
                rememberDisplayedSnapshot(wallet, cachedIdentity, cachedScore, realCached.cachedAt);
              }
              console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: "profile_fetch_failed_kept_cached_real" });
            } else {
              setIdentity(null);
              setAttestations([]);
              setTrustGraph(null);
              setScoreMeta(null);
            }
            setMessage(realCached ? "" : "Loading wallet intelligence...");
            if (!passiveRefresh) setRefreshMessage(realCached ? intelligenceStateCopy("provider_unavailable") : "Loading wallet intelligence...");
            setLoadState(passiveRefresh && (identity || realCached) ? "ready" : realCached ? "refresh_failed_showing_cached_data" : "loading_cached_profile");
            console.log("[arc-identity] dashboard_identity_refetch_failed", { wallet, source: "profile_page", error: profileError instanceof Error ? profileError.message : "Unknown error" });
            return;
          }
        }
        if (ensure && !ensure.usernameClaimed && !ensuredUsername) {
          clearIdentityCaches(wallet, true);
          displayedSnapshotRef.current = null;
          setIdentity(null);
          setKnownUsername(null);
          setAttestations([]);
          setTrustGraph(null);
          setScoreMeta(null);
          setLoadState("new_wallet_no_data");
          setMessage("Complete your identity to unlock wallet intelligence.");
          console.log("[arc-identity] dashboard_locked_reason", { wallet, reason: "unclaimed" });
          console.log("[arc-identity] dashboard_identity_locked_from_ensure", { wallet });
          return;
        }
      }

      setLoadState("loading_cached_profile");
      setMessage(dashboardPendingMessage(true));
      setRefreshMessage("Profile lookup is still pending. Keeping the dashboard in a loading state.");
      console.log("[arc-identity] dashboard_locked_reason", { wallet, reason: "ensure_did_not_confirm_identity" });
      console.log("[arc-identity] dashboard_identity_locked_from_ensure", { wallet, reason: "ensure_did_not_confirm_identity" });
      return;

    } catch {
      if (passiveRefresh && (identity || hadCachedDashboard)) {
        setLoadState("ready");
        setRefreshMessage("");
        setMessage("");
        return;
      }
      if (identity || hadCachedDashboard) {
        setLoadState("refresh_failed_showing_cached_data");
        setRefreshMessage("Latest refresh failed. Showing cached intelligence.");
        setMessage("");
      } else {
        setLoadState("loading_cached_profile");
        setMessage(dashboardPendingMessage(readDashboardSessionState().signatureVerified));
      }
    }
  }


  async function refreshIntelligence() {
    const wallet = localStorage.getItem("arcIdentityWallet");
    if (!wallet || refreshing || refreshInFlightRef.current) return;
    const requestId = refreshRequestIdRef.current + 1;
    refreshRequestIdRef.current = requestId;
    loadRequestIdRef.current += 1;
    loadActiveWalletRef.current = wallet.toLowerCase();
    markPassiveRefresh(wallet);
    refreshInFlightRef.current = true;
    refreshActiveWalletRef.current = wallet.toLowerCase();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    setRefreshing(true);
    if (identity) setLoadState("showing_cached_data");
      setRefreshMessage("Refreshing wallet intelligence. Current data remains visible.");
    console.log("[arc-identity] dashboard_manual_refresh_started", { wallet, requestId });
    const timeoutId = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(`/api/score/${wallet}/refresh?t=${Date.now()}`, {
        method: "POST",
        headers: { "Cache-Control": "no-store" },
        signal: controller.signal
      });
      const refreshed = await response.json().catch(() => null) as (ScoreLookupResponse & { ok?: boolean; error?: string }) | null;
      if (!isCurrentRefresh(requestId, wallet)) {
        console.log("[arc-identity] dashboard_manual_refresh_stale_response_ignored", { wallet, requestId, latestRequestId: refreshRequestIdRef.current });
        return;
      }
      if (!response.ok || !refreshed || refreshed.ok === false || refreshed.refreshStatus === "failed") {
        if (refreshed?.refreshInProgress) {
          setLoadState(identity ? "showing_cached_data" : "loading_cached_profile");
          setRefreshMessage("A refresh is already in progress. Updated results will appear shortly.");
          console.log("[arc-identity] dashboard_manual_refresh_already_running", { wallet, requestId });
          return;
        }
        throw new Error("Refresh could not complete. Your verified score and history are unaffected.");
      }
      if (refreshed.walletAddress && refreshed.walletAddress.toLowerCase() !== wallet.toLowerCase()) {
        throw new Error("Refresh result wallet mismatch");
      }
      const canonicalUsername = cleanUsername(refreshed.username) ?? cleanUsername(identity?.profile.username) ?? cleanUsername(getTrustedCachedUsername(wallet));
      const nextScoreMeta = canonicalUsername ? { ...refreshed, username: canonicalUsername } : refreshed;
      if (canonicalUsername) storeUsernameForWallet(wallet, canonicalUsername);
      const base = identity && identity.profile.walletAddress.toLowerCase() === wallet.toLowerCase()
        ? identity
        : canonicalUsername
          ? baselineIdentity(wallet, canonicalUsername)
          : identity;
      if (!base) throw new Error("Refresh completed before dashboard identity loaded");
      if (!shouldApplyDashboardSnapshot(wallet, base, nextScoreMeta, "manual_refresh_response")) {
        setLoadState("ready");
        setRefreshMessage("Wallet intelligence refreshed.");
        console.log("[arc-identity] dashboard_manual_refresh_older_snapshot_kept_current", { wallet, requestId });
        return;
      }
      const previousScore = scoreMeta ?? readLastRealDashboard(wallet)?.scoreMeta ?? null;
      const merged = mergeScoreState(previousScore, nextScoreMeta, false);
      if (!merged.accepted) {
        console.log("[arc-identity] score_merge_rejected_baseline_over_real", { wallet, reason: merged.reason, incomingSource: nextScoreMeta?.dataSource ?? nextScoreMeta?.cacheStatus ?? null });
        console.log("[arc-identity] dashboard_score_ignored", { wallet, reason: merged.reason });
      } else {
        console.log("[arc-identity] dashboard_score_applied", { wallet, source: merged.score?.dataSource ?? merged.score?.cacheStatus ?? null, indexedTx: merged.score?.indexedTx ?? merged.score?.totalTxCount ?? 0, activeChains: merged.score?.activeChains?.length ?? 0 });
      }
      const appliedScore = merged.score as ScoreLookupResponse | null;
      const appliedIdentity = applyScoreMeta(withResolvedUsername(base, canonicalUsername), appliedScore);
      setIdentity(appliedIdentity);
      setScoreMeta(appliedScore);
      rememberDisplayedSnapshot(wallet, appliedIdentity, appliedScore);
      saveCachedDashboard(wallet, appliedIdentity, attestations, trustGraph, appliedScore);
      setLoadState("ready");
      const intelligenceState = deriveIntelligenceState({
        walletConnected: true,
        usernameClaimed: Boolean(canonicalUsername),
        identity: appliedIdentity,
        score: appliedScore,
        chains: appliedScore?.indexedChains
      });
      setRefreshMessage(refreshCompletionMessage(intelligenceState));
      console.log("[arc-identity] dashboard_manual_refresh_completed", { wallet, requestId, state: intelligenceState });
    } catch (refreshError) {
      if (isCurrentRefresh(requestId, wallet)) {
        setLoadState(identity ? "refresh_failed_showing_cached_data" : "loading_cached_profile");
        setRefreshMessage("Refresh could not complete. Your verified score and history are unaffected.");
        console.warn("[arc-identity] dashboard_manual_refresh_failed", { wallet, requestId, error: refreshError instanceof Error ? refreshError.message : "Unknown error" });
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (isCurrentRefresh(requestId, wallet)) {
        markPassiveRefresh(wallet);
        refreshInFlightRef.current = false;
        refreshAbortRef.current = null;
        refreshActiveWalletRef.current = null;
        setRefreshing(false);
      }
    }
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      refreshRequestIdRef.current += 1;
      refreshAbortRef.current?.abort();
      refreshAbortRef.current = null;
      refreshActiveWalletRef.current = null;
      refreshInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    function reloadFromSessionChange(trigger: DashboardLoadTrigger = "session") {
      if (cancelled) return;
      const session = syncDashboardSessionState();
      const wallet = session.wallet?.toLowerCase() ?? null;
      const hasCurrentWalletData = Boolean(
        wallet
        && (
          displayedSnapshotRef.current?.wallet === wallet
          || identity?.profile.walletAddress.toLowerCase() === wallet
        )
      );
      const passiveTrigger = trigger === "focus" || trigger === "visibility" || (trigger === "session" && hasCurrentWalletData);
      if (passiveTrigger) {
        if (!wallet) return;
        if (refreshInFlightRef.current) {
          console.log("[arc-identity] dashboard_passive_refresh_skipped", { wallet, trigger, reason: "manual_refresh_active" });
          return;
        }
        const lastPassiveRefreshAt = lastPassiveRefreshAtRef.current[wallet] ?? 0;
        if (Date.now() - lastPassiveRefreshAt < PASSIVE_REFRESH_MIN_INTERVAL_MS) {
          console.log("[arc-identity] dashboard_passive_refresh_skipped", { wallet, trigger, reason: "throttled" });
          return;
        }
        markPassiveRefresh(wallet);
      }
      void load({ trigger });
    }
    reloadFromSessionChange("initial");
    const onSessionChange = () => reloadFromSessionChange("session");
    const onFocus = () => reloadFromSessionChange("focus");
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reloadFromSessionChange("visibility");
    };
    window.addEventListener("arc-identity-wallet-changed", onSessionChange);
    window.addEventListener("storage", onSessionChange);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      clearIndexingPollTimer();
      window.removeEventListener("arc-identity-wallet-changed", onSessionChange);
      window.removeEventListener("storage", onSessionChange);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [arcIdentity.normalizedWallet, arcIdentity.status]);

  const sessionWallet = sessionState.wallet ?? arcIdentity.normalizedWallet;
  const sessionHasWallet = Boolean(sessionWallet);
  const sessionSignatureVerified = sessionState.signatureVerified || arcIdentity.status === "claimed";
  const confirmedUnclaimed = sessionHasWallet && loadState === "new_wallet_no_data" && message.startsWith("Complete your identity");
  const shouldHoldConnectedPendingState = sessionHasWallet && !identity && !confirmedUnclaimed;
  const needsWalletConnection = !sessionHasWallet;
  const setupHeading = needsWalletConnection
    ? "Connect your wallet to open your identity dashboard."
    : shouldHoldConnectedPendingState
      ? dashboardPendingMessage(sessionSignatureVerified)
      : message || "Complete your identity to unlock wallet intelligence.";
  const showSetupClaimCta = sessionHasWallet && !shouldHoldConnectedPendingState && !knownUsername;
  const dashboardStatusMessage = refreshing
    ? "Refreshing wallet intelligence. Current data remains visible."
    : loadState === "refresh_failed_showing_cached_data"
      ? "Refresh could not complete. Your verified score and history are unaffected."
      : refreshMessage
        ? refreshMessage
        : loadState === "refreshing_background_intelligence" && !identity
          ? "Loading wallet intelligence..."
          : loadState === "showing_cached_data"
            ? "Using cached wallet intelligence."
            : loadState === "loading_cached_profile" && knownUsername
              ? `Loading wallet intelligence for ${knownUsername}.`
              : "";

  function EvidenceChip({ children, tone = "green" }: { children: React.ReactNode; tone?: "green" | "amber" | "rose" }) {
    return <span className={`chip ${tone}`}><span className="dot" />{children}</span>;
  }

  function verdictTone(score: number, risk: string) {
    if (/high risk|anomaly/i.test(risk)) return "rose" as const;
    if (/review|required|unproven/i.test(risk)) return "amber" as const;
    return score > 75 ? "green" as const : "amber" as const;
  }

  function verdictLabel(score: number, risk: string) {
    if (/protected review required/i.test(risk)) return "Review recommended";
    return getBadge(score);
  }

  return (
    <ArcShell>
      <section className="py-10">
        <div className="mb-10">
          <p className="kicker">Overview / {(identity && cleanUsername(identity.profile.username)) || knownUsername ? "claimed identity" : needsWalletConnection ? "wallet connection" : shouldHoldConnectedPendingState ? "checking record" : "unclaimed record"}</p>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-6">
            <div><h1 className="text-5xl font-semibold sm:text-7xl">{identity ? (cleanUsername(identity.profile.username) ?? "New wallet") : knownUsername ?? (shouldHoldConnectedPendingState ? <><span className="skeleton inline-block h-[0.72em] w-56 rounded-[2px] align-baseline sm:w-80" aria-hidden="true" /><span className="sr-only">Checking identity</span></> : sessionWallet ? "New wallet" : "Dashboard")}</h1>
              {identity ? <div className="mt-3 flex items-center gap-2 font-mono text-sm text-mutedc"><span className="break-all">{addressHidden ? maskWalletAddress(identity.profile.walletAddress) : identity.profile.walletAddress}</span><button type="button" onClick={toggleAddressHidden} aria-label={addressHidden ? "Show wallet address" : "Hide wallet address"} title={addressHidden ? "Show wallet address" : "Hide wallet address"} className="shrink-0 text-mutedc transition-colors hover:text-ink">{addressHidden ? <EyeOffIcon /> : <EyeIcon />}</button></div> : sessionWallet ? <p className="mt-3 font-mono text-sm text-mutedc">{sessionWallet} · {shouldHoldConnectedPendingState ? "checking record" : "connected just now"}</p> : null}</div>
            {identity ? <div className="flex flex-wrap gap-2">
              {cleanUsername(identity.profile.username) ? <><button onClick={copyProfileUrl} className="arc-button-secondary px-4 py-2.5 text-sm">Copy profile</button><ReputationHistoryDrawer events={identity.reputationEvents ?? []} /></> : <Link href="/create" className="arc-button-primary px-4 py-2.5 text-sm">Claim this wallet</Link>}
              <button onClick={refreshIntelligence} disabled={refreshing} className="arc-button-primary px-4 py-2.5 text-sm disabled:opacity-60">{refreshing ? "Refreshing..." : "Refresh index"}</button>
            </div> : showSetupClaimCta ? <Link href="/create" className="arc-button-primary px-5 py-3 text-sm">Claim this wallet</Link> : null}
          </div>
          <div className="mt-4 min-h-[50px]">
            {dashboardStatusMessage ? <p className={dashboardStatusClass(dashboardStatusMessage)}>{dashboardStatusMessage}</p> : null}
          </div>
        </div>
        {identity ? (
          <div className="grid gap-8">
            {copiedProfile ? <p className="rounded-[2px] border border-emerald-300/15 bg-emerald-300/[0.06] p-3.5 text-sm text-emerald-100">Public profile URL copied.</p> : null}
            <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[0.9fr_1.3fr_0.9fr]">
              <section className="credential-plate score-plate">
                <p className="kicker" style={{ color: "#b8bdb2" }}>IDENTITY SCORE / {cleanUsername(identity.profile.username) ? "VERIFIED CREDENTIAL" : "BUILDING RECORD"}</p>
                <div className="plate-num mt-8">{Math.round(identity.score.arcScore)}<small>/100</small></div>
                <div className="plate-scale" aria-hidden="true"><i style={{ width: `${Math.min(Math.max(Math.round(identity.score.arcScore), 0), 100)}%` }} /></div>
                <div className="plate-line mt-8"><EvidenceChip tone={cleanUsername(identity.profile.username) ? verdictTone(identity.score.arcScore, identity.score.riskLevel) : "amber"}>{cleanUsername(identity.profile.username) ? verdictLabel(identity.score.arcScore, identity.score.riskLevel) : "No verdict yet"}</EvidenceChip><span className="text-[#b8bdb2]">{cleanUsername(identity.profile.username) ? identity.score.riskLevel : "Record not yet built"} · confidence {trustGraph ? `${Math.round(trustGraph.metrics.trustConfidence)}%` : "pending"}</span></div>
                <div className="plate-meta"><span>{`score model ${(identity.score.modelVersion ?? ARC_SCORE_MODEL_VERSION).replace(/^arc_score_/, "")}`}</span><span>{scoreMeta?.lastIndexedAt ? `refreshed ${new Date(scoreMeta.lastIndexedAt).toLocaleDateString()}` : "never refreshed"}</span></div>
              </section>
              <section className="r4-panel">
                <div className="r4-panel-head"><span>Evidence ledger</span><span className="quiet mono">{(identity.profile.txCount ?? 0) + (identity.acceptedAttestations ?? 0)} indexed signals</span></div>
                <div className="r4-panel-body">
                  <div className="ledger-row"><span><b>Verified wallet</b><small>Signature and ownership confirmed</small></span><EvidenceChip>{sessionSignatureVerified ? "Verified" : "Pending"}</EvidenceChip></div>
                  <div className="ledger-row"><span><b>Wallet age</b><small>{identity.profile.globalWalletAgeDays} days observed</small></span><EvidenceChip tone={identity.profile.globalWalletAgeDays ? "green" : "amber"}>{identity.profile.globalWalletAgeDays ? "Confirmed" : "Building"}</EvidenceChip></div>
                  <div className="ledger-row"><span><b>Trust edges</b><small>{trustGraph?.metrics.trustedPeerCount ?? 0} verified relationships</small></span><EvidenceChip tone={trustGraph?.metrics.trustedPeerCount ? "green" : "amber"}>{trustGraph?.metrics.trustedPeerCount ? "Reciprocal" : "Pending"}</EvidenceChip></div>
                  <div className="ledger-row"><span><b>Attestations</b><small>{identity.acceptedAttestations} transaction-backed records</small></span><EvidenceChip tone={identity.acceptedAttestations ? "green" : "amber"}>{identity.acceptedAttestations ? "Verified" : "None yet"}</EvidenceChip></div>
                </div>
              </section>
              <section className="r4-panel">
                <div className="r4-panel-head"><span>Record status</span><EvidenceChip tone={scoreMeta?.cacheStatus === "cached" ? "green" : "amber"}>{scoreMeta?.cacheStatus === "cached" ? "Current" : "Indexing"}</EvidenceChip></div>
                <div className="r4-panel-body">
                  {[["Verdict", verdictLabel(identity.score.arcScore, identity.score.riskLevel)], ["Risk level", identity.score.riskLevel], ["Cache status", scoreMeta?.cacheStatus === "cached" ? "Warm snapshot" : "Indexing required"], ["Last indexed", scoreMeta?.lastIndexedAt ? new Date(scoreMeta.lastIndexedAt).toLocaleString() : "Not indexed"]].map(([label, value]) => <div className="ledger-row" key={label}><span className="muted">{label}</span><span className="mono text-right">{value}</span></div>)}
                </div>
              </section>
            </div>
            <div className="grid gap-8 xl:grid-cols-[1.4fr_0.8fr] xl:items-start">
              <div className="grid gap-8">
                <TrustGraphCard graph={trustGraph} />
                <section className="r4-panel pt-6">
                  <p className="arc-section-label">Activity + Attestations</p>
                  <div className="mt-5">
                    <OnchainActivityCard
                      embedded
                      onchain={identity.snapshot}
                      arcChain={identity.multiChain?.chains.find((chain) => chain.chain.toLowerCase().includes("arc")) ?? null}
                      liveArc={{
                        balance: scoreMeta?.arcBalance,
                        balanceFormatted: scoreMeta?.arcBalanceFormatted,
                        balanceSource: scoreMeta?.arcBalanceSource,
                        balanceUpdatedAt: scoreMeta?.arcBalanceUpdatedAt,
                        dataFreshness: scoreMeta?.arcDataFreshness,
                        providerStatus: scoreMeta?.arcProviderStatus,
                        latestBlock: scoreMeta?.latestArcBlock
                      }}
                    />
                  </div>
                </section>
              </div>
              <aside className="grid gap-8 xl:sticky xl:top-28">
                <details className="r4-panel" open>
                  <summary className="intel-summary">
                    <span>Score intelligence</span>
                    <span className="intel-meta"><span className="quiet mono">07 signals</span><span className="intel-toggle" aria-hidden="true" /></span>
                  </summary>
                  <div className="grid gap-7">
                    <ScoreBreakdownChart identity={identity} />
                    <DecisionPanel score={identity.score} trustGraph={trustGraph} />
                    <TrustExplanationCard graph={trustGraph} />
                  </div>
                </details>
                <ChainCoverageExplorer chains={identity.multiChain?.chains ?? []} />
              </aside>
            </div>
            <ArcIntegrationCard />
          </div>
        ) : (loadState === "loading_cached_profile" || shouldHoldConnectedPendingState) && sessionHasWallet ? (
          <div className="grid gap-8">
            <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[0.9fr_1.3fr_0.9fr]">
              <section className="credential-plate score-plate">
                <p className="kicker" style={{ color: "#b8bdb2" }}>IDENTITY SCORE</p>
                <span className="skeleton skeleton-dark mt-8 h-20 w-36" />
                <span className="skeleton skeleton-dark mt-8 h-2 w-full" />
                <div className="mt-8 flex items-center justify-between gap-4">
                  <span className="skeleton skeleton-dark h-6 w-32" />
                  <span className="skeleton skeleton-dark h-4 w-24" />
                </div>
              </section>
              <section className="r4-panel xl:col-span-2">
                <div className="r4-panel-head"><span className="skeleton h-3.5 w-48" /><span className="skeleton h-3 w-20" /></div>
                <div className="r4-panel-body">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="flex items-center justify-between gap-6 border-b border-linec py-4 last:border-b-0">
                      <div className="min-w-0 flex-1">
                        <span className="skeleton h-4 w-48 max-w-full" />
                        <span className="skeleton mt-2 h-3 w-32 max-w-full" />
                      </div>
                      <span className="skeleton h-8 w-20" />
                    </div>
                  ))}
                </div>
              </section>
              <section className="r4-panel xl:col-span-3">
                <div className="r4-panel-head"><span className="skeleton h-3.5 w-40" /></div>
                <div className="r4-panel-body">
                  <span className="skeleton h-4 w-full max-w-3xl" />
                  <span className="skeleton mt-2 h-4 w-2/3 max-w-2xl" />
                </div>
              </section>
            </div>
          </div>
        ) : (
          <div className="grid gap-8">
            <ConnectGatePanel
              kicker={loadState === "loading_cached_profile" || shouldHoldConnectedPendingState
                ? (knownUsername ? "Loading identity" : "Checking identity")
                : needsWalletConnection
                  ? "Wallet required"
                  : message.startsWith("Kyro created")
                    ? "Identity ready"
                    : "Username required"}
              title={setupHeading}
              description={loadState === "loading_cached_profile" || shouldHoldConnectedPendingState
                ? knownUsername
                  ? "Loading your identity dashboard."
                  : "Preparing your identity workspace."
                : message.startsWith("Kyro created")
                  ? "Your public identity is ready. Refresh intelligence to load the latest wallet context."
                  : needsWalletConnection
                    ? "Connect your wallet to view your reputation, attestations and wallet intelligence."
                    : "Claim a username to activate your public dashboard."}
              checking={loadState === "loading_cached_profile" || shouldHoldConnectedPendingState}
              unlocks={["Identity score and verdict", "Evidence ledger and attestations", "Trust graph and chain coverage"]}
              actions={
                <>
                  {needsWalletConnection ? (
                    <WalletConnectButton />
                  ) : !showSetupClaimCta ? null : message.startsWith("Kyro created") && (knownUsername || scoreMeta?.username) ? (
                    <Link href="/profile/me" className="arc-button-primary px-5 py-3 text-sm font-extrabold">View public profile</Link>
                  ) : (
                    <Link href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">Claim username</Link>
                  )}
                  {message.startsWith("Kyro created") ? (
                    <button onClick={refreshIntelligence} disabled={refreshing} className="arc-button-secondary px-5 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60">
                      {refreshing ? "Refreshing..." : "Refresh intelligence"}
                    </button>
                  ) : null}
                </>
              }
            />
            <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[0.9fr_1.3fr_0.9fr]">
              <section className="credential-plate score-plate">
                <p className="kicker" style={{ color: "#b8bdb2" }}>IDENTITY SCORE</p>
                <div className="plate-num mt-8">0<small>/100</small></div>
                <div className="plate-scale" aria-hidden="true"><i style={{ width: "0%" }} /></div>
                <div className="plate-line mt-8"><EvidenceChip tone="amber">No verdict yet</EvidenceChip><span className="text-[#b8bdb2]">Evidence required</span></div>
                <div className="plate-meta"><span>model awaits first index</span><span>record not yet built</span></div>
              </section>
              <section className="r4-panel xl:col-span-2">
                <div className="r4-panel-head"><span>Build your evidence ledger</span><span className="quiet mono">0 signals</span></div>
                <div className="r4-panel-body">
                  {[["Claim ownership", "Sign a message to establish this credential", "/create"], ["Index wallet history", "Scan supported chains for activity", null], ["Add an attestation", "Verify a real interaction with a counterparty", "/attestations"]].map(([label, detail, href]) => (
                    <div className="ledger-row" key={label}>
                      <span><b>{label}</b><small>{detail}</small></span>
                      {needsWalletConnection ? (
                        <span className="font-mono text-[0.65rem] uppercase tracking-[0.12em] text-quiet">after connect</span>
                      ) : href ? (
                        <Link href={href} className="arc-button-secondary px-3 py-2 text-xs">{label === "Claim ownership" ? "Claim" : "Start"}</Link>
                      ) : (
                        <button onClick={refreshIntelligence} className="arc-button-secondary px-3 py-2 text-xs">Index</button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <section className="r4-panel xl:col-span-3">
                <div className="r4-panel-head"><span>What appears here</span></div>
                <div className="r4-panel-body"><p className="max-w-3xl leading-7 text-mutedc">We assemble a readable credential from wallet age, counterparties, chain coverage and transaction-backed attestations. Nothing is scored until evidence is indexed.</p></div>
              </section>
            </div>
          </div>
        )}
      </section>
    </ArcShell>
  );
}

