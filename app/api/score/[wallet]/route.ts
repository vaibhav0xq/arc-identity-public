import { NextResponse } from "next/server";
import { getCanonicalWalletSnapshot } from "@/lib/canonical-snapshot";
import { getIdentityByWallet, listAttestations, normalizeWallet } from "@/lib/db";
import { baselineExplainableReputation, buildExplainableReputation, reputationInputFromIdentity } from "@/lib/explainable-reputation";
import { isRefreshInProgress, runWalletRefresh, triggerWalletRefresh } from "@/lib/score-refresh";
import { getBadge, getDecisionRecommendations, getRecommendedAction, getRiskLevel } from "@/lib/score";
import { buildScoreExplanations } from "@/lib/score-explanations";
import { ARC_SCORE_MODEL_VERSION, scoreComponentsFromIdentity } from "@/lib/score-contract";
import { getActiveChainCount, getIndexedTxCount, hasIndexedActivity, scoreDataSource } from "@/lib/score-precedence";
import { getTrustGraph } from "@/lib/trust-graph";
import { withTimeout } from "@/lib/timeouts";
import type { IdentityRecord, WalletRefreshJob } from "@/lib/types";
import { isValidWalletAddress, publicApiError, publicNoStoreHeaders, sanitizeCanonicalSnapshot, sanitizeCoverageIssues, sanitizeRefreshError } from "@/lib/api-contract";

const cacheTtlMs = 10 * 60 * 1000;
const activeRefreshStatuses = new Set(["started", "indexing_chains", "recomputing_score"]);

type CacheStatus = "cached" | "indexing_required";

