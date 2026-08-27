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
  scoreModelVersion: string | null;
  scoreInputs: Record<string, unknown> | null;
  scoreBreakdown: Record<string, number> | null;
  scoreCalculatedAt: string | null;
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
  counterpartyAddresses: string[];
  contractInteractions: number;
  activeDays: number;
  recentActivityCount: number;
  explorerUrl: string | null;
  indexedAt: string;
  providerSource: string;
  errorMessage?: string | null;
  /* Phase 0 coverage metadata. All nullable: null = unknown (legacy rows
     written before the coverage-metadata migration). */
  rawResultCount?: number | null;
  historyCapped?: boolean | null;
  errorTransient?: boolean | null;
  recencyReliable?: boolean | null;
  /* C1a: per-counterparty stats captured during indexing. Write-path only
     until C1b; null/undefined = snapshot predates capture or the provider
     path exposes no per-row evidence (Arc analytics, error/empty scans). */
  counterpartyStats?: CounterpartyStat[] | null;
};

/* C1a per-counterparty interaction stats. One entry per address in the same
   row's counterparty_addresses; persisted as jsonb, never read before C1b. */
export type CounterpartyStat = {
  a: string;             // counterparty address (lowercase)
  tx: number;            // deduped tx count with the center wallet on this chain
  in: number;            // inbound rows (counterparty -> wallet); in + out === tx
  out: number;           // outbound rows (wallet -> counterparty)
  first: string | null;  // ISO timestamp bounds over rows with usable timestamps
  last: string | null;
  vin: string;           // native value sums in wei, decimal strings (BigInt-safe;
  vout: string;          //   token/NFT rows contribute 0 — no token valuation)
  capped: boolean;       // chain history window capped: every count is a floor
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

/* Interaction Graph is a separate, score-neutral view of persisted onchain
   counterparty snapshots. C1b: per-counterparty transaction counts, direction
   and first/last interaction are read from persisted counterparty stats and
   exposed as nullable node metrics — never inferred. Native value and asset
   details remain unsupported until their own approved release. */
export type InteractionGraphCoverageStatus = "not_indexed" | "indexing" | "complete" | "partial" | "unavailable";

export type InteractionGraphNodeChain = {
  chain: string;
  chainId: number;
  explorerUrl: string | null;
};

/* Merged across every chain where stats were captured. lowerBound reads
   totals as "at least" (a counted chain hit a history cap, or some
   contributing chains lack captured stats). basis reports how many
   contributing chains were counted / pending capture / aggregate-only. */
export type InteractionGraphNodeMetrics = {
  transactionCount: { total: number; in: number; out: number };
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  lowerBound: boolean;
  basis: { counted: number; pending: number; unavailable: number };
};

export type InteractionGraphNode = {
  walletAddress: string;
  username: string | null;
  profileUrl: string | null;
  registered: boolean;
  verifiedKyroPeer: boolean;
  chains: InteractionGraphNodeChain[];
  metrics: InteractionGraphNodeMetrics | null;
  /* C2: present only in ranked (sort=activity) responses — 1-based
     contiguous rank for measured nodes, null for metrics-null nodes that
     trail them. Observed activity only: never endorsement, trust, or a
     score input. Absent entirely in default enumeration responses. */
  rank?: number | null;
};

export type InteractionGraphCoverageChain = {
  chain: string;
  chainId: number;
  status: ChainStatus;
  counterpartyCount: number;
  indexedAt: string;
  source: string;
  historyCapped: boolean | null;
  recencyReliable: boolean | null;
  transientIssue: boolean;
  standingLimitation: boolean;
};

export type InteractionGraph = {
  walletAddress: string;
  nodes: InteractionGraphNode[];
  summary: {
    totalCounterparties: number;
    returnedCounterparties: number;
    kyroProfilesOnPage: number;
    verifiedKyroPeers: number;
    chainsWithCounterparties: number;
  };
  coverage: {
    status: InteractionGraphCoverageStatus;
    source: "persisted_snapshot";
    observedAt: string | null;
    stale: boolean;
    indexing: boolean;
    historyCapped: boolean;
    hasTransientIssues: boolean;
    hasStandingLimitations: boolean;
    chains: InteractionGraphCoverageChain[];
  };
  pagination: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  capabilities: {
    perCounterpartyTransactionCount: true;
    direction: true;
    firstInteractionAt: true;
    lastInteractionAt: true;
    value: false;
    assetDetails: false;
  };
  explanations: string[];
};

export type WalletActivitySnapshot = {
  id: string;
  walletAddress: string;
  txCount: number;
  volume: number;
  counterparties: number;
  counterpartyAddresses: string[];
  activeDays: number;
  recentActivityCount: number;
  walletAgeDays: number;
  activityFrequency: number;
  transferCount: number;
  evidenceVersion?: string | null;
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
  counterpartyAddresses: string[];
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
  /* Verified trust edges between this wallet's peers, both endpoints are peers.
     Optional because older snapshots and time-boxed summaries omit it. */
  peerEdges?: TrustEdge[];
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
  modelVersion: string;
};

export type ScoreExplanations = {
  globalWalletAge: string;
  crossChainActivity: string;
  counterpartyDiversity: string;
  arcActivity: string;
  indexedChainDepth: string;
  verifiedAttestations: string;
  propagatedTrust: string;
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
  attestationWeight?: number;
  repeatedPairRatio?: number;
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





