import type { IdentityRecord, MultiChainWalletProfile, WalletActivitySnapshot } from "@/lib/types";

export const ARC_SCORE_MODEL_VERSION = "arc_score_v2_2026_07";

export type ScoreComponentKey =
  | "walletAge"
  | "crossChain"
  | "transactionActivity"
  | "diversity"
  | "arcActivity"
  | "attestations"
  | "propagatedTrust";

export type ScoreComponent = {
  points: number;
  max: number;
  reason: string;
  sourceValue: number | string;
};

export type ScoreComponents = Record<ScoreComponentKey, ScoreComponent>;

export const ARC_SCORE_COMPONENT_MAX = {
  walletAge: 20,
  crossChain: 5,
  transactionActivity: 15,
  diversity: 15,
  arcActivity: 25,
  attestations: 15,
  propagatedTrust: 5
} as const satisfies Record<ScoreComponentKey, number>;

export type ScoreContractInput = {
  walletAgeDays: number;
  activeChains: number;
  indexedTx: number;
  uniqueCounterparties: number;
  arcTx: number;
  arcWalletAgeDays: number;
  arcBalance: number;
  arcCounterparties: number;
  arcActiveDays: number;
  verifiedAttestations: number;
  verifiedAttestationCounterparties: number;
  attestationWeight: number;
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
  const arcWalletAgeDays = Math.max(0, finite(input.arcWalletAgeDays));
  const arcBalance = Math.max(0, finite(input.arcBalance));
  const arcCounterparties = Math.max(0, finite(input.arcCounterparties));
  const arcActiveDays = Math.max(0, finite(input.arcActiveDays));
  const verifiedAttestations = Math.max(0, finite(input.verifiedAttestations));
  const verifiedAttestationCounterparties = Math.max(0, finite(input.verifiedAttestationCounterparties));
  const attestationWeight = Math.max(0, finite(input.attestationWeight));
  const propagatedTrustScore = Math.max(0, finite(input.propagatedTrustScore));
  const anomalyScore = Math.max(0, finite(input.anomalyScore));
  const repeatedPairRatio = Math.max(0, finite(input.repeatedPairRatio));

  const walletAgePoints = tiered(walletAgeDays, [[7, 3], [30, 7], [180, 12], [365, 16]], ARC_SCORE_COMPONENT_MAX.walletAge);
  const crossChainPoints = Math.min(ARC_SCORE_COMPONENT_MAX.crossChain, Math.ceil(activeChains));
  const transactionPoints = tiered(indexedTx, [[4, 2], [19, 5], [49, 8], [99, 11], [249, 13]], ARC_SCORE_COMPONENT_MAX.transactionActivity);
  const diversityValue = uniqueCounterparties + arcCounterparties + verifiedAttestationCounterparties * 2;
  const diversityPoints = tiered(diversityValue, [[2, 3], [7, 6], [14, 9], [29, 12]], ARC_SCORE_COMPONENT_MAX.diversity);
  const arcTxPoints = tiered(arcTx, [[2, 3], [8, 5], [24, 7], [49, 9]], 10);
  const arcCounterpartyPoints = tiered(arcCounterparties, [[1, 2], [2, 3], [5, 4], [9, 5]], 6);
  const arcActiveDayPoints = tiered(arcActiveDays, [[1, 1], [3, 2], [7, 3], [14, 4]], 5);
  const arcAgePoints = tiered(arcWalletAgeDays, [[7, 1], [30, 2]], 3);
  const arcBalancePoints = arcBalance > 0 ? 1 : 0;
  const arcActivityPoints = arcTx <= 0 ? 0 : Math.min(ARC_SCORE_COMPONENT_MAX.arcActivity, arcTxPoints + arcCounterpartyPoints + arcActiveDayPoints + arcAgePoints + arcBalancePoints);
  const attestationQualityPoints = attestationWeight >= 3 ? 2 : attestationWeight >= 1 ? 1 : 0;
  const attestationPoints = verifiedAttestations <= 0
    ? 0
    : Math.min(
      ARC_SCORE_COMPONENT_MAX.attestations,
      8 +
      Math.min(3, Math.max(0, verifiedAttestationCounterparties - 1) * 3) +
      Math.min(2, Math.max(0, verifiedAttestations - 1)) +
      attestationQualityPoints
    );
  const propagatedTrustPoints = Math.min(ARC_SCORE_COMPONENT_MAX.propagatedTrust, Math.round(propagatedTrustScore / 3));

  const components: ScoreComponents = {
    walletAge: {
      points: walletAgePoints,
      max: ARC_SCORE_COMPONENT_MAX.walletAge,
      reason: walletAgeDays > 0
        ? `Wallet maturity contributes ${walletAgePoints}/${ARC_SCORE_COMPONENT_MAX.walletAge} as anti-sybil confidence from ${walletAgeDays} indexed days.`
        : "No indexed wallet age detected yet. Wallet maturity supports Identity Score but does not dominate it.",
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
        : input.providerLimited ? "Provider coverage is limited, so transaction activity is not treated as confirmed zero." : "No indexed transactions detected yet. Non-Arc transaction volume is not the main Identity Score driver.",
      sourceValue: indexedTx
    },
    diversity: {
      points: diversityPoints,
      max: ARC_SCORE_COMPONENT_MAX.diversity,
      reason: diversityValue > 0
        ? `Verified and Arc-weighted counterparty diversity contributes ${diversityPoints}/${ARC_SCORE_COMPONENT_MAX.diversity} from ${arcCounterparties} Arc, ${verifiedAttestationCounterparties} verified and ${uniqueCounterparties} global counterparties.`
        : "No verified or Arc-native counterparties detected yet.",
      sourceValue: diversityValue
    },
    arcActivity: {
      points: arcActivityPoints,
      max: ARC_SCORE_COMPONENT_MAX.arcActivity,
      reason: arcTx > 0
        ? `Arc ecosystem activity contributes ${arcActivityPoints}/${ARC_SCORE_COMPONENT_MAX.arcActivity} from ${arcTx} Arc transaction${arcTx === 1 ? "" : "s"}, ${arcCounterparties} Arc counterparties, ${arcActiveDays} active day${arcActiveDays === 1 ? "" : "s"}, ${arcWalletAgeDays} indexed Arc days and the current Arc balance signal.`
        : "No Arc Testnet activity detected yet. Identity Score is primarily based on Arc ecosystem behavior.",
      sourceValue: arcTx
    },
    attestations: {
      points: attestationPoints,
      max: ARC_SCORE_COMPONENT_MAX.attestations,
      reason: verifiedAttestations > 0
        ? `Verified transaction-backed trust contributes ${attestationPoints}/${ARC_SCORE_COMPONENT_MAX.attestations} from ${verifiedAttestations} attestation${verifiedAttestations === 1 ? "" : "s"}, ${verifiedAttestationCounterparties} verified counterparties and ${attestationWeight.toFixed(2)} weighted trust evidence.`
        : "No verified transaction-backed attestations yet. Attestations are a capped secondary reputation signal.",
      sourceValue: verifiedAttestations
    },
    propagatedTrust: {
      points: propagatedTrustPoints,
      max: ARC_SCORE_COMPONENT_MAX.propagatedTrust,
      reason: propagatedTrustPoints > 0
        ? `Verified trust graph propagation contributes ${propagatedTrustPoints}/${ARC_SCORE_COMPONENT_MAX.propagatedTrust}; network influence remains capped and cannot dominate wallet behavior.`
        : "No propagated trust contribution is currently applied.",
      sourceValue: propagatedTrustScore
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
  attestationWeight?: number;
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
    arcWalletAgeDays: parts.snapshot?.walletAgeDays ?? 0,
    arcBalance: parts.snapshot?.nativeBalance ?? 0,
    arcCounterparties: parts.snapshot?.counterparties ?? 0,
    arcActiveDays: parts.snapshot?.activeDays ?? 0,
    verifiedAttestations: parts.attestationCount,
    verifiedAttestationCounterparties: parts.uniqueAttestationCounterparties,
    attestationWeight: parts.attestationWeight ?? 0,
    propagatedTrustScore: parts.propagatedTrustScore ?? 0,
    anomalyScore: parts.trustAnomalyScore ?? 0,
    repeatedPairRatio: parts.repeatedPairRatio ?? 0,
    providerLimited: limited
  };
}

export function scoreInputFromUnknown(value: unknown): ScoreContractInput | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const numeric = (key: string) => Math.max(0, finite(Number(input[key] ?? 0)));
  return {
    walletAgeDays: numeric("walletAgeDays"),
    activeChains: numeric("activeChains"),
    indexedTx: numeric("indexedTx"),
    uniqueCounterparties: numeric("uniqueCounterparties"),
    arcTx: numeric("arcTx"),
    arcWalletAgeDays: numeric("arcWalletAgeDays"),
    arcBalance: numeric("arcBalance"),
    arcCounterparties: numeric("arcCounterparties"),
    arcActiveDays: numeric("arcActiveDays"),
    verifiedAttestations: numeric("verifiedAttestations"),
    verifiedAttestationCounterparties: numeric("verifiedAttestationCounterparties"),
    attestationWeight: numeric("attestationWeight"),
    propagatedTrustScore: numeric("propagatedTrustScore"),
    anomalyScore: numeric("anomalyScore"),
    repeatedPairRatio: numeric("repeatedPairRatio"),
    providerLimited: Boolean(input.providerLimited)
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
  const storedInput = identity.profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
    ? scoreInputFromUnknown(identity.profile.scoreInputs)
    : null;
  if (storedInput) return buildScoreContract(storedInput).components;
  return buildScoreContract(scoreInputFromParts({
    snapshot: identity.snapshot,
    multiChain: identity.multiChain ?? null,
    attestationCount: identity.acceptedAttestations,
    uniqueAttestationCounterparties: identity.uniqueCounterparties,
    attestationWeight: identity.attestationWeight ?? 0,
    propagatedTrustScore: identity.trustGraph?.metrics.propagatedTrustScore ?? identity.score.trustPropagationScore,
    trustAnomalyScore: identity.trustGraph?.metrics.anomalyScore ?? 0,
    repeatedPairRatio: identity.repeatedPairRatio ?? 0
  })).components;
}