function formatArcBalance(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Not available";
  if (value === 0) return "0.000 USDC";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 3 })} USDC`;
}

function latestIndexedAt(identity: IdentityRecord | null) {
  const candidates = [
    identity?.profile.scoreCalculatedAt,
    identity?.refreshJob?.status === "committed" ? identity.refreshJob.completedAt : null
  ].filter(Boolean) as string[];
  const times = candidates.map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function isStale(lastIndexedAt: string | null) {
  if (!lastIndexedAt) return true;
  return Date.now() - new Date(lastIndexedAt).getTime() > cacheTtlMs;
}

function refreshMeta(job: WalletRefreshJob | null | undefined, refreshInProgress: boolean) {
  const active = refreshInProgress || Boolean(job && activeRefreshStatuses.has(job.status));
  const failed = job?.status === "failed";
  return {
    refreshInProgress: active,
    refreshFailed: failed,
    refreshStatus: active && !job ? "indexing_chains" : job?.status ?? null,
    refreshStartedAt: job?.startedAt ?? null,
    refreshCompletedAt: job?.completedAt ?? null,
    refreshError: failed ? sanitizeRefreshError(job?.errorMessage ?? "Refresh failed") : null,
    refreshVersion: job?.refreshVersion ?? null
  };
}

function baselineResponse(walletAddress: string, refreshInProgress: boolean) {
  const wallet = normalizeWallet(walletAddress);
  const components = scoreComponentsFromIdentity(null);
  const reputation = baselineExplainableReputation(wallet);
  return {
    walletAddress: wallet,
    username: null,
    usernameClaimed: false,
    verifiedWallet: false,
    score: 0,
    arcIdentityScore: 0,
    scoreModelVersion: ARC_SCORE_MODEL_VERSION,
    credentialScore: 0,
    globalWalletAgeDays: 0,
    arcWalletAgeDays: 0,
    activeChains: [],
    totalTxCount: 0,
    arcTxCount: 0,
    riskLevel: "High Risk",
    riskFlags: ["indexing_required"],
    indexedChains: [],
    badge: getBadge(0),
    recommendation: getRecommendedAction(0),
    dataSources: { global: "unavailable", arc: "unavailable" },
    dataSource: "baseline",
    intelligenceStatus: "baseline",
    hasIndexedActivity: false,
    indexedTx: 0,
    onchain: { txCount: 0, balance: 0, latestBlock: 0, firstSeenAt: null, lastActivityAt: null, activeDays: 0, uniqueCounterparties: 0, recentActivityCount: 0, walletAgeDays: 0, activityFrequency: 0 },
    arcBalance: null,
    arcBalanceFormatted: "Not available",
    arcBalanceSource: "unavailable",
    arcBalanceUpdatedAt: null,
    arcDataFreshness: "unavailable",
    arcProviderStatus: "unavailable",
    latestArcBlock: null,
    attestations: { acceptedCount: 0, uniqueCounterparties: 0 },
    decisions: getDecisionRecommendations(0),
    breakdown: { globalWalletAge: 0, crossChainActivity: 0, transactionActivity: 0, arcActivity: 0, counterpartyDiversity: 0, verifiedAttestations: 0, propagatedTrust: 0, riskPenalty: 0 },
    components,
    reputation,
    reputation_v1: reputation,
    explanations: buildScoreExplanations(null),
    cacheStatus: "indexing_required" as CacheStatus,
    lastIndexedAt: null,
    refreshRecommended: true,
    ...refreshMeta(null, refreshInProgress)
  };
}

function validateScorePayload(identity: IdentityRecord, explanations: ReturnType<typeof buildScoreExplanations>) {
  const warnings: string[] = [];
  const score = identity.score.arcScore;
  const components = scoreComponentsFromIdentity(identity);
  const componentTotal = Object.values(components).reduce((sum, component) => sum + component.points, 0);
  const expectedScore = Math.max(0, Math.min(100, Math.round(componentTotal - identity.score.riskPenalty)));
  console.log("[arc-identity] score_validation_started", { wallet: identity.profile.walletAddress, score });

  if (!Number.isFinite(score) || score < 0 || score > 100) {
    warnings.push("arc_score_out_of_range");
  }

  if (score !== expectedScore) {
    warnings.push("score_breakdown_total_mismatch");
    console.warn("[arc-identity] score_factor_mismatch", {
      wallet: identity.profile.walletAddress,
      factor: "componentTotal",
      expected: expectedScore,
      actual: score,
      componentTotal,
      riskPenalty: identity.score.riskPenalty
    });
  }

  const expectedRisk = getRiskLevel(Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0)));
  if (identity.score.riskLevel !== expectedRisk) {
    warnings.push("risk_level_mismatch");
    console.warn("[arc-identity] score_factor_mismatch", {
      wallet: identity.profile.walletAddress,
      factor: "riskLevel",
      expected: expectedRisk,
      actual: identity.score.riskLevel
    });
  }

  if (identity.score.attestationScore > 0 && identity.acceptedAttestations === 0) {
    warnings.push("attestation_score_without_verified_attestations");
    console.warn("[arc-identity] score_factor_mismatch", {
      wallet: identity.profile.walletAddress,
      factor: "verifiedAttestations",
      score: identity.score.attestationScore,
      acceptedAttestations: identity.acceptedAttestations
    });
  }

  if (!explanations || Object.keys(explanations).length === 0) {
    warnings.push("missing_explanations");
  }

  if (warnings.length) {
    console.warn("[arc-identity] score_validation_warning", { wallet: identity.profile.walletAddress, warnings });
  } else {
    console.log("[arc-identity] score_validation_passed", { wallet: identity.profile.walletAddress });
  }
}

async function scoreResponse(identity: IdentityRecord, cacheStatus: CacheStatus, lastIndexedAt: string | null, refreshRecommended: boolean, refreshInProgress: boolean) {
  const canonical = sanitizeCanonicalSnapshot(getCanonicalWalletSnapshot(identity));
  const decisions = getDecisionRecommendations(identity.score.arcScore);
  const arcChain = identity.multiChain?.chains.find((chain) => chain.chain === "Arc Testnet");
  const explanations = buildScoreExplanations(identity);
  const components = scoreComponentsFromIdentity(identity);
  validateScorePayload(identity, explanations);
  const [trustGraph, attestationRows] = await Promise.all([
    withTimeout(getTrustGraph(identity.profile.walletAddress), 650, "trust graph score summary").catch(() => null),
    withTimeout(listAttestations(identity.profile.walletAddress), 650, "attestation score impacts").catch(() => [])
  ]);
  const reputation = buildExplainableReputation({
    ...reputationInputFromIdentity({ ...identity, trustGraph }, attestationRows),
    canonicalScore: canonical.scoreValue
  });
  const liveAvailable = false;
  const cachedBalance = identity.snapshot?.nativeBalance ?? arcChain?.nativeBalance ?? null;
  const cachedBlock = identity.snapshot?.latestBlock ?? null;
  const arcBalance = cachedBalance;
  const latestArcBlock = cachedBlock;
  const arcTxCount = Math.max(identity.snapshot?.txCount ?? 0, arcChain?.txCount ?? 0);
  const arcBalanceSource = liveAvailable ? "arc_rpc" : identity.snapshot || arcChain ? "cached_wallet_intelligence" : "unavailable";
  const arcDataFreshness = liveAvailable ? "live" : identity.snapshot ? "cached_fallback" : arcChain?.status === "indexed" ? "verified_attestation_fallback" : "unavailable";
  const indexedTx = Math.max(getIndexedTxCount(identity), arcTxCount);
  const activeChainCount = getActiveChainCount(identity);
  const indexedActivity = hasIndexedActivity(identity) || indexedTx > 0 || activeChainCount > 0;
  const providerUnavailable = !indexedActivity && (identity.multiChain?.chains ?? []).some((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured");
  const source = liveAvailable && indexedActivity ? "live" : providerUnavailable ? "provider_unavailable" : scoreDataSource({
    dataSource: indexedActivity ? "cached" : "baseline",
    totalTxCount: indexedTx,
    activeChains: activeChainCount > 0 ? new Array(activeChainCount).fill("indexed") : []
  });
  console.log("[arc-identity] arc_data_source_selected", {
    wallet: identity.profile.walletAddress,
    source: arcBalanceSource,
    freshness: arcDataFreshness,
    balance: arcBalance,
    latestBlock: latestArcBlock
  });
  console.log("[arc-identity] score_response_source", {
    wallet: identity.profile.walletAddress,
    dataSource: source,
    indexedTx,
    activeChainCount,
    hasIndexedActivity: indexedActivity,
    cacheStatus
  });
  const coverageIssues = sanitizeCoverageIssues(identity.multiChain?.chains ?? []);
  return {
    scoreModelVersion: identity.score.modelVersion,
    walletAddress: identity.profile.walletAddress,
    username: identity.profile.username,
    usernameClaimed: Boolean(identity.profile.username),
    verifiedWallet: identity.profile.verifiedWallet,
    ...canonical,
    score: canonical.scoreValue,
    arcIdentityScore: canonical.arcIdentityScore,
    credentialScore: canonical.credentialScore,
    globalWalletAgeDays: canonical.globalWalletAgeDays,
    arcWalletAgeDays: identity.snapshot?.walletAgeDays ?? identity.profile.arcWalletAgeDays,
    activeChains: canonical.activeChains,
    totalTxCount: canonical.totalTxCount,
    arcTxCount,
    riskLevel: canonical.riskLevel,
    riskFlags: identity.profile.riskFlags,
    indexedChains: canonical.indexedChains,
    badge: getBadge(identity.score.arcScore),
    recommendation: getRecommendedAction(identity.score.arcScore),
    dataSources: { global: identity.multiChain ? "cached_wallet_intelligence" : "unavailable", arc: liveAvailable ? "arc_rpc" : arcChain?.status === "not_configured" ? "limited_coverage" : "cached_wallet_intelligence" },
    dataSource: canonical.dataSource,
    intelligenceStatus: coverageIssues.length > 0 && indexedActivity ? "partial" : indexedActivity ? "indexed" : providerUnavailable ? "limited" : "baseline",
    hasIndexedActivity: canonical.hasIndexedActivity,
    indexedTx: canonical.indexedTx,
    onchain: {
      txCount: arcTxCount,
      balance: arcBalance ?? 0,
      latestBlock: latestArcBlock ?? 0,
      firstSeenAt: arcChain?.firstSeenAt ?? null,
      lastActivityAt: identity.snapshot?.lastActivityAt ?? identity.profile.lastSeen,
      activeDays: identity.snapshot?.activeDays ?? 0,
      uniqueCounterparties: identity.snapshot?.counterparties ?? 0,
      recentActivityCount: identity.snapshot?.recentActivityCount ?? 0,
      walletAgeDays: identity.snapshot?.walletAgeDays ?? 0,
      activityFrequency: identity.snapshot?.activityFrequency ?? 0
    },
    arcBalance: canonical.arcBalance,
    arcBalanceRaw: canonical.arcBalanceRaw,
    arcBalanceFormatted: canonical.arcBalanceFormatted,
    arcBalanceSource: canonical.arcBalanceSource,
    arcBalanceDecimals: canonical.arcBalanceDecimals,
    arcBalanceUpdatedAt: canonical.arcBalanceUpdatedAt,
    arcDataFreshness: arcDataFreshness === "live" ? "live" : arcDataFreshness === "unavailable" ? "unavailable" : "cached",
    arcProviderStatus: identity.snapshot || arcChain ? "available" : "unavailable",
    latestArcBlock,
    attestations: { acceptedCount: identity.acceptedAttestations, uniqueCounterparties: identity.uniqueCounterparties },
    trustGraph: trustGraph ? {
      trustedPeerCount: trustGraph.metrics.trustedPeerCount,
      totalTrustWeight: trustGraph.metrics.totalTrustWeight,
      strongestConnectionWallet: trustGraph.snapshot.strongestConnectionWallet,
      reciprocalCount: trustGraph.metrics.reciprocalCount,
      networkHealth: trustGraph.metrics.networkHealth,
      propagatedTrustScore: trustGraph.metrics.propagatedTrustScore,
      trustConfidence: trustGraph.metrics.trustConfidence,
      anomalyScore: trustGraph.metrics.anomalyScore,
      maturityReason: trustGraph.metrics.maturityReason,
      suspicious: trustGraph.metrics.suspicious,
      explanations: trustGraph.explanations
    } : null,
    decisions,
    breakdown: {
      globalWalletAge: identity.score.longevityScore,
      crossChainActivity: identity.score.activityScore,
      arcActivity: identity.score.balanceSignalScore,
      counterpartyDiversity: identity.score.counterpartyDiversityScore,
      verifiedAttestations: identity.score.attestationScore,
      propagatedTrust: identity.score.trustPropagationScore,
      transactionActivity: identity.score.consistencyScore,
      riskPenalty: identity.score.riskPenalty
    },
    components,
    reputation,
    reputation_v1: reputation,
    explanations,
    coverageIssues,
    providerErrors: coverageIssues,
    cacheStatus,
    lastIndexedAt,
    refreshRecommended,
    ...refreshMeta(identity.refreshJob, refreshInProgress)
  };
}

export async function GET(request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const allowBackgroundRefresh = new URL(request.url).searchParams.get("refresh") !== "false";
  try {
    const { wallet: walletParam } = await params;
    const wallet = normalizeWallet(walletParam);
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet });
    }
    const identity = await getIdentityByWallet(wallet, false);
    const headers = publicNoStoreHeaders;
    if (!identity?.profile.username) return NextResponse.json(baselineResponse(wallet, false), { headers });
    const lastIndexedAt = latestIndexedAt(identity);
    const refreshRecommended = isStale(lastIndexedAt) || identity.profile.scoreModelVersion !== ARC_SCORE_MODEL_VERSION;
    let refreshInProgress = isRefreshInProgress(wallet) || Boolean(identity?.refreshJob && activeRefreshStatuses.has(identity.refreshJob.status));

    const hasCachedScore = Boolean(lastIndexedAt && (identity.multiChain || identity.snapshot || identity.profile.scoreCalculatedAt || identity.profile.arcScore > 0));

    if (allowBackgroundRefresh && !hasCachedScore && refreshRecommended && !refreshInProgress) {
      void triggerWalletRefresh(wallet).promise.catch(() => undefined);
      refreshInProgress = true;
    }

    if (!hasCachedScore) return NextResponse.json(await scoreResponse(identity, "indexing_required", lastIndexedAt, true, refreshInProgress), { headers });
    if (allowBackgroundRefresh && hasCachedScore && refreshRecommended && !refreshInProgress) {
      void triggerWalletRefresh(wallet).promise.catch(() => undefined);
      refreshInProgress = true;
    }

    return NextResponse.json(await scoreResponse(identity, "cached", lastIndexedAt, refreshRecommended, refreshInProgress), { headers });
  } catch (error) {
    console.warn("[arc-identity] score_api_failed", { error: error instanceof Error ? error.message : "Unable to load score" });
    return publicApiError("Score unavailable", "Could not load Identity Score. Please retry.", 500);
  }
}

export async function POST(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: walletParam } = await params;
    const wallet = normalizeWallet(walletParam);
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet });
    }
    const existing = await getIdentityByWallet(wallet, false);
    if (!existing?.profile.username) return publicApiError("Profile required", "Claim an ARC Identity before refreshing wallet intelligence.", 403, { walletAddress: wallet });
    await runWalletRefresh(wallet);
    const identity = await getIdentityByWallet(wallet, false);
    if (!identity) return publicApiError("Profile not found", "No claimed ARC Identity profile was found for this wallet.", 404, { walletAddress: wallet });
    const lastIndexedAt = latestIndexedAt(identity as IdentityRecord);
    return NextResponse.json(await scoreResponse(identity as IdentityRecord, "cached", lastIndexedAt, false, false), { headers: publicNoStoreHeaders });
  } catch (error) {
    console.warn("[arc-identity] score_refresh_api_failed", { error: error instanceof Error ? error.message : "Unable to refresh score" });
    return publicApiError("Refresh unavailable", "Could not refresh wallet intelligence. Cached data is still safe to use.", 500);
  }
}
