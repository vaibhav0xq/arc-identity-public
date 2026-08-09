import { NextResponse } from "next/server";
import { getCanonicalWalletSnapshot } from "@/lib/canonical-snapshot";
import { getIdentityByWallet, normalizeWallet } from "@/lib/db";
import { buildScoreExplanations } from "@/lib/score-explanations";
import { scoreComponentsFromIdentity } from "@/lib/score-contract";
import { getActiveChainCount, getIndexedTxCount, hasIndexedActivity, scoreDataSource } from "@/lib/score-precedence";
import { isRefreshInProgress, runWalletRefresh } from "@/lib/score-refresh";
import { isValidWalletAddress, publicApiError, publicNoStoreHeaders, sanitizeCanonicalSnapshot, sanitizeCoverageIssues, sanitizeRefreshError } from "@/lib/api-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function latestIndexedAt(identity: Awaited<ReturnType<typeof getIdentityByWallet>>) {
  const candidates = [
    identity?.profile.scoreCalculatedAt,
    identity?.refreshJob?.status === "committed" ? identity.refreshJob.completedAt : null
  ].filter(Boolean) as string[];
  const times = candidates.map((value) => new Date(value).getTime()).filter((value) => Number.isFinite(value));
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

function sourceMeta(identity: Awaited<ReturnType<typeof getIdentityByWallet>> | null, fallbackSource?: string) {
  const indexedTx = getIndexedTxCount(identity ?? undefined);
  const activeChainCount = getActiveChainCount(identity ?? undefined);
  const indexedActivity = hasIndexedActivity(identity ?? undefined);
  const providerUnavailable = !indexedActivity && (identity?.multiChain?.chains ?? []).some((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured");
  const dataSource = providerUnavailable ? "provider_unavailable" : scoreDataSource({
    dataSource: fallbackSource ?? (indexedActivity ? "cached" : "baseline"),
    indexedTx,
    activeChains: activeChainCount > 0 ? new Array(activeChainCount).fill("indexed") : []
  });
  return { dataSource, hasIndexedActivity: indexedActivity, indexedTx };
}

function formatArcBalance(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Not available";
  if (value === 0) return "0.000 USDC";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 3 })} USDC`;
}

function arcBalanceMeta(identity: Awaited<ReturnType<typeof getIdentityByWallet>> | null) {
  const arcChain = identity?.multiChain?.chains.find((chain) => chain.chain === "Arc Testnet") ?? null;
  const balance = identity?.snapshot?.nativeBalance ?? arcChain?.nativeBalance ?? null;
  const source = identity?.snapshot || arcChain ? "cached_wallet_intelligence" : "unavailable";
  const updatedAt = identity?.snapshot?.createdAt ?? arcChain?.indexedAt ?? null;
  return {
    arcBalance: balance,
    arcBalanceRaw: balance,
    arcBalanceFormatted: formatArcBalance(balance),
    arcBalanceSource: source,
    arcBalanceDecimals: 18,
    arcBalanceUpdatedAt: updatedAt,
    arcDataFreshness: balance == null ? "unavailable" : "cached_fallback",
    arcProviderStatus: balance == null ? "unavailable" : "cached",
    latestArcBlock: identity?.snapshot?.latestBlock ?? null
  };
}

export async function POST(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: walletParam } = await params;
  const wallet = normalizeWallet(walletParam);
  try {
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet });
    }
    const alreadyRunning = isRefreshInProgress(wallet);
    const existing = await getIdentityByWallet(wallet, false);
    if (!existing?.profile.username) return publicApiError("Profile required", "Claim an Kyro before refreshing wallet intelligence.", 403, { walletAddress: wallet });
    await runWalletRefresh(wallet);
    const identity = await getIdentityByWallet(wallet, false);
    if (!identity) return publicApiError("Profile not found", "No claimed Kyro profile was found for this wallet.", 404, { walletAddress: wallet });
    const meta = sourceMeta(identity, hasIndexedActivity(identity) ? "live" : "baseline");
    const canonical = sanitizeCanonicalSnapshot(getCanonicalWalletSnapshot(identity));
    const coverageIssues = sanitizeCoverageIssues(identity.multiChain?.chains ?? []);

    return NextResponse.json({
      ok: true,
      walletAddress: identity.profile.walletAddress,
      username: identity.profile.username,
      ...arcBalanceMeta(identity),
      ...meta,
      intelligenceStatus: coverageIssues.length > 0 && meta.hasIndexedActivity ? "partial" : meta.hasIndexedActivity ? "indexed" : meta.dataSource === "provider_unavailable" ? "limited" : "baseline",
      ...canonical,
      score: canonical.scoreValue,
      scoreModelVersion: identity.score.modelVersion,
      arcIdentityScore: canonical.arcIdentityScore,
      riskLevel: canonical.riskLevel,
      breakdown: {
        globalWalletAge: identity.score.longevityScore,
        crossChainActivity: identity.score.activityScore,
        transactionActivity: identity.score.consistencyScore,
        arcActivity: identity.score.balanceSignalScore,
        counterpartyDiversity: identity.score.counterpartyDiversityScore,
        verifiedAttestations: identity.score.attestationScore,
        propagatedTrust: identity.score.trustPropagationScore,
        riskPenalty: identity.score.riskPenalty
      },
      components: scoreComponentsFromIdentity(identity),
      explanations: buildScoreExplanations(identity),
      cacheStatus: latestIndexedAt(identity) ? "cached" : "indexing_required",
      lastIndexedAt: latestIndexedAt(identity),
      refreshRecommended: false,
      refreshInProgress: false,
      refreshStatus: identity.refreshJob?.status ?? "committed",
      refreshError: sanitizeRefreshError(identity.refreshJob?.errorMessage),
      indexedChains: canonical.indexedChains,
      providerErrors: coverageIssues,
      coverageIssues,
      reusedExistingRefresh: alreadyRunning
    }, { headers: publicNoStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to refresh wallet intelligence";
    const identity = await getIdentityByWallet(wallet, false).catch(() => null);
    const meta = sourceMeta(identity, "provider_unavailable");
    const canonical = sanitizeCanonicalSnapshot(getCanonicalWalletSnapshot(identity));
    const coverageIssues = sanitizeCoverageIssues(identity?.multiChain?.chains ?? []);
    return NextResponse.json({
      ok: false,
      error: "Refresh unavailable",
      message: "Could not refresh wallet intelligence. Cached data is still safe to use.",
      walletAddress: identity?.profile.walletAddress ?? wallet,
      username: identity?.profile.username ?? null,
      ...arcBalanceMeta(identity),
      ...meta,
      intelligenceStatus: coverageIssues.length > 0 && meta.hasIndexedActivity ? "partial" : meta.hasIndexedActivity ? "indexed" : "limited",
      ...canonical,
      scoreModelVersion: identity?.score.modelVersion ?? null,
      score: canonical.scoreValue ?? identity?.score.arcScore ?? 0,
      arcIdentityScore: canonical.arcIdentityScore ?? identity?.score.arcScore ?? 0,
      riskLevel: canonical.riskLevel || identity?.score.riskLevel || "New / Unproven",
      breakdown: identity ? {
        globalWalletAge: identity.score.longevityScore,
        crossChainActivity: identity.score.activityScore,
        transactionActivity: identity.score.consistencyScore,
        arcActivity: identity.score.balanceSignalScore,
        counterpartyDiversity: identity.score.counterpartyDiversityScore,
        verifiedAttestations: identity.score.attestationScore,
        propagatedTrust: identity.score.trustPropagationScore,
        riskPenalty: identity.score.riskPenalty
      } : null,
      components: scoreComponentsFromIdentity(identity),
      explanations: buildScoreExplanations(identity),
      cacheStatus: latestIndexedAt(identity) ? "cached" : "indexing_required",
      lastIndexedAt: latestIndexedAt(identity),
      refreshRecommended: true,
      refreshInProgress: false,
      refreshStatus: "failed",
      refreshError: sanitizeRefreshError(message),
      indexedChains: canonical.indexedChains,
      totalTxCount: canonical.totalTxCount,
      activeChains: canonical.activeChains,
      providerErrors: coverageIssues,
      coverageIssues,
      reusedExistingRefresh: false
    }, { headers: publicNoStoreHeaders });
  }
}

