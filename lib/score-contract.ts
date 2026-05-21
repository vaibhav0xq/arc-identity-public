import type { IdentityRecord, MultiChainWalletProfile, WalletActivitySnapshot } from "@/lib/types";

export type ScoreComponentKey =
  | "walletAge"
  | "crossChain"
  | "transactionActivity"
  | "diversity"
  | "arcActivity"
  | "attestations";

export type ScoreComponent = {
  points: number;
  max: number;
  reason: string;
  sourceValue: number | string;
};

export type ScoreComponents = Record<ScoreComponentKey, ScoreComponent>;

export const ARC_SCORE_COMPONENT_MAX = {
  walletAge: 10,
  crossChain: 5,
  transactionActivity: 5,
  diversity: 15,
  arcActivity: 35,
  attestations: 30
} as const satisfies Record<ScoreComponentKey, number>;

export type ScoreContractInput = {
  walletAgeDays: number;
  activeChains: number;
  indexedTx: number;
  uniqueCounterparties: number;
  arcTx: number;
  arcCounterparties: number;
  arcActiveDays: number;
  verifiedAttestations: number;
  verifiedAttestationCounterparties: number;
  propagatedTrustScore: number;
  anomalyScore: number;
  repeatedPairRatio: number;
  providerLimited: boolean;
};

export type ScoreContractResult = {
  score: number;
  riskLevel: "High Risk" | "New / Unproven" | "Reliable" | "Trusted";
  riskPenalty: number;
  components: ScoreComponents;
};

