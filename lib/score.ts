import type { ActivityLevel, ArcScore, MultiChainWalletProfile, Profile, RiskLevel, WalletActivitySnapshot } from "@/lib/types";
import { buildScoreContract, scoreInputFromParts } from "@/lib/score-contract";

export function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function getRiskLevel(score: number): RiskLevel {
  if (score <= 30) return "High Risk";
  if (score <= 55) return "New / Unproven";
  if (score <= 75) return "Reliable";
  return "Trusted";
}

export function getBadge(score: number) {
  if (score <= 30) return "Protected Review Required";
  if (score <= 55) return "Emerging Credential";
  if (score <= 75) return "Reliable Wallet Credential";
  return "Trusted Wallet Credential";
}

export function getRecommendedAction(score: number) {
  if (score <= 30) return "High risk - avoid or require protection";
  if (score <= 55) return "Use caution - limit amount";
  if (score <= 75) return "Standard interaction";
  return "Trusted - safe for normal use";
}

export function getDecisionRecommendations(score: number) {
  if (score <= 30) return { risk: "High", sendMoney: "Require escrow or protection", lending: "Decline credit", highValueDeal: "Avoid without guarantees" };
  if (score <= 55) return { risk: "Medium", sendMoney: "Limit amount", lending: "Manual review", highValueDeal: "Enhanced verification" };
  if (score <= 75) return { risk: "Moderate", sendMoney: "Safe for standard transfers", lending: "Small limits", highValueDeal: "Standard verification" };
  return { risk: "Low", sendMoney: "Safe", lending: "Small limits approved", highValueDeal: "Standard verification" };
}

export function scoreGlobalWalletAge(days: number) {
  if (days <= 0) return 0;
  if (days <= 7) return 15;
  if (days <= 30) return 35;
  if (days <= 180) return 60;
  if (days <= 365) return 80;
  return 100;
}

export function scoreCrossChainActivity(txCount: number, activeChainCount: number) {
  const txScore = txCount === 0 ? 0 : txCount <= 5 ? 20 : txCount <= 25 ? 45 : txCount <= 100 ? 70 : 92;
  const chainScore = activeChainCount === 0 ? 0 : activeChainCount === 1 ? 20 : activeChainCount === 2 ? 45 : activeChainCount <= 4 ? 72 : 92;
  return clampScore(txScore * 0.7 + chainScore * 0.3);
}

export function scoreArcActivity(snapshot: WalletActivitySnapshot | null) {
  if (!snapshot || snapshot.txCount === 0) return 0;
  const txScore = snapshot.txCount <= 2 ? 20 : snapshot.txCount <= 8 ? 45 : snapshot.txCount <= 25 ? 70 : 90;
  const ageScore = scoreGlobalWalletAge(snapshot.walletAgeDays);
  const counterpartyScore = snapshot.counterparties === 0 ? 0 : snapshot.counterparties <= 2 ? 35 : snapshot.counterparties <= 8 ? 70 : 90;
  const balanceScore = snapshot.nativeBalance <= 0 ? 0 : snapshot.nativeBalance < 1 ? 25 : snapshot.nativeBalance < 10 ? 55 : 80;
  return clampScore(txScore * 0.45 + ageScore * 0.25 + counterpartyScore * 0.2 + balanceScore * 0.1);
}

export function scoreCounterpartyDiversity(globalCounterparties: number, arcCounterparties: number) {
  const weighted = globalCounterparties + arcCounterparties * 1.5;
  if (weighted <= 0) return 0;
  if (weighted <= 2) return 25;
  if (weighted <= 8) return 55;
  if (weighted <= 25) return 78;
  return 95;
}

export function scoreAttestations(verifiedTransactionCount: number, uniqueCounterparties: number) {
  if (verifiedTransactionCount <= 0 || uniqueCounterparties <= 0) return 0;
  return clampScore(
    15 +
    Math.max(uniqueCounterparties - 1, 0) * 10 +
    Math.max(verifiedTransactionCount - 1, 0) * 5
  );
}

export function getActivityLevel(snapshot: WalletActivitySnapshot | null): ActivityLevel {
  const txCount = snapshot?.txCount ?? 0;
  const recent = snapshot?.recentActivityCount ?? 0;
  if (txCount === 0) return "Dormant";
  if (txCount < 5 && recent < 2) return "Low";
  if (txCount < 20 && recent < 8) return "Moderate";
  return "High";
}

