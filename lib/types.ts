export type RiskLevel = "High Risk" | "New / Unproven" | "Reliable" | "Trusted";

export type ActivityLevel = "Dormant" | "Low" | "Moderate" | "High";

export type Profile = {
  id: string;
  walletAddress: string;
  username: string | null;
  signature: string | null;
  verifiedWallet: boolean;
  arcScore: number;
  riskLevel: RiskLevel;
  riskFlags: string[];
  scoreTrend: number;
  activityLevel: ActivityLevel;
  txCount: number;
  firstSeen: string;
  lastSeen: string;
  createdAt: string;
  updatedAt: string;
  globalWalletAgeDays: number;
  arcWalletAgeDays: number;
  activeChainCount: number;
  credentialScore: number;
  credentialLevel: RiskLevel;
  indexedChains: string[];
};


export type ChainStatus = "indexed" | "not_configured" | "no_activity" | "limited" | "error";

export type ChainSnapshot = {
  chain: string;
  chainId: number;
  status: ChainStatus;
  txCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  walletAgeDays: number;
  nativeBalance: number;
  uniqueCounterparties: number;
  contractInteractions: number;
  activeDays: number;
  recentActivityCount: number;
  explorerUrl: string | null;
  indexedAt: string;
  providerSource: string;
  errorMessage?: string | null;
};

export type MultiChainWalletProfile = {
  walletAddress: string;
  globalFirstSeenAt: string | null;
  globalWalletAgeDays: number;
  totalTxCount: number;
  activeChains: string[];
  uniqueCounterparties: number;
  totalContractInteractions: number;
  chains: ChainSnapshot[];
};
export type WalletActivitySnapshot = {
  id: string;
  walletAddress: string;
  txCount: number;
  volume: number;
  counterparties: number;
  activeDays: number;
  recentActivityCount: number;
  walletAgeDays: number;
  activityFrequency: number;
  transferCount: number;
  contractInteractionCount: number;
  indexerSource: string;
  calculatedScore: number;
  latestBlock: number;
  nativeBalance: number;
  lastActivityAt: string | null;
  createdAt: string;
};

export type WalletAnalytics = {
  walletAddress: string;
  txCount: number;
  balance: number;
  latestBlock: number;
  firstSeenAt: string | null;
  lastActivityAt: string | null;
  activeDays: number;
  uniqueCounterparties: number;
  recentActivityCount: number;
  walletAgeDays: number;
  activityFrequency: number;
  transferCount: number;
  contractInteractionCount: number;
  indexerSource: string;
  activityScore: number;
  rpcAvailable: boolean;
};

export type InteractionType = "payment" | "service_payment" | "escrow_release" | "trade_settlement";

export type Attestation = {
  id: string;
  fromWallet: string;
  toWallet: string;
  type: InteractionType;
  weight: number;
  senderScoreAt: number;
  pairHistoryCount: number;
  txHash: string | null;
  txBlockNumber: number | null;
  txTimestamp: string | null;
  txValue: number;
  verifiedParticipants: string[];
  verifiedTransaction: boolean;
  chainId: string | null;
  createdAt: string;
  fromUsername?: string | null;
  toUsername?: string | null;
};

export type TrustEdge = {
  id: string;
  sourceWallet: string;
  targetWallet: string;
  peerWallet?: string;
  peerUsername?: string | null;
  peerArcScore?: number | null;
  peerCredentialLevel?: string | null;
  peerRiskLevel?: string | null;
  interactionCount: number;
  totalVerifiedVolume: number;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  interactionTypes: string[];
  trustWeight: number;
  reciprocal: boolean;
  sharedCounterpartyCount: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type TrustSnapshot = {
  walletAddress: string;
  trustedPeerCount: number;
  strongestConnectionWallet: string | null;
  strongestConnectionWeight: number;
  reciprocalCount: number;
  networkHealth: string;
  totalTrustWeight: number;
  propagatedTrustScore: number;
  trustConfidence: number;
  anomalyScore: number;
  maturityReason: string | null;
  topTrustedPeers: string[];
  createdAt: string | null;
  updatedAt: string | null;
};

export type TrustAnomaly = {
  id: string;
  walletAddress: string;
  anomalyType: string;
  severity: string;
  details: Record<string, unknown>;
  anomalyScore: number;
  anomalyReason: string | null;
  clusterSize: number | null;
  suspiciousWallets: string[];
  createdAt: string;
};

export type TrustGraph = {
  walletAddress: string;
  edges: TrustEdge[];
  snapshot: TrustSnapshot;
  anomalies: TrustAnomaly[];
  reciprocalPeers: TrustEdge[];
  strongestPeers: TrustEdge[];
  metrics: {
    trustedPeerCount: number;
    reciprocalCount: number;
    totalTrustWeight: number;
    strongestConnectionWeight: number;
    networkHealth: string;
    relationshipDiversity: number;
    networkMaturity: string;
    trustLevel: string;
    propagatedTrustScore: number;
    trustConfidence: number;
    anomalyScore: number;
    maturityReason: string;
    suspicious: boolean;
  };
  explanations: string[];
};

export type ReputationEvent = {
  id: string;
  walletAddress: string;
  eventType: string;
  scoreDelta: number;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ArcScore = {
  walletAddress: string;
  arcScore: number;
  riskLevel: RiskLevel;
  activityScore: number;
  longevityScore: number;
  counterpartyDiversityScore: number;
  balanceSignalScore: number;
  attestationScore: number;
  trustPropagationScore: number;
  consistencyScore: number;
  riskPenalty: number;
  lastSyncedAt: string;
};

export type ScoreExplanations = {
  globalWalletAge: string;
  crossChainActivity: string;
  counterpartyDiversity: string;
  arcActivity: string;
  indexedChainDepth: string;
  verifiedAttestations: string;
  riskPenalty: string;
};

export type RefreshStatus = "started" | "indexing_chains" | "recomputing_score" | "committed" | "failed";

export type WalletRefreshJob = {
  id: string;
  walletAddress: string;
  status: RefreshStatus;
  startedAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  chainsTotal: number;
  chainsCompleted: number;
  indexedCount: number;
  limitedCount: number;
  noActivityCount: number;
  errorCount: number;
  refreshVersion: string | null;
  createdAt: string;
};

export type IdentityRecord = {
  profile: Profile;
  profileUrl?: string;
  score: ArcScore;
  snapshot: WalletActivitySnapshot | null;
  acceptedAttestations: number;
  uniqueCounterparties: number;
  attestations?: Attestation[];
  reputationEvents?: ReputationEvent[];
  trustConnections?: { profile: Profile; attestations: Attestation[] }[];
  trustGraph?: TrustGraph | null;
  multiChain?: MultiChainWalletProfile | null;
  explanations?: ScoreExplanations;
  refreshJob?: WalletRefreshJob | null;
};

export type Activity = {
  id: string;
  type: string;
  description: string;
  scoreImpact: number;
  createdAt: string;
};





