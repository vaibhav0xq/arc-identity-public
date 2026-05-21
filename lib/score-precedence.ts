type ChainLike = {
  status?: string | null;
  txCount?: number | null;
};

export type ScoreLike = {
  walletAddress?: string | null;
  username?: string | null;
  arcIdentityScore?: number | null;
  totalTxCount?: number | null;
  indexedTx?: number | null;
  arcTxCount?: number | null;
  activeChains?: unknown[] | null;
  indexedChains?: ChainLike[] | null;
  dataSource?: string | null;
  cacheStatus?: string | null;
  hasIndexedActivity?: boolean | null;
  multiChain?: {
    totalTxCount?: number | null;
    activeChains?: unknown[] | null;
    chains?: ChainLike[] | null;
  } | null;
  profile?: {
    txCount?: number | null;
    activeChainCount?: number | null;
    indexedChains?: unknown[] | null;
  } | null;
};

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getIndexedTxCount(score: ScoreLike | null | undefined) {
  if (!score) return 0;
  return Math.max(
    numberValue(score.indexedTx),
    numberValue(score.totalTxCount),
    numberValue(score.arcTxCount),
    numberValue(score.multiChain?.totalTxCount),
    numberValue(score.profile?.txCount),
    ...(score.indexedChains ?? []).map((chain) => numberValue(chain.txCount)),
    ...(score.multiChain?.chains ?? []).map((chain) => numberValue(chain.txCount))
  );
}

export function getActiveChainCount(score: ScoreLike | null | undefined) {
  if (!score) return 0;
  const indexedChains = (score.indexedChains ?? []).filter((chain) => chain.status === "indexed" && numberValue(chain.txCount) > 0).length;
  const multiChainIndexed = (score.multiChain?.chains ?? []).filter((chain) => chain.status === "indexed" && numberValue(chain.txCount) > 0).length;
  return Math.max(
    Array.isArray(score.activeChains) ? score.activeChains.length : 0,
    Array.isArray(score.multiChain?.activeChains) ? score.multiChain.activeChains.length : 0,
    numberValue(score.profile?.activeChainCount),
    Array.isArray(score.profile?.indexedChains) ? score.profile.indexedChains.length : 0,
    indexedChains,
    multiChainIndexed
  );
}

export function hasIndexedActivity(score: ScoreLike | null | undefined) {
  if (!score) return false;
  if (score.hasIndexedActivity === true) return true;
  return getIndexedTxCount(score) > 0 || getActiveChainCount(score) > 0;
}

export function isBaselineScore(score: ScoreLike | null | undefined) {
  if (!score) return false;
  const scoreValue = numberValue(score.arcIdentityScore);
  const source = String(score.dataSource ?? score.cacheStatus ?? "").toLowerCase();
  const baselineSource = source.includes("baseline") || source.includes("indexing_required") || source.includes("fallback");
  return !hasIndexedActivity(score) && (scoreValue === 35 || scoreValue <= 0 || baselineSource);
}

export function scoreDataSource(score: ScoreLike | null | undefined): "live" | "cached" | "partial" | "provider_unavailable" | "baseline" {
  const source = String(score?.dataSource ?? "").toLowerCase();
  if (source === "live" || source === "cached" || source === "partial" || source === "provider_unavailable" || source === "baseline") {
    return source;
  }
  if (hasIndexedActivity(score)) return source.includes("partial") ? "partial" : "cached";
  if (source.includes("provider") || source.includes("unavailable")) return "provider_unavailable";
  return "baseline";
}

export function mergeScoreState<T extends ScoreLike | null>(previous: T, incoming: T, walletChanged = false) {
  if (!incoming) return { score: previous, accepted: false, reason: "incoming_missing" };
  if (!previous || walletChanged) return { score: incoming, accepted: true, reason: "incoming_first" };

  const previousReal = hasIndexedActivity(previous);
  const incomingBaseline = isBaselineScore(incoming);
  const incomingUnavailable = scoreDataSource(incoming) === "provider_unavailable";
  if (previousReal && (incomingBaseline || (!hasIndexedActivity(incoming) && incomingUnavailable))) {
    return {
      score: previous,
      accepted: false,
      reason: "score_merge_rejected_baseline_over_real"
    };
  }

  return { score: incoming, accepted: true, reason: "incoming_applied" };
}