function finite(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function getRiskLevel(score: number): ScoreContractResult["riskLevel"] {
  if (score <= 30) return "High Risk";
  if (score <= 55) return "New / Unproven";
  if (score <= 75) return "Reliable";
  return "Trusted";
}

function tiered(value: number, tiers: Array<[number, number]>, max: number) {
  if (value <= 0) return 0;
  for (const [threshold, points] of tiers) {
    if (value <= threshold) return points;
  }
  return max;
}

export function buildScoreContract(input: ScoreContractInput): ScoreContractResult {
  const walletAgeDays = Math.max(0, finite(input.walletAgeDays));
  const activeChains = Math.max(0, finite(input.activeChains));
  const indexedTx = Math.max(0, finite(input.indexedTx));
  const uniqueCounterparties = Math.max(0, finite(input.uniqueCounterparties));
  const arcTx = Math.max(0, finite(input.arcTx));
  const arcCounterparties = Math.max(0, finite(input.arcCounterparties));
  const arcActiveDays = Math.max(0, finite(input.arcActiveDays));
  const verifiedAttestations = Math.max(0, finite(input.verifiedAttestations));
  const verifiedAttestationCounterparties = Math.max(0, finite(input.verifiedAttestationCounterparties));
  const propagatedTrustScore = Math.max(0, finite(input.propagatedTrustScore));
  const anomalyScore = Math.max(0, finite(input.anomalyScore));
  const repeatedPairRatio = Math.max(0, finite(input.repeatedPairRatio));

  const walletAgePoints = tiered(walletAgeDays, [[7, 2], [30, 4], [180, 7], [365, 9]], ARC_SCORE_COMPONENT_MAX.walletAge);
  const crossChainPoints = activeChains <= 0 ? 0 : activeChains === 1 ? 2 : activeChains === 2 ? 3 : activeChains === 3 ? 4 : ARC_SCORE_COMPONENT_MAX.crossChain;
  const transactionPoints = tiered(indexedTx, [[4, 1], [19, 2], [99, 3], [249, 4]], ARC_SCORE_COMPONENT_MAX.transactionActivity);
  const diversityValue = Math.min(6, uniqueCounterparties) + arcCounterparties * 2 + verifiedAttestationCounterparties * 3;
  const diversityPoints = tiered(diversityValue, [[2, 3], [7, 7], [14, 11], [24, 13]], ARC_SCORE_COMPONENT_MAX.diversity);
  const arcActivityPoints = arcTx <= 0
    ? 0
    : Math.min(
      ARC_SCORE_COMPONENT_MAX.arcActivity,
      tiered(arcTx, [[2, 8], [8, 17], [24, 25], [49, 31]], 33) +
      Math.min(4, Math.floor(arcActiveDays / 7)) +
      Math.min(3, arcCounterparties)
    );
  const trustBonus = Math.min(8, Math.floor(propagatedTrustScore / 4));
  const attestationPoints = verifiedAttestations <= 0
    ? 0
    : Math.min(
      ARC_SCORE_COMPONENT_MAX.attestations,
      10 +
      Math.max(0, verifiedAttestationCounterparties - 1) * 5 +
      Math.max(0, verifiedAttestations - 1) * 3 +
      trustBonus
    );

  const components: ScoreComponents = {
    walletAge: {
      points: walletAgePoints,
      max: ARC_SCORE_COMPONENT_MAX.walletAge,
      reason: walletAgeDays > 0
        ? `Wallet maturity contributes ${walletAgePoints}/${ARC_SCORE_COMPONENT_MAX.walletAge} as anti-sybil confidence from ${walletAgeDays} indexed days.`
        : "No indexed wallet age detected yet. Wallet maturity supports ARC Score but does not dominate it.",
      sourceValue: `${walletAgeDays}d`
    },
    crossChain: {
      points: crossChainPoints,
      max: ARC_SCORE_COMPONENT_MAX.crossChain,
      reason: activeChains > 0
        ? `Global chain coverage contributes ${crossChainPoints}/${ARC_SCORE_COMPONENT_MAX.crossChain} as supporting context from ${activeChains} active indexed chain${activeChains === 1 ? "" : "s"}.`
        : input.providerLimited ? "Provider coverage is limited, so active chain coverage is not treated as confirmed zero." : "No active indexed chains detected yet. Generic chain coverage is secondary to Arc-native reputation.",
      sourceValue: activeChains
    },
    transactionActivity: {
      points: transactionPoints,
      max: ARC_SCORE_COMPONENT_MAX.transactionActivity,
      reason: indexedTx > 0
        ? `Generic indexed activity contributes ${transactionPoints}/${ARC_SCORE_COMPONENT_MAX.transactionActivity} as maturity context from ${indexedTx} transaction${indexedTx === 1 ? "" : "s"}.`
        : input.providerLimited ? "Provider coverage is limited, so transaction activity is not treated as confirmed zero." : "No indexed transactions detected yet. Non-Arc transaction volume is not the main ARC Score driver.",
      sourceValue: indexedTx
    },
    diversity: {
      points: diversityPoints,
      max: ARC_SCORE_COMPONENT_MAX.diversity,
      reason: diversityValue > 0
        ? `Verified and Arc-weighted counterparty diversity contributes ${diversityPoints}/${ARC_SCORE_COMPONENT_MAX.diversity} from ${arcCounterparties} Arc, ${verifiedAttestationCounterparties} verified, and ${uniqueCounterparties} global counterparties.`
        : "No verified or Arc-native counterparties detected yet.",
      sourceValue: diversityValue
    },
    arcActivity: {
      points: arcActivityPoints,
      max: ARC_SCORE_COMPONENT_MAX.arcActivity,
      reason: arcTx > 0
        ? `Arc ecosystem activity contributes ${arcActivityPoints}/${ARC_SCORE_COMPONENT_MAX.arcActivity} from ${arcTx} Arc transaction${arcTx === 1 ? "" : "s"}, ${arcCounterparties} Arc counterparties, and ${arcActiveDays} active day${arcActiveDays === 1 ? "" : "s"}.`
        : "No Arc Testnet activity detected yet. ARC Score is primarily based on Arc ecosystem behavior.",
      sourceValue: arcTx
    },
    attestations: {
      points: attestationPoints,
      max: ARC_SCORE_COMPONENT_MAX.attestations,
      reason: verifiedAttestations > 0
        ? `Verified transaction-backed trust contributes ${attestationPoints}/${ARC_SCORE_COMPONENT_MAX.attestations} from ${verifiedAttestations} attestation${verifiedAttestations === 1 ? "" : "s"}, ${verifiedAttestationCounterparties} verified counterparties, and trust graph strength.`
        : "No verified transaction-backed attestations yet. Verified Arc trust is a primary ARC Score driver.",
      sourceValue: verifiedAttestations
    }
  };

  const riskPenalty = Math.min(
    10,
    (anomalyScore >= 60 ? 6 : anomalyScore >= 30 ? 3 : 0) +
    (repeatedPairRatio > 0.7 ? 4 : 0)
  );
  const score = clampScore(Object.values(components).reduce((sum, component) => sum + component.points, 0) - riskPenalty);

  return {
    score,
    riskLevel: getRiskLevel(score),
    riskPenalty,
    components
  };
}

export function scoreInputFromParts(parts: {
  snapshot: WalletActivitySnapshot | null;
  multiChain: MultiChainWalletProfile | null;
  attestationCount: number;
  uniqueAttestationCounterparties: number;
  repeatedPairRatio?: number;
  propagatedTrustScore?: number;
  trustAnomalyScore?: number;
}): ScoreContractInput {
  const limited = Boolean(parts.multiChain?.chains.some((chain) => chain.status === "limited" || chain.status === "error" || chain.status === "not_configured"));
  return {
    walletAgeDays: parts.multiChain?.globalWalletAgeDays ?? 0,
    activeChains: parts.multiChain?.activeChains.length ?? 0,
    indexedTx: parts.multiChain?.totalTxCount ?? 0,
    uniqueCounterparties: parts.multiChain?.uniqueCounterparties ?? 0,
    arcTx: parts.snapshot?.txCount ?? 0,
    arcCounterparties: parts.snapshot?.counterparties ?? 0,
    arcActiveDays: parts.snapshot?.activeDays ?? 0,
    verifiedAttestations: parts.attestationCount,
    verifiedAttestationCounterparties: parts.uniqueAttestationCounterparties,
    propagatedTrustScore: parts.propagatedTrustScore ?? 0,
    anomalyScore: parts.trustAnomalyScore ?? 0,
    repeatedPairRatio: parts.repeatedPairRatio ?? 0,
    providerLimited: limited
  };
}

export function scoreComponentsFromIdentity(identity: IdentityRecord | null): ScoreComponents {
  if (!identity) {
    return buildScoreContract(scoreInputFromParts({
      snapshot: null,
      multiChain: null,
      attestationCount: 0,
      uniqueAttestationCounterparties: 0
    })).components;
  }
  return buildScoreContract(scoreInputFromParts({
    snapshot: identity.snapshot,
    multiChain: identity.multiChain ?? null,
    attestationCount: identity.acceptedAttestations,
    uniqueAttestationCounterparties: identity.uniqueCounterparties,
    propagatedTrustScore: identity.trustGraph?.metrics.propagatedTrustScore ?? identity.score.trustPropagationScore,
    trustAnomalyScore: identity.trustGraph?.metrics.anomalyScore ?? 0,
    repeatedPairRatio: 0
  })).components;
}
