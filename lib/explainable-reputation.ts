import type { Attestation, IdentityRecord } from "@/lib/types";

export type ReputationTier = "Low" | "Medium" | "High";
export type RiskBadge = "Low risk" | "Watchlist" | "High risk";

export type ReputationRiskFlags = {
  suddenTxSpikes?: boolean;
  suspiciousPatterns?: boolean;
  repetitiveBehavior?: boolean;
};

export type ReputationAttestationInput = {
  id?: string;
  from: string;
  attesterScore?: number;
  weight?: number;
  reason?: string;
};

export type ReputationScoreInput = {
  wallet: string;
  canonicalScore?: number | null;
  canonicalBreakdown?: {
    wallet_age: number;
    activity: number;
    attestations: number;
    network: number;
    risk: number;
  } | null;
  walletAgeDays: number;
  totalTransactions: number;
  uniqueContractsInteracted: number;
  transactionFrequency: number;
  counterpartiesCount: number;
  attestations: ReputationAttestationInput[];
  riskFlags: ReputationRiskFlags;
  historicalActivityPattern: "consistent" | "spiky" | "repetitive" | "new" | "unknown";
  repeatedInteractionRatio?: number;
  lastUpdated?: string | null;
};

export type ReputationComponent = {
  normalized: number;
  weight: number;
  contribution: number;
  reason: string;
};

export type ExplainableReputation = {
  wallet: string;
  score: number;
  modelScore: number;
  scoreBasis: "canonical_arc_score" | "v1_model";
  tier: ReputationTier;
  riskBadge: RiskBadge;
  breakdown: {
    wallet_age: number;
    activity: number;
    attestations: number;
    network: number;
    risk: number;
  };
  components: {
    wallet_age: ReputationComponent;
    activity: ReputationComponent;
    attestations: ReputationComponent;
    network: ReputationComponent;
    risk: ReputationComponent;
  };
  insights: string[];
  attestations: Array<{
    id: string;
    from: string;
    impact: number;
    reason: string;
  }>;
  last_updated: string;
};

const SCORE_WEIGHTS = {
  walletAge: 20,
  activity: 25,
  attestations: 30,
  network: 15,
  risk: 10
} as const;

const CANONICAL_GROUP_MAX = {
  wallet_age: 20,
  activity: 40,
  attestations: 15,
  network: 25,
  risk: 10
} as const;

function clamp(value: number, min = 0, max = 100) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function contribution(normalized: number, weight: number) {
  return Math.round((clamp(normalized) / 100) * weight);
}

function monthLabel(days: number) {
  if (days < 30) return `${Math.max(0, Math.round(days))} days`;
  const months = Math.max(1, Math.round(days / 30));
  return `${months}+ months`;
}

function scoreWalletAge(days: number): ReputationComponent {
  const safeDays = Math.max(0, Math.round(days || 0));
  let normalized = 0;
  if (safeDays < 90) {
    normalized = (safeDays / 90) * 40;
  } else if (safeDays <= 365) {
    normalized = 45 + ((safeDays - 90) / 275) * 35;
  } else {
    normalized = 82 + Math.min(18, ((safeDays - 365) / 730) * 18);
  }

  const reason = safeDays > 365
    ? `Active wallet for ${monthLabel(safeDays)}, which supports maturity confidence.`
    : safeDays >= 90
      ? `Wallet has ${monthLabel(safeDays)} of history, enough for medium maturity context.`
      : `Wallet is newer than 90 days, so age contributes cautiously.`;

  return { normalized: Math.round(clamp(normalized)), weight: SCORE_WEIGHTS.walletAge, contribution: contribution(normalized, SCORE_WEIGHTS.walletAge), reason };
}

function consistencyScore(pattern: ReputationScoreInput["historicalActivityPattern"], txFrequency: number) {
  if (pattern === "consistent") return 100;
  if (pattern === "new") return txFrequency > 0 ? 55 : 25;
  if (pattern === "spiky") return 38;
  if (pattern === "repetitive") return 42;
  return txFrequency > 0 ? 65 : 20;
}

