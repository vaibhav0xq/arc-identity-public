import { scoreComponentsFromIdentity } from "@/lib/score-contract";
import { buildScoreExplanations } from "@/lib/score-explanations";
import { getActiveChainCount, getIndexedTxCount, hasIndexedActivity, scoreDataSource } from "@/lib/score-precedence";
import type { IdentityRecord } from "@/lib/types";

function latestIso(values: Array<string | null | undefined>) {
  const latest = values
    .map((value) => value ? new Date(value).getTime() : 0)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)[0];
  return latest ? new Date(latest).toISOString() : null;
}

function formatArcBalance(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Not available";
  if (value === 0) return "0.000 USDC";
  return `${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 3 })} USDC`;
}

export function getCanonicalWalletSnapshot(identity: IdentityRecord | null) {
  if (!identity) {
    return {
      score: 0,
      scoreValue: 0,
      arcIdentityScore: 0,
      credentialScore: 0,
      riskLevel: "High Risk",
      totalTx: 0,
      totalTxCount: 0,
      indexedTx: 0,
      activeChains: [],
      activeChainCount: 0,
      globalWalletAgeDays: 0,
      components: scoreComponentsFromIdentity(null),
      explanations: buildScoreExplanations(null),
      dataSource: "baseline",
      scoreSource: "baseline",
      scoreUpdatedAt: null,
      chainRows: [],
      indexedChains: [],
      providerStatuses: [],
      arcBalance: null,
      arcBalanceRaw: null,
      arcBalanceFormatted: "Not available",
      arcBalanceSource: "unavailable",
      arcBalanceDecimals: 18,
      arcBalanceUpdatedAt: null
    };
  }

  const chainRows = identity.multiChain?.chains ?? [];
  const arcChain = chainRows.find((chain) => chain.chain === "Arc Testnet") ?? null;
  const indexedChainNames = chainRows
    .filter((chain) => chain.status === "indexed" && Number(chain.txCount ?? 0) > 0)
    .map((chain) => chain.chain);
  const activeChains = Array.from(new Set([
    ...(identity.multiChain?.activeChains ?? []),
    ...(identity.profile.indexedChains ?? []),
    ...indexedChainNames
  ])).filter(Boolean);
  const totalTx = Math.max(
    Number(identity.multiChain?.totalTxCount ?? 0),
    Number(identity.profile.txCount ?? 0),
    chainRows.reduce((sum, chain) => sum + Number(chain.txCount ?? 0), 0)
  );
  const globalWalletAgeDays = Math.max(
    Number(identity.multiChain?.globalWalletAgeDays ?? 0),
    Number(identity.profile.globalWalletAgeDays ?? 0),
    chainRows.reduce((max, chain) => Math.max(max, Number(chain.walletAgeDays ?? 0)), 0)
  );
  const indexedTx = getIndexedTxCount(identity);
  const activeChainCount = getActiveChainCount(identity);
  const indexedActivity = hasIndexedActivity(identity);
  const providerUnavailable = !indexedActivity && chainRows.some((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured");
  const dataSource = providerUnavailable ? "provider_unavailable" : scoreDataSource({
    dataSource: indexedActivity ? "cached" : "baseline",
    totalTxCount: indexedTx,
    activeChains
  });
  const arcBalance = identity.snapshot?.nativeBalance ?? arcChain?.nativeBalance ?? null;
  const arcBalanceSource = identity.snapshot ? "cached_wallet_activity_snapshot" : arcChain?.providerSource ?? "unavailable";
  const scoreUpdatedAt = latestIso([
    identity.profile.updatedAt,
    identity.snapshot?.createdAt,
    identity.multiChain?.globalFirstSeenAt,
    ...chainRows.map((chain) => chain.indexedAt)
  ]);

  return {
    score: identity.score.arcScore,
    scoreValue: identity.score.arcScore,
    arcIdentityScore: identity.score.arcScore,
    credentialScore: identity.score.arcScore,
    riskLevel: identity.score.riskLevel,
    totalTx,
    totalTxCount: totalTx,
    indexedTx,
    activeChains,
    activeChainCount,
    globalWalletAgeDays,
    components: scoreComponentsFromIdentity(identity),
    explanations: buildScoreExplanations(identity),
    dataSource,
    scoreSource: dataSource,
    scoreUpdatedAt,
    hasIndexedActivity: indexedActivity,
    chainRows,
    indexedChains: chainRows,
    providerStatuses: chainRows.map((chain) => ({
      chain: chain.chain,
      status: chain.status,
      providerSource: chain.providerSource,
      errorMessage: chain.errorMessage ?? null,
      txCount: chain.txCount,
      indexedAt: chain.indexedAt
    })),
    arcBalance,
    arcBalanceRaw: arcBalance,
    arcBalanceFormatted: formatArcBalance(arcBalance),
    arcBalanceSource,
    arcBalanceDecimals: 18,
    arcBalanceUpdatedAt: identity.snapshot?.createdAt ?? arcChain?.indexedAt ?? null
  };
}