function detectRiskFlags(input: {
  globalAgeDays: number;
  arcTxCount: number;
  attestationCount: number;
  repeatedPairRatio: number;
  activeChainCount: number;
  hasLimitedCoverage: boolean;
  anomalyScore: number;
}) {
  const flags: string[] = [];
  if (input.globalAgeDays > 0 && input.globalAgeDays <= 7) flags.push("new_global_wallet");
  if (input.arcTxCount < 2) flags.push("low_arc_activity");
  if (input.attestationCount === 0) flags.push("no_verified_attestations");
  if (input.repeatedPairRatio > 0.7) flags.push("repeated_counterparty_pattern");
  if (input.activeChainCount === 0 && !input.hasLimitedCoverage) flags.push("no_indexed_chain_activity");
  if (input.anomalyScore >= 60) flags.push("trust_network_anomaly");
  return flags;
}

export function buildArcScore(profile: Profile, input: {
  snapshot: WalletActivitySnapshot | null;
  multiChain: MultiChainWalletProfile | null;
  attestationWeight: number;
  attestationCount: number;
  uniqueAttestationCounterparties: number;
  repeatedPairRatio: number;
  propagatedTrustScore?: number;
  trustAnomalyScore?: number;
}): { score: ArcScore; riskFlags: string[]; activityLevel: ActivityLevel } {
  const snapshot = input.snapshot;
  const multi = input.multiChain;
  const globalAgeDays = multi?.globalWalletAgeDays ?? 0;
  const activeChainCount = multi?.activeChains.length ?? 0;
  const contract = buildScoreContract(scoreInputFromParts({
    snapshot,
    multiChain: multi,
    attestationCount: input.attestationCount,
    uniqueAttestationCounterparties: input.uniqueAttestationCounterparties,
    repeatedPairRatio: input.repeatedPairRatio,
    propagatedTrustScore: input.propagatedTrustScore,
    trustAnomalyScore: input.trustAnomalyScore
  }));
  const trustPropagationScore = Math.min(10, Math.max(0, input.propagatedTrustScore ?? 0));
  const trustAnomalyPenalty = contract.riskPenalty;
  const freshWallet =
    globalAgeDays <= 0 &&
    activeChainCount === 0 &&
    (multi?.totalTxCount ?? 0) === 0 &&
    (snapshot?.txCount ?? 0) === 0 &&
    input.attestationCount === 0 &&
    trustPropagationScore === 0 &&
    trustAnomalyPenalty === 0;
  if (freshWallet) {
    return {
      score: {
        walletAddress: profile.walletAddress,
        arcScore: 35,
        riskLevel: "New / Unproven",
        activityScore: 0,
        longevityScore: 0,
        counterpartyDiversityScore: 0,
        balanceSignalScore: 0,
        attestationScore: 0,
        trustPropagationScore: 0,
        consistencyScore: 0,
        riskPenalty: 0,
        lastSyncedAt: new Date().toISOString()
      },
      riskFlags: [],
      activityLevel: "Dormant"
    };
  }
  const riskFlags = detectRiskFlags({
    globalAgeDays,
    arcTxCount: snapshot?.txCount ?? 0,
    attestationCount: input.attestationCount,
    repeatedPairRatio: input.repeatedPairRatio,
    activeChainCount,
    hasLimitedCoverage: Boolean(multi?.chains.some((chain) => chain.status === "limited")),
    anomalyScore: input.trustAnomalyScore ?? 0
  });
  const riskPenalty = trustAnomalyPenalty;
  const arcScore = contract.score;

  return {
    score: {
      walletAddress: profile.walletAddress,
      arcScore,
      riskLevel: contract.riskLevel,
      activityScore: contract.components.crossChain.points,
      longevityScore: contract.components.walletAge.points,
      counterpartyDiversityScore: contract.components.diversity.points,
      balanceSignalScore: contract.components.arcActivity.points,
      attestationScore: contract.components.attestations.points,
      trustPropagationScore,
      consistencyScore: contract.components.transactionActivity.points,
      riskPenalty,
      lastSyncedAt: new Date().toISOString()
    },
    riskFlags,
    activityLevel: getActivityLevel(snapshot)
  };
}