function scoreActivity(input: ReputationScoreInput): ReputationComponent {
  const frequency = Math.max(0, input.transactionFrequency || 0);
  const steadyFrequency = frequency === 0 ? 0 : frequency <= 2 ? 55 : frequency <= 18 ? 100 : frequency <= 40 ? 78 : 50;
  const contractDiversity = clamp((Math.max(0, input.uniqueContractsInteracted) / 20) * 100);
  const volumeSanity = input.totalTransactions <= 0 ? 0 : input.totalTransactions < 5 ? 35 : input.totalTransactions <= 1000 ? 100 : 75;
  const normalized = Math.round(
    consistencyScore(input.historicalActivityPattern, frequency) * 0.4 +
    steadyFrequency * 0.25 +
    contractDiversity * 0.25 +
    volumeSanity * 0.1
  );

  const reason = input.historicalActivityPattern === "consistent"
    ? "Activity is steady rather than spike-driven, with contract interaction diversity included."
    : input.historicalActivityPattern === "spiky"
      ? "Activity has spike patterns, so raw transaction volume is discounted."
      : input.historicalActivityPattern === "repetitive"
        ? "Repeated behavior limits the activity-quality contribution."
        : "Activity quality is based on transaction cadence and contract diversity.";

  return { normalized: clamp(normalized), weight: SCORE_WEIGHTS.activity, contribution: contribution(normalized, SCORE_WEIGHTS.activity), reason };
}

function attesterMultiplier(score: number | undefined) {
  if (!Number.isFinite(score ?? NaN)) return 1;
  if ((score ?? 0) >= 80) return 1.5;
  if ((score ?? 0) >= 60) return 1.2;
  if ((score ?? 0) >= 35) return 1;
  return 0.75;
}

function scoreAttestations(attestations: ReputationAttestationInput[]) {
  const impacts = attestations.slice(0, 12).map((item, index) => {
    const base = Math.max(1, item.weight ?? 5);
    const multiplier = attesterMultiplier(item.attesterScore);
    const impact = Math.max(1, Math.round(base * multiplier));
    return {
      id: item.id ?? `${item.from.toLowerCase()}-${index}`,
      from: item.from,
      impact,
      reason: item.reason ?? (multiplier > 1 ? "high reputation attester" : "verified transaction-backed attestation")
    };
  });
  const normalized = clamp(impacts.reduce((sum, item) => sum + item.impact, 0) * 7);
  const reason = impacts.length
    ? `${impacts.length} verified attestation${impacts.length === 1 ? "" : "s"} add transaction-backed trust context.`
    : "No verified attestations are attached yet, so this component remains open for growth.";
  return {
    component: { normalized: Math.round(normalized), weight: SCORE_WEIGHTS.attestations, contribution: contribution(normalized, SCORE_WEIGHTS.attestations), reason },
    impacts
  };
}

function scoreNetwork(input: ReputationScoreInput): ReputationComponent {
  const counterparties = Math.max(0, input.counterpartiesCount || 0);
  const counterpartyScore = clamp((counterparties / 18) * 100);
  const repeatedPenalty = clamp((input.repeatedInteractionRatio ?? 0) * 35, 0, 35);
  const normalized = clamp(counterpartyScore - repeatedPenalty);
  const reason = counterparties > 8
    ? "Wallet interacts with a broad counterparty set, which strengthens network diversity."
    : counterparties > 0
      ? "Network diversity is developing from registered and on-chain counterparties."
      : "No meaningful counterparty diversity has been indexed yet.";
  return { normalized: Math.round(normalized), weight: SCORE_WEIGHTS.network, contribution: contribution(normalized, SCORE_WEIGHTS.network), reason };
}

function scoreRisk(input: ReputationScoreInput): ReputationComponent {
  let risk = 0;
  if (input.riskFlags.suddenTxSpikes || input.historicalActivityPattern === "spiky") risk += 35;
  if (input.riskFlags.suspiciousPatterns) risk += 45;
  if (input.riskFlags.repetitiveBehavior || input.historicalActivityPattern === "repetitive") risk += 30;
  if ((input.repeatedInteractionRatio ?? 0) > 0.65) risk += 20;
  const normalized = clamp(risk);
  const reason = normalized > 60
    ? "High risk signals detected, so reputation is reduced."
    : normalized > 0
      ? "Some risk signals are present and applied as a transparent penalty."
      : "Low risk signals detected.";
  return { normalized: Math.round(normalized), weight: SCORE_WEIGHTS.risk, contribution: -contribution(normalized, SCORE_WEIGHTS.risk), reason };
}

function canonicalComponent(contributionValue: number, max: number, reason: string): ReputationComponent {
  const safeMax = Math.max(1, max);
  return {
    normalized: Math.round(clamp((Math.abs(contributionValue) / safeMax) * 100)),
    weight: max,
    contribution: Math.round(contributionValue),
    reason
  };
}

