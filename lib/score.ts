import type { ActivityLevel, ArcScore, MultiChainWalletProfile, Profile, RiskLevel, WalletActivitySnapshot } from "@/lib/types";
import { ARC_SCORE_MODEL_VERSION, buildScoreContract, scoreInputFromParts } from "@/lib/score-contract";
import type { ScoreComponents, ScoreContractInput } from "@/lib/score-contract";

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
function latestScoreEvidenceAt(
  profile: Profile,
  snapshot: WalletActivitySnapshot | null,
  multiChain: MultiChainWalletProfile | null
) {
  const candidates = [
    snapshot?.createdAt,
    ...(multiChain?.chains.map((chain) => chain.indexedAt) ?? []),
    profile.scoreCalculatedAt
  ].filter((value): value is string => Boolean(value));
  const latest = candidates.reduce((current, value) => {
    const time = Date.parse(value);
    return Number.isFinite(time) && time > current ? time : current;
  }, 0);
  return latest > 0 ? new Date(latest).toISOString() : profile.createdAt;
}
export function arcScoreFromInput(walletAddress: string, input: ScoreContractInput, lastSyncedAt: string): ArcScore {
  const contract = buildScoreContract(input);
  return {
    walletAddress,
    arcScore: contract.score,
    riskLevel: contract.riskLevel,
    activityScore: contract.components.crossChain.points,
    longevityScore: contract.components.walletAge.points,
    counterpartyDiversityScore: contract.components.diversity.points,
    balanceSignalScore: contract.components.arcActivity.points,
    attestationScore: contract.components.attestations.points,
    trustPropagationScore: contract.components.propagatedTrust.points,
    consistencyScore: contract.components.transactionActivity.points,
    riskPenalty: contract.riskPenalty,
    lastSyncedAt,
    modelVersion: ARC_SCORE_MODEL_VERSION
  };
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
}): {
  score: ArcScore;
  riskFlags: string[];
  activityLevel: ActivityLevel;
  scoreInput: ScoreContractInput;
  components: ScoreComponents;
} {
  const snapshot = input.snapshot;
  const multi = input.multiChain;
  const globalAgeDays = multi?.globalWalletAgeDays ?? 0;
  const activeChainCount = multi?.activeChains.length ?? 0;
  const scoreInput = scoreInputFromParts({
    snapshot,
    multiChain: multi,
    attestationCount: input.attestationCount,
    uniqueAttestationCounterparties: input.uniqueAttestationCounterparties,
    attestationWeight: input.attestationWeight,
    repeatedPairRatio: input.repeatedPairRatio,
    propagatedTrustScore: input.propagatedTrustScore,
    trustAnomalyScore: input.trustAnomalyScore
  });
  const contract = buildScoreContract(scoreInput);
  const trustPropagationScore = contract.components.propagatedTrust.points;
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
        lastSyncedAt: latestScoreEvidenceAt(profile, snapshot, multi),
        modelVersion: ARC_SCORE_MODEL_VERSION
      },
      riskFlags: [],
      activityLevel: "Dormant",
      scoreInput,
      components: contract.components
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
      lastSyncedAt: latestScoreEvidenceAt(profile, snapshot, multi),
      modelVersion: ARC_SCORE_MODEL_VERSION
    },
    riskFlags,
    activityLevel: getActivityLevel(snapshot),
    scoreInput,
    components: contract.components
  };
}