function canonicalBreakdownFromIdentity(identity: IdentityRecord) {
  return {
    wallet_age: Math.round(identity.score.longevityScore),
    activity: Math.round(identity.score.balanceSignalScore + identity.score.consistencyScore),
    attestations: Math.round(identity.score.attestationScore),
    network: Math.round(identity.score.counterpartyDiversityScore + identity.score.activityScore + identity.score.trustPropagationScore),
    risk: -Math.round(identity.score.riskPenalty)
  };
}

function tierForScore(score: number): ReputationTier {
  if (score >= 70) return "High";
  if (score >= 40) return "Medium";
  return "Low";
}

function riskBadgeForRisk(normalizedRisk: number): RiskBadge {
  if (normalizedRisk >= 65) return "High risk";
  if (normalizedRisk >= 25) return "Watchlist";
  return "Low risk";
}

function riskFlagsFromProfile(flags: string[]): ReputationRiskFlags {
  const normalized = flags.map((flag) => flag.toLowerCase());
  return {
    suddenTxSpikes: normalized.some((flag) => flag.includes("spike") || flag.includes("burst")),
    suspiciousPatterns: normalized.some((flag) => flag.includes("suspicious") || flag.includes("sybil") || flag.includes("risk")),
    repetitiveBehavior: normalized.some((flag) => flag.includes("repeat") || flag.includes("loop") || flag.includes("farm"))
  };
}

function activityPattern(identity: IdentityRecord): ReputationScoreInput["historicalActivityPattern"] {
  if ((identity.profile.riskFlags ?? []).some((flag) => /spike|burst/i.test(flag))) return "spiky";
  if ((identity.profile.riskFlags ?? []).some((flag) => /repeat|loop|farm/i.test(flag))) return "repetitive";
  const totalTx = identity.multiChain?.totalTxCount ?? identity.snapshot?.txCount ?? identity.profile.txCount ?? 0;
  const activeDays = identity.snapshot?.activeDays ?? 0;
  if (totalTx <= 0) return "new";
  if (activeDays >= 10 || (identity.snapshot?.activityFrequency ?? 0) > 0) return "consistent";
  return "unknown";
}

function attestationInputs(attestations: Attestation[], wallet: string): ReputationAttestationInput[] {
  const normalizedWallet = wallet.toLowerCase();
  return attestations.map((item) => {
    const from = item.fromWallet.toLowerCase() === normalizedWallet ? item.toWallet : item.fromWallet;
    return {
      id: item.id,
      from,
      weight: item.weight,
      attesterScore: item.senderScoreAt,
      reason: item.senderScoreAt >= 80 ? "high reputation attester" : "verified transaction-backed attestation"
    };
  });
}

export function reputationInputFromIdentity(identity: IdentityRecord, attestations: Attestation[] = []): ReputationScoreInput {
  const walletAgeDays = identity.multiChain?.globalWalletAgeDays ?? identity.snapshot?.walletAgeDays ?? identity.profile.globalWalletAgeDays ?? 0;
  const totalTransactions = identity.multiChain?.totalTxCount ?? identity.snapshot?.txCount ?? identity.profile.txCount ?? 0;
  const uniqueContractsInteracted = identity.multiChain?.totalContractInteractions ?? identity.snapshot?.contractInteractionCount ?? identity.profile.activeChainCount ?? 0;
  const txFrequency = identity.snapshot?.activityFrequency ?? (walletAgeDays > 0 ? totalTransactions / Math.max(1, walletAgeDays / 7) : 0);
  const counterparties = Math.max(
    identity.uniqueCounterparties ?? 0,
    identity.multiChain?.uniqueCounterparties ?? 0,
    identity.snapshot?.counterparties ?? 0
  );
  const riskFlags = riskFlagsFromProfile(identity.profile.riskFlags ?? []);
  if (identity.trustGraph?.metrics.suspicious || (identity.trustGraph?.metrics.anomalyScore ?? 0) >= 50) {
    riskFlags.suspiciousPatterns = true;
  }

  return {
    wallet: identity.profile.walletAddress,
    canonicalScore: identity.score.arcScore,
    canonicalBreakdown: canonicalBreakdownFromIdentity(identity),
    walletAgeDays,
    totalTransactions,
    uniqueContractsInteracted,
    transactionFrequency: txFrequency,
    counterpartiesCount: counterparties,
    attestations: attestationInputs(attestations, identity.profile.walletAddress),
    riskFlags,
    historicalActivityPattern: activityPattern(identity),
    repeatedInteractionRatio: 0,
    lastUpdated: identity.profile.scoreCalculatedAt ?? identity.score.lastSyncedAt ?? identity.profile.updatedAt
  };
}

export function buildExplainableReputation(input: ReputationScoreInput): ExplainableReputation {
  const walletAge = scoreWalletAge(input.walletAgeDays);
  const activity = scoreActivity(input);
  const attestationScore = scoreAttestations(input.attestations);
  const network = scoreNetwork(input);
  const risk = scoreRisk(input);
  const modelScore = clamp(walletAge.contribution + activity.contribution + attestationScore.component.contribution + network.contribution + risk.contribution);
  const score = clamp(typeof input.canonicalScore === "number" ? input.canonicalScore : modelScore);
  const canonicalBreakdown = input.canonicalBreakdown && typeof input.canonicalScore === "number" ? input.canonicalBreakdown : null;
  const finalWalletAge = canonicalBreakdown
    ? canonicalComponent(canonicalBreakdown.wallet_age, CANONICAL_GROUP_MAX.wallet_age, walletAge.reason)
    : walletAge;
  const finalActivity = canonicalBreakdown
    ? canonicalComponent(canonicalBreakdown.activity, CANONICAL_GROUP_MAX.activity, "Arc ecosystem activity and transaction consistency are grouped here as the main behavior signal.")
    : activity;
  const finalAttestations = canonicalBreakdown
    ? canonicalComponent(canonicalBreakdown.attestations, CANONICAL_GROUP_MAX.attestations, attestationScore.component.reason)
    : attestationScore.component;
  const finalNetwork = canonicalBreakdown
    ? canonicalComponent(canonicalBreakdown.network, CANONICAL_GROUP_MAX.network, "Counterparty diversity and supporting chain coverage are grouped here as network context.")
    : network;
  const finalRisk = canonicalBreakdown
    ? canonicalComponent(canonicalBreakdown.risk, CANONICAL_GROUP_MAX.risk, risk.reason)
    : risk;
  const insights = [
    `Active wallet for ${monthLabel(input.walletAgeDays)}`,
    finalActivity.normalized >= 75
      ? "Arc activity and transaction consistency are strong"
      : finalActivity.normalized >= 45
        ? "Activity context is developing"
        : "Activity pattern is still stabilizing",
    input.uniqueContractsInteracted >= 5 || finalActivity.normalized >= 70
      ? "Interacts with multiple protocols"
      : "Contract diversity is still developing",
    finalNetwork.normalized >= 70
      ? "Counterparty network shows healthy diversity"
      : finalNetwork.normalized >= 35
        ? "Counterparty network is developing"
        : "Counterparty network is still early",
    finalRisk.normalized <= 10 ? "Low risk signals detected" : "Risk signals are visible and reflected in the score"
  ];
  if (finalAttestations.contribution > 0) {
    insights.splice(3, 0, "Verified attestations improve reputation confidence");
  }

  return {
    wallet: input.wallet,
    score: Math.round(score),
    modelScore: Math.round(typeof input.canonicalScore === "number" ? score : modelScore),
    scoreBasis: typeof input.canonicalScore === "number" ? "canonical_arc_score" : "v1_model",
    tier: tierForScore(score),
    riskBadge: riskBadgeForRisk(risk.normalized),
    breakdown: {
      wallet_age: finalWalletAge.contribution,
      activity: finalActivity.contribution,
      attestations: finalAttestations.contribution,
      network: finalNetwork.contribution,
      risk: finalRisk.contribution
    },
    components: {
      wallet_age: finalWalletAge,
      activity: finalActivity,
      attestations: finalAttestations,
      network: finalNetwork,
      risk: finalRisk
    },
    insights,
    attestations: attestationScore.impacts,
    last_updated: input.lastUpdated ?? new Date().toISOString()
  };
}

export function baselineExplainableReputation(wallet: string, lastUpdated = new Date().toISOString()): ExplainableReputation {
  return buildExplainableReputation({
    wallet,
    canonicalScore: 0,
    canonicalBreakdown: null,
    walletAgeDays: 0,
    totalTransactions: 0,
    uniqueContractsInteracted: 0,
    transactionFrequency: 0,
    counterpartiesCount: 0,
    attestations: [],
    riskFlags: {},
    historicalActivityPattern: "new",
    repeatedInteractionRatio: 0,
    lastUpdated
  });
}
