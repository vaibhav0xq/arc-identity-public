import type { ArcScore, Attestation, ChainSnapshot, IdentityRecord, InteractionType, MultiChainWalletProfile, Profile, ReputationEvent, WalletActivitySnapshot, WalletRefreshJob, RefreshStatus } from "@/lib/types";
import { getCanonicalWalletSnapshot } from "@/lib/canonical-snapshot";
import { normalizeChainStatus } from "@/lib/chain-status";
import { getArcLiveWalletData, getWalletAnalytics, scoreTransactionSize, verifyArcTransaction } from "@/lib/onchain";
import { getMultiChainWalletProfile } from "@/lib/multichain";
import { arcScoreFromInput, buildArcScore, getRiskLevel } from "@/lib/score";
import { ARC_SCORE_MODEL_VERSION, scoreInputFromUnknown } from "@/lib/score-contract";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getTrustGraph, upsertTrustEdgeFromAttestation } from "@/lib/trust-graph";
import { maybeArcUsername, profileRouteFor, toArcUsername } from "@/lib/username";
import { verifyWalletSignature } from "@/lib/signature";

const rateLimitMs = 24 * 60 * 60 * 1000;
const allowedInteractionTypes = new Set<InteractionType>(["payment", "service_payment", "escrow_release", "trade_settlement"]);
const initialArcScore = 0;

export type UserSort = "score" | "activity" | "newest" | "risk";
export const DIRECTORY_DEFAULT_SORT: UserSort = "score";
export const DIRECTORY_DEFAULT_LIMIT = 250;
export const DIRECTORY_MAX_LIMIT = 250;
const DIRECTORY_HIDDEN_USERNAME_PREFIXES = [
  "test_",
  "wallet_",
  "launch_",
  "attest_",
  "attlive_",
  "directory_",
  "qauser_",
  "fresh_",
  "debug_",
  "demo_",
  "autotest_"
];

export const DIRECTORY_PUBLIC_HIDDEN_USERNAME_PREFIXES = [...DIRECTORY_HIDDEN_USERNAME_PREFIXES];

export function normalizeDirectorySort(value?: string | null): UserSort {
  return value === "activity" || value === "newest" || value === "risk" ? value : DIRECTORY_DEFAULT_SORT;
}

export function normalizeDirectoryLimit(value?: string | number | null) {
  const numeric = typeof value === "number" ? value : Number(value ?? DIRECTORY_DEFAULT_LIMIT);
  return Math.max(1, Math.min(Number.isFinite(numeric) ? numeric : DIRECTORY_DEFAULT_LIMIT, DIRECTORY_MAX_LIMIT));
}

export function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function parseRiskFlags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}
function parseRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

function profileFromRow(row: any): Profile {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    username: row.username,
    signature: row.signature ?? null,
    verifiedWallet: Boolean(row.verified_wallet),
    arcScore: Number(row.arc_score ?? 0),
    riskLevel: row.risk_level ?? "New / Unproven",
    riskFlags: parseRiskFlags(row.risk_flags),
    scoreTrend: Number(row.score_trend ?? 0),
    activityLevel: row.activity_level ?? "Dormant",
    txCount: Number(row.tx_count ?? 0),
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    globalWalletAgeDays: Number(row.global_wallet_age_days ?? 0),
    arcWalletAgeDays: Number(row.arc_wallet_age_days ?? 0),
    activeChainCount: Number(row.active_chain_count ?? 0),
    credentialScore: Number(row.credential_score ?? row.arc_score ?? 0),
    credentialLevel: row.credential_level ?? row.risk_level ?? "New / Unproven",
    indexedChains: Array.isArray(row.indexed_chains) ? row.indexed_chains : [],
    scoreModelVersion: row.score_model_version ?? null,
    scoreInputs: parseRecord(row.score_inputs),
    scoreBreakdown: parseRecord(row.score_breakdown) as Record<string, number> | null,
    scoreCalculatedAt: row.score_calculated_at ?? null
  };
}

function snapshotFromRow(row: any): WalletActivitySnapshot {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    txCount: Number(row.tx_count ?? 0),
    volume: Number(row.volume ?? 0),
    counterparties: Number(row.counterparties ?? 0),
    counterpartyAddresses: parseRiskFlags(row.counterparty_addresses).map(normalizeWallet),
    activeDays: Number(row.active_days ?? 0),
    recentActivityCount: Number(row.recent_activity_count ?? 0),
    walletAgeDays: Number(row.wallet_age_days ?? 0),
    activityFrequency: Number(row.activity_frequency ?? 0),
    transferCount: Number(row.transfer_count ?? 0),
    contractInteractionCount: Number(row.contract_interaction_count ?? 0),
    indexerSource: row.indexer_source ?? "unknown",
    evidenceVersion: row.evidence_version ?? null,
    calculatedScore: Number(row.calculated_score ?? 0),
    latestBlock: Number(row.latest_block ?? 0),
    nativeBalance: Number(row.native_balance ?? 0),
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at
  };
}

function attestationFromRow(row: any, profiles = new Map<string, Profile>()): Attestation {
  const participants = Array.isArray(row.verified_participants) ? row.verified_participants : [];
  return {
    id: row.id,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    type: allowedInteractionTypes.has(row.type) ? row.type : "payment",
    weight: Number(row.weight ?? 0),
    senderScoreAt: Number(row.sender_score_at ?? 0),
    pairHistoryCount: Number(row.pair_history_count ?? 0),
    txHash: row.tx_hash ?? null,
    txBlockNumber: row.tx_block_number ? Number(row.tx_block_number) : null,
    txTimestamp: row.tx_timestamp ?? null,
    txValue: Number(row.tx_value ?? 0),
    verifiedParticipants: participants.filter((item: unknown) => typeof item === "string"),
    verifiedTransaction: Boolean(row.verified_transaction),
    chainId: row.chain_id ?? null,
    createdAt: row.created_at,
    fromUsername: profiles.get(normalizeWallet(row.from_wallet))?.username,
    toUsername: profiles.get(normalizeWallet(row.to_wallet))?.username
  };
}

function inferredChainProviderSource(row: any, normalizedStatus?: string) {
  const stored = typeof row.provider_source === "string" ? row.provider_source.trim() : "";
  if (stored && stored !== "unknown") return stored;

  const chainName = String(row.chain_name ?? "");
  if (normalizedStatus === "limited") return "limited_provider_required";
  if (chainName === "Base") return "blockscout_base";
  if (chainName === "Arc Testnet") return "arcscan";
  if (["Ethereum Mainnet", "Arbitrum", "Polygon", "BNB Chain"].includes(chainName)) return "etherscan_v2";
  return "unknown";
}

function dbErrorMessage(error: any) {
  return String(error?.message ?? error?.details ?? error?.hint ?? error?.code ?? "Database error");
}

function isUniqueViolation(error: any) {
  const message = dbErrorMessage(error);
  return error?.code === "23505" || /duplicate|unique/i.test(message);
}
function chainSnapshotFromRow(row: any): ChainSnapshot {
  const txCount = Number(row.tx_count ?? 0);
  const normalizedStatus = normalizeChainStatus({
    status: row.status,
    txCount,
    errorMessage: row.error_message,
    providerSource: row.provider_source,
    chainName: row.chain_name
  });
  const providerSource = inferredChainProviderSource(row, normalizedStatus);
  return {
    chain: row.chain_name,
    chainId: Number(row.chain_id ?? 0),
    status: normalizedStatus,
    txCount,
    firstSeenAt: row.first_seen_at ?? null,
    lastSeenAt: row.last_seen_at ?? null,
    walletAgeDays: Number(row.wallet_age_days ?? 0),
    nativeBalance: Number(row.native_balance ?? 0),
    uniqueCounterparties: Number(row.unique_counterparties ?? 0),
    counterpartyAddresses: parseRiskFlags(row.counterparty_addresses).map(normalizeWallet),
    contractInteractions: Number(row.contract_interaction_count ?? 0),
    activeDays: Number(row.active_days ?? 0),
    recentActivityCount: Number(row.recent_activity_count ?? 0),
    explorerUrl: row.explorer_url ?? null,
    indexedAt: row.indexed_at ?? row.created_at ?? new Date().toISOString(),
    providerSource,
    errorMessage: row.error_message ?? (normalizedStatus === "limited" ? "Provider access required" : null)
  };
}

type VerifiedArcActivity = {
  txCount: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  walletAgeDays: number;
  activeDays: number;
  counterparties: number;
  recentActivityCount: number;
  counterpartyAddresses: string[];
  latestBlock: number;
};

function aggregateMultiChainFromChains(walletAddress: string, chains: ChainSnapshot[], fallback?: Partial<MultiChainWalletProfile>): MultiChainWalletProfile {
  const wallet = normalizeWallet(walletAddress);
  const active = chains.filter((chain) => chain.status === "indexed" && chain.txCount > 0);
  const firstSeenTimes = active.map((chain) => chain.firstSeenAt ? new Date(chain.firstSeenAt).getTime() : 0).filter((time) => Number.isFinite(time) && time > 0);
  const latestSeenTimes = active.map((chain) => chain.lastSeenAt ? new Date(chain.lastSeenAt).getTime() : 0).filter((time) => Number.isFinite(time) && time > 0);
  const globalFirstSeenAt = firstSeenTimes.length
    ? new Date(Math.min(...firstSeenTimes)).toISOString()
    : fallback?.globalFirstSeenAt ?? null;
  const derivedAge = globalFirstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(globalFirstSeenAt).getTime()) / 86400000)) : 0;
  const globalWalletAgeDays = Math.max(
    derivedAge,
    active.reduce((max, chain) => Math.max(max, chain.walletAgeDays), 0),
    Number(fallback?.globalWalletAgeDays ?? 0)
  );
  const totalTxCount = active.reduce((sum, chain) => sum + chain.txCount, 0);
  const activeChains = active.map((chain) => chain.chain);
  const profile: MultiChainWalletProfile = {
    walletAddress: wallet,
    globalFirstSeenAt,
    globalWalletAgeDays,
    totalTxCount: totalTxCount || Number(fallback?.totalTxCount ?? 0),
    activeChains: activeChains.length ? activeChains : fallback?.activeChains ?? [],
    uniqueCounterparties: (() => {
      const addresses = new Set(active.flatMap((chain) => chain.counterpartyAddresses ?? []).map(normalizeWallet).filter(Boolean));
      const legacyCount = active
        .filter((chain) => (chain.counterpartyAddresses?.length ?? 0) === 0)
        .reduce((max, chain) => Math.max(max, chain.uniqueCounterparties), 0);
      return Math.max(addresses.size, legacyCount, Number(fallback?.uniqueCounterparties ?? 0));
    })(),
    totalContractInteractions: active.reduce((sum, chain) => sum + chain.contractInteractions, 0) || Number(fallback?.totalContractInteractions ?? 0),
    chains
  };

  console.log("[arc-identity] intelligence_aggregation_input_chains", {
    wallet,
    chains: chains.map((chain) => ({ chain: chain.chain, status: chain.status, txCount: chain.txCount, walletAgeDays: chain.walletAgeDays, firstSeenAt: chain.firstSeenAt, lastSeenAt: chain.lastSeenAt }))
  });
  console.log("[arc-identity] intelligence_aggregation_output_summary", {
    wallet,
    globalWalletAgeDays: profile.globalWalletAgeDays,
    totalTxCount: profile.totalTxCount,
    activeChains: profile.activeChains,
    latestActivityAt: latestSeenTimes.length ? new Date(Math.max(...latestSeenTimes)).toISOString() : null
  });
  if (active.some((chain) => chain.walletAgeDays > 0) && profile.globalWalletAgeDays <= 0) {
    console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "chain_age_without_global_age" });
  }
  if (active.reduce((sum, chain) => sum + chain.txCount, 0) > 0 && profile.totalTxCount <= 0) {
    console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "chain_tx_without_total_tx" });
  }
  if (active.length > 0 && profile.activeChains.length <= 0) {
    console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "indexed_chains_without_active_chains" });
  }
  return profile;
}

function finiteNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function maxMetric(...values: unknown[]) {
  return Math.max(0, ...values.map((value) => finiteNumber(value)).filter((value) => Number.isFinite(value)));
}

function isVersionedArcSnapshot(snapshot?: WalletActivitySnapshot | null) {
  return snapshot?.evidenceVersion === ARC_SCORE_MODEL_VERSION
    || snapshot?.indexerSource.startsWith(`${ARC_SCORE_MODEL_VERSION}:`) === true;
}

function hasIndexedEvidence(chain?: ChainSnapshot | null) {
  return Boolean(chain && chain.status === "indexed" && chain.txCount > 0);
}

function stableChainSnapshot(fresh: ChainSnapshot, cached?: ChainSnapshot): ChainSnapshot {
  if (!cached || !hasIndexedEvidence(cached)) return fresh;
  if (hasIndexedEvidence(fresh)) {
    return {
      ...fresh,
      txCount: maxMetric(fresh.txCount, cached.txCount),
      firstSeenAt: earliestDate(fresh.firstSeenAt, cached.firstSeenAt),
      lastSeenAt: latestDate(fresh.lastSeenAt, cached.lastSeenAt),
      walletAgeDays: maxMetric(fresh.walletAgeDays, cached.walletAgeDays),
      nativeBalance: Number.isFinite(fresh.nativeBalance) ? fresh.nativeBalance : cached.nativeBalance,
      uniqueCounterparties: maxMetric(fresh.uniqueCounterparties, cached.uniqueCounterparties),
      counterpartyAddresses: Array.from(new Set([...(fresh.counterpartyAddresses ?? []), ...(cached.counterpartyAddresses ?? [])].map(normalizeWallet).filter(Boolean))),
      contractInteractions: maxMetric(fresh.contractInteractions, cached.contractInteractions),
      activeDays: maxMetric(fresh.activeDays, cached.activeDays),
      recentActivityCount: fresh.recentActivityCount,
      explorerUrl: fresh.explorerUrl ?? cached.explorerUrl,
      providerSource: fresh.providerSource && fresh.providerSource !== "unknown" ? fresh.providerSource : cached.providerSource,
      errorMessage: fresh.errorMessage ?? null
    };
  }

  return {
    ...cached,
    indexedAt: fresh.indexedAt || cached.indexedAt,
    nativeBalance: Number.isFinite(fresh.nativeBalance) && fresh.nativeBalance > 0 ? fresh.nativeBalance : cached.nativeBalance,
    providerSource: cached.providerSource && cached.providerSource !== "unknown" ? cached.providerSource : fresh.providerSource,
    errorMessage: fresh.status === "limited" ? fresh.errorMessage ?? "Provider access required" : cached.errorMessage
  };
}

function profileIndexedFirstSeen(profile: Profile) {
  return profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION && profile.globalWalletAgeDays > 0 ? profile.firstSeen : null;
}

function versionedProfileScoreInput(profile: Profile) {
  return profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
    ? scoreInputFromUnknown(profile.scoreInputs)
    : null;
}

function profileWalletAgeFloor(profile: Profile) {
  return versionedProfileScoreInput(profile)?.walletAgeDays ?? 0;
}

function profileTransactionFloor(profile: Profile) {
  return versionedProfileScoreInput(profile)?.indexedTx ?? 0;
}

function profileActiveChainFloor(profile: Profile) {
  return versionedProfileScoreInput(profile) ? profile.indexedChains : [];
}

function buildStableMultiChainProfile(profile: Profile, fresh: MultiChainWalletProfile, cached: MultiChainWalletProfile | null): MultiChainWalletProfile {
  const profileFirstSeen = profileIndexedFirstSeen(profile);
  const profileAgeFloor = profileWalletAgeFloor(profile);
  const profileTxFloor = profileTransactionFloor(profile);
  const profileChainFloor = profileActiveChainFloor(profile);
  if (!cached) {
    return aggregateMultiChainFromChains(profile.walletAddress, fresh.chains, {
      ...fresh,
      globalFirstSeenAt: earliestDate(fresh.globalFirstSeenAt, profileFirstSeen),
      globalWalletAgeDays: maxMetric(fresh.globalWalletAgeDays, profileAgeFloor),
      totalTxCount: maxMetric(fresh.totalTxCount, profileTxFloor),
      activeChains: Array.from(new Set([...(fresh.activeChains ?? []), ...profileChainFloor])),
      uniqueCounterparties: fresh.uniqueCounterparties,
      totalContractInteractions: fresh.totalContractInteractions
    });
  }

  const cachedByChain = new Map(cached.chains.map((chain) => [chain.chain, chain]));
  const freshByChain = new Map(fresh.chains.map((chain) => [chain.chain, chain]));
  const chainNames = Array.from(new Set([...Array.from(freshByChain.keys()), ...Array.from(cachedByChain.keys())]));
  const chains = chainNames.map((chainName) => {
    const freshChain = freshByChain.get(chainName);
    const cachedChain = cachedByChain.get(chainName);
    return freshChain ? stableChainSnapshot(freshChain, cachedChain) : cachedChain!;
  });
  const activeChains = Array.from(new Set([
    ...(fresh.activeChains ?? []),
    ...(cached.activeChains ?? []),
    ...profileChainFloor,
    ...chains.filter((chain) => chain.status === "indexed" && chain.txCount > 0).map((chain) => chain.chain)
  ]));

  return aggregateMultiChainFromChains(profile.walletAddress, chains, {
    globalFirstSeenAt: earliestDate(earliestDate(fresh.globalFirstSeenAt, cached.globalFirstSeenAt), profileFirstSeen),
    globalWalletAgeDays: maxMetric(fresh.globalWalletAgeDays, cached.globalWalletAgeDays, profileAgeFloor),
    totalTxCount: maxMetric(fresh.totalTxCount, cached.totalTxCount, profileTxFloor),
    activeChains,
    uniqueCounterparties: maxMetric(fresh.uniqueCounterparties, cached.uniqueCounterparties),
    totalContractInteractions: maxMetric(fresh.totalContractInteractions, cached.totalContractInteractions)
  });
}

function stableArcSnapshot(
  walletAddress: string,
  analytics: any,
  cachedSnapshot: WalletActivitySnapshot | null,
  multiChain: MultiChainWalletProfile,
  now: string
): WalletActivitySnapshot {
  const arcChain = multiChain.chains.find((chain) => chain.chain === "Arc Testnet") ?? null;
  const trustedCachedSnapshot = isVersionedArcSnapshot(cachedSnapshot) ? cachedSnapshot : null;
  const txCount = maxMetric(analytics.txCount, trustedCachedSnapshot?.txCount, arcChain?.txCount);
  const walletAgeDays = maxMetric(analytics.walletAgeDays, trustedCachedSnapshot?.walletAgeDays, arcChain?.walletAgeDays);
  const counterpartyAddresses = Array.from(new Set([...(analytics.counterpartyAddresses ?? []), ...(trustedCachedSnapshot?.counterpartyAddresses ?? []), ...(arcChain?.counterpartyAddresses ?? [])].map(normalizeWallet).filter(Boolean)));
  const counterparties = maxMetric(counterpartyAddresses.length, analytics.uniqueCounterparties, trustedCachedSnapshot?.counterparties, arcChain?.uniqueCounterparties);
  const activeDays = maxMetric(analytics.activeDays, trustedCachedSnapshot?.activeDays, arcChain?.activeDays);
  const recentActivityCount = maxMetric(analytics.recentActivityCount, arcChain?.recentActivityCount);
  const transferCount = maxMetric(analytics.transferCount, trustedCachedSnapshot?.transferCount, arcChain?.txCount);
  const contractInteractionCount = maxMetric(analytics.contractInteractionCount, trustedCachedSnapshot?.contractInteractionCount, arcChain?.contractInteractions);
  const source = analytics.indexerSource && analytics.indexerSource !== "unknown"
    ? analytics.indexerSource
    : arcChain?.providerSource ?? trustedCachedSnapshot?.indexerSource ?? "arcscan";

  return {
    id: "pending",
    walletAddress: normalizeWallet(walletAddress),
    txCount,
    volume: finiteNumber(analytics.balance, trustedCachedSnapshot?.volume ?? 0),
    counterparties,
    counterpartyAddresses,
    activeDays,
    recentActivityCount,
    walletAgeDays,
    activityFrequency: walletAgeDays > 0 ? txCount / walletAgeDays : finiteNumber(analytics.activityFrequency, trustedCachedSnapshot?.activityFrequency ?? 0),
    transferCount,
    contractInteractionCount,
    indexerSource: `${ARC_SCORE_MODEL_VERSION}:${source}`,
    evidenceVersion: ARC_SCORE_MODEL_VERSION,
    calculatedScore: maxMetric(analytics.activityScore, trustedCachedSnapshot?.calculatedScore, txCount > 0 ? 20 : 0),
    latestBlock: maxMetric(analytics.latestBlock, trustedCachedSnapshot?.latestBlock),
    nativeBalance: analytics.rpcAvailable ? finiteNumber(analytics.balance) : finiteNumber(trustedCachedSnapshot?.nativeBalance, arcChain?.nativeBalance ?? 0),
    lastActivityAt: latestDate(latestDate(analytics.lastActivityAt ?? null, trustedCachedSnapshot?.lastActivityAt ?? null), arcChain?.lastSeenAt ?? null),
    createdAt: now
  };
}
function mergeArcSnapshotIntoMultiChain(
  multiChain: MultiChainWalletProfile,
  snapshot: WalletActivitySnapshot
): MultiChainWalletProfile {
  const existing = multiChain.chains.find((chain) => chain.chain === "Arc Testnet") ?? null;
  const counterpartyAddresses = Array.from(new Set([
    ...(existing?.counterpartyAddresses ?? []),
    ...snapshot.counterpartyAddresses
  ].map(normalizeWallet).filter(Boolean)));
  const arcChain: ChainSnapshot = {
    chain: "Arc Testnet",
    chainId: existing?.chainId ?? Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 0),
    status: snapshot.txCount > 0 ? "indexed" : existing?.status ?? "no_activity",
    txCount: Math.max(existing?.txCount ?? 0, snapshot.txCount),
    firstSeenAt: existing?.firstSeenAt ?? null,
    lastSeenAt: latestDate(existing?.lastSeenAt ?? null, snapshot.lastActivityAt),
    walletAgeDays: Math.max(existing?.walletAgeDays ?? 0, snapshot.walletAgeDays),
    nativeBalance: snapshot.nativeBalance,
    uniqueCounterparties: Math.max(existing?.uniqueCounterparties ?? 0, snapshot.counterparties, counterpartyAddresses.length),
    counterpartyAddresses,
    contractInteractions: Math.max(existing?.contractInteractions ?? 0, snapshot.contractInteractionCount),
    activeDays: Math.max(existing?.activeDays ?? 0, snapshot.activeDays),
    recentActivityCount: snapshot.recentActivityCount,
    explorerUrl: existing?.explorerUrl ?? (process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ? `${process.env.NEXT_PUBLIC_ARC_EXPLORER_URL.replace(/\/$/, "")}/address/${snapshot.walletAddress}` : null),
    indexedAt: snapshot.createdAt,
    providerSource: snapshot.indexerSource || existing?.providerSource || "arcscan",
    errorMessage: snapshot.txCount > 0 ? null : existing?.errorMessage ?? null
  };
  const chains = existing
    ? multiChain.chains.map((chain) => chain.chain === "Arc Testnet" ? arcChain : chain)
    : [...multiChain.chains, arcChain];
  return aggregateMultiChainFromChains(multiChain.walletAddress, chains, multiChain);
}
function canonicalArcSnapshotForScore(
  walletAddress: string,
  snapshot: WalletActivitySnapshot | null,
  multiChain: MultiChainWalletProfile | null
): WalletActivitySnapshot | null {
  if (isVersionedArcSnapshot(snapshot)) return snapshot;
  const arcChain = multiChain?.chains.find((chain) => chain.chain === "Arc Testnet") ?? null;
  if (!arcChain) {
    if ((snapshot?.txCount ?? 0) > 0) {
      console.warn("[arc-identity] legacy_arc_snapshot_excluded", {
        wallet: normalizeWallet(walletAddress),
        legacyTxCount: snapshot?.txCount,
        reason: "no_canonical_arc_chain"
      });
    }
    return null;
  }

  const txCount = arcChain.status === "indexed" ? Math.max(0, arcChain.txCount) : 0;
  if (snapshot && snapshot.txCount !== txCount) {
    console.warn("[arc-identity] legacy_arc_snapshot_reconciled", {
      wallet: normalizeWallet(walletAddress),
      legacyTxCount: snapshot.txCount,
      canonicalArcTxCount: txCount,
      providerSource: arcChain.providerSource
    });
  }

  return {
    id: snapshot?.id ?? `canonical-arc-${normalizeWallet(walletAddress)}`,
    walletAddress: normalizeWallet(walletAddress),
    txCount,
    volume: arcChain.nativeBalance,
    counterparties: txCount > 0 ? arcChain.uniqueCounterparties : 0,
    counterpartyAddresses: txCount > 0 ? arcChain.counterpartyAddresses : [],
    activeDays: txCount > 0 ? arcChain.activeDays : 0,
    recentActivityCount: txCount > 0 ? arcChain.recentActivityCount : 0,
    walletAgeDays: txCount > 0 ? arcChain.walletAgeDays : 0,
    activityFrequency: txCount > 0 && arcChain.walletAgeDays > 0 ? txCount / arcChain.walletAgeDays : 0,
    transferCount: txCount,
    contractInteractionCount: txCount > 0 ? arcChain.contractInteractions : 0,
    indexerSource: `${ARC_SCORE_MODEL_VERSION}:canonical_chain:${arcChain.providerSource}`,
    evidenceVersion: ARC_SCORE_MODEL_VERSION,
    calculatedScore: 0,
    latestBlock: 0,
    nativeBalance: arcChain.nativeBalance,
    lastActivityAt: txCount > 0 ? arcChain.lastSeenAt : null,
    createdAt: arcChain.indexedAt
  };
}
function parseAttestationTimestamp(row: any) {
  const value = row.tx_timestamp;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function getVerifiedArcAttestationActivity(walletAddress: string): Promise<VerifiedArcActivity> {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  console.log("[arc-identity] arc_verified_attestation_merge_started", { wallet });
  const { data, error } = await supabase
    .from("attestations")
    .select("tx_hash,tx_timestamp,created_at,from_wallet,to_wallet,tx_block_number,verified_transaction")
    .or(`from_wallet.eq.${wallet},to_wallet.eq.${wallet}`)
    .eq("verified_transaction", true)
    .not("tx_hash", "is", null);
  if (error) {
    console.warn("[arc-identity] arc_verified_attestation_count", { wallet, count: 0, error: error.message });
    return { txCount: 0, firstSeenAt: null, lastSeenAt: null, walletAgeDays: 0, activeDays: 0, counterparties: 0, counterpartyAddresses: [], recentActivityCount: 0, latestBlock: 0 };
  }

  const hashes = new Set<string>();
  const counterparties = new Set<string>();
  const activeDays = new Set<string>();
  const timestamps: number[] = [];
  const recentCutoff = Date.now() - 30 * 86400000;
  let recentActivityCount = 0;
  let latestBlock = 0;

  for (const row of data ?? []) {
    const hash = String(row.tx_hash ?? "").toLowerCase();
    if (!hash || hashes.has(hash)) continue;
    hashes.add(hash);
    const from = normalizeWallet(row.from_wallet ?? "");
    const to = normalizeWallet(row.to_wallet ?? "");
    const counterparty = from === wallet ? to : from;
    if (counterparty && counterparty !== wallet) counterparties.add(counterparty);
    const timestamp = parseAttestationTimestamp(row);
    if (timestamp) {
      const time = new Date(timestamp).getTime();
      timestamps.push(time);
      activeDays.add(timestamp.slice(0, 10));
      if (time >= recentCutoff) recentActivityCount += 1;
    }
    latestBlock = Math.max(latestBlock, Number(row.tx_block_number ?? 0));
  }

  timestamps.sort((a, b) => a - b);
  const firstSeenAt = timestamps[0] ? new Date(timestamps[0]).toISOString() : null;
  const lastSeenAt = timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
  const walletAgeDays = firstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000)) : 0;
  const activity = {
    txCount: hashes.size,
    firstSeenAt,
    lastSeenAt,
    walletAgeDays,
    activeDays: activeDays.size,
    counterparties: counterparties.size,
    recentActivityCount,
    counterpartyAddresses: Array.from(counterparties),
    latestBlock
  };
  console.log("[arc-identity] arc_verified_attestation_count", { wallet, count: activity.txCount, counterparties: activity.counterparties, activeDays: activity.activeDays });
  return activity;
}

function mergeArcActivityIntoChain(chain: ChainSnapshot, activity: VerifiedArcActivity): ChainSnapshot {
  if (chain.chain !== "Arc Testnet" || activity.txCount === 0) return chain;
  const merged: ChainSnapshot = {
    ...chain,
    status: "indexed",
    txCount: Math.max(chain.txCount, activity.txCount),
    firstSeenAt: earliestDate(chain.firstSeenAt, activity.firstSeenAt),
    lastSeenAt: latestDate(chain.lastSeenAt, activity.lastSeenAt),
    walletAgeDays: Math.max(chain.walletAgeDays, activity.walletAgeDays),
    uniqueCounterparties: Math.max(chain.uniqueCounterparties, activity.counterparties),
    contractInteractions: Math.max(chain.contractInteractions, activity.txCount),
    counterpartyAddresses: Array.from(new Set([...(chain.counterpartyAddresses ?? []), ...activity.counterpartyAddresses].map(normalizeWallet).filter(Boolean))),
    activeDays: Math.max(chain.activeDays, activity.activeDays),
    recentActivityCount: Math.max(chain.recentActivityCount, activity.recentActivityCount),
    providerSource: chain.providerSource === "arcscan" ? "arcscan_verified_attestations" : chain.providerSource,
    errorMessage: null
  };
  console.log("[arc-identity] arc_chain_coverage_final_status", { status: merged.status, txCount: merged.txCount, activeDays: merged.activeDays, counterparties: merged.uniqueCounterparties });
  return merged;
}

function earliestDate(a: string | null, b: string | null) {
  const times = [a, b].map((value) => value ? new Date(value).getTime() : 0).filter(Boolean);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function latestDate(a: string | null, b: string | null) {
  const times = [a, b].map((value) => value ? new Date(value).getTime() : 0).filter(Boolean);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function mergeArcActivityIntoSnapshot(walletAddress: string, snapshot: WalletActivitySnapshot | null): Promise<WalletActivitySnapshot | null> {
  const activity = await getVerifiedArcAttestationActivity(walletAddress);
  if (activity.txCount === 0) return snapshot;
  const now = new Date().toISOString();
  return {
    id: snapshot?.id ?? "verified-arc-attestations",
    walletAddress: normalizeWallet(walletAddress),
    txCount: Math.max(snapshot?.txCount ?? 0, activity.txCount),
    volume: snapshot?.volume ?? 0,
    counterparties: Math.max(snapshot?.counterparties ?? 0, activity.counterparties),
    activeDays: Math.max(snapshot?.activeDays ?? 0, activity.activeDays),
    counterpartyAddresses: Array.from(new Set([...(snapshot?.counterpartyAddresses ?? []), ...activity.counterpartyAddresses].map(normalizeWallet).filter(Boolean))),
    recentActivityCount: Math.max(snapshot?.recentActivityCount ?? 0, activity.recentActivityCount),
    walletAgeDays: Math.max(snapshot?.walletAgeDays ?? 0, activity.walletAgeDays),
    activityFrequency: snapshot?.activityFrequency ?? (activity.walletAgeDays > 0 ? activity.txCount / activity.walletAgeDays : 0),
    transferCount: Math.max(snapshot?.transferCount ?? 0, activity.txCount),
    contractInteractionCount: Math.max(snapshot?.contractInteractionCount ?? 0, activity.txCount),
    indexerSource: snapshot?.indexerSource === "arcscan" ? "arcscan_verified_attestations" : snapshot?.indexerSource ?? "arcscan_verified_attestations",
    calculatedScore: Math.max(snapshot?.calculatedScore ?? 0, activity.txCount > 0 ? 20 : 0),
    latestBlock: Math.max(snapshot?.latestBlock ?? 0, activity.latestBlock),
    nativeBalance: snapshot?.nativeBalance ?? 0,
    lastActivityAt: latestDate(snapshot?.lastActivityAt ?? null, activity.lastSeenAt),
    createdAt: snapshot?.createdAt ?? now
  };
}

function chainSnapshotInsertRows(profile: MultiChainWalletProfile, now: string, includeProviderColumns: boolean) {
  return profile.chains.map((chain) => ({
    wallet_address: profile.walletAddress,
    chain_name: chain.chain,
    chain_id: chain.chainId,
    status: chain.status,
    tx_count: chain.txCount,
    first_seen_at: chain.firstSeenAt,
    last_seen_at: chain.lastSeenAt,
    wallet_age_days: chain.walletAgeDays,
    native_balance: chain.nativeBalance,
    unique_counterparties: chain.uniqueCounterparties,
    contract_interaction_count: chain.contractInteractions,
    active_days: chain.activeDays,
    recent_activity_count: chain.recentActivityCount,
    explorer_url: chain.explorerUrl,
    indexed_at: now,
    ...(includeProviderColumns ? { counterparty_addresses: chain.counterpartyAddresses, provider_source: chain.providerSource, error_message: chain.errorMessage ?? null } : {})
  }));
}

async function persistGlobalProfile(profile: MultiChainWalletProfile, now: string) {
  const supabase = getSupabaseAdmin();
  await supabase.from("wallet_global_profiles").upsert({
    wallet_address: profile.walletAddress,
    global_first_seen_at: profile.globalFirstSeenAt,
    global_wallet_age_days: profile.globalWalletAgeDays,
    total_tx_count: profile.totalTxCount,
    active_chain_count: profile.activeChains.length,
    active_chains: profile.activeChains,
    total_unique_counterparties: profile.uniqueCounterparties,
    total_contract_interactions: profile.totalContractInteractions,
    updated_at: now
  }, { onConflict: "wallet_address" });
}

async function persistMultiChainProfile(profile: MultiChainWalletProfile, now = new Date().toISOString()) {
  const supabase = getSupabaseAdmin();
  try {
    const { error } = await supabase.from("wallet_chain_snapshots").insert(chainSnapshotInsertRows(profile, now, true));
    if (error) throw error;
    await persistGlobalProfile(profile, now);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    console.warn("[arc-identity] multichain provider columns unavailable; persisting legacy chain snapshot shape", { wallet: profile.walletAddress });
    const fallback = await supabase.from("wallet_chain_snapshots").insert(chainSnapshotInsertRows(profile, now, false));
    if (fallback.error) throw fallback.error;
    await persistGlobalProfile(profile, now);
  }
}

async function getCachedMultiChainProfile(walletAddress: string, committedAt?: string | null): Promise<MultiChainWalletProfile | null> {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  try {
    let chainQuery = supabase.from("wallet_chain_snapshots").select("*").eq("wallet_address", wallet);
    if (committedAt) chainQuery = chainQuery.lte("indexed_at", committedAt);
    const { data: chainRows, error: chainError } = await chainQuery
      .order("indexed_at", { ascending: false }).limit(60);
    if (chainError) throw chainError;
    const latestByChain = new Map<string, any>();
    for (const row of chainRows ?? []) {
      if (!latestByChain.has(row.chain_name)) latestByChain.set(row.chain_name, row);
    }
    const arcActivity = await getVerifiedArcAttestationActivity(wallet);
    const chains = Array.from(latestByChain.values()).map((row) => mergeArcActivityIntoChain(chainSnapshotFromRow(row), arcActivity));
    if (!chains.some((chain) => chain.chain === "Arc Testnet") && arcActivity.txCount > 0) {
      chains.push(mergeArcActivityIntoChain({
        chain: "Arc Testnet",
        chainId: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 0),
        status: "no_activity",
        txCount: 0,
        firstSeenAt: null,
        lastSeenAt: null,
        walletAgeDays: 0,
        nativeBalance: 0,
        uniqueCounterparties: 0,
        counterpartyAddresses: [],
        contractInteractions: 0,
        activeDays: 0,
        recentActivityCount: 0,
        explorerUrl: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ? `${process.env.NEXT_PUBLIC_ARC_EXPLORER_URL.replace(/\/$/, "")}/address/${wallet}` : null,
        indexedAt: new Date().toISOString(),
        providerSource: "arcscan",
        errorMessage: null
      }, arcActivity));
    }
    if (chains.length === 0) return null;
    return aggregateMultiChainFromChains(wallet, chains);
  } catch (error) {
    if (!isMissingSchemaError(error)) throw error;
    return null;
  }
}
function eventFromRow(row: any): ReputationEvent {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    eventType: row.event_type,
    scoreDelta: Number(row.score_delta ?? 0),
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

export function isMissingSchemaError(error: unknown) {
  return JSON.stringify(error).includes("Could not find the table") || JSON.stringify(error).includes("column");
}

async function getProfileByWallet(wallet: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("wallet_address", normalizeWallet(wallet))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? profileFromRow(data) : null;
}

async function getLatestSnapshot(wallet: string, committedAt?: string | null) {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("wallet_activity_snapshots")
    .select("*")
    .eq("wallet_address", normalizeWallet(wallet));
  if (committedAt) query = query.lte("created_at", committedAt);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return mergeArcActivityIntoSnapshot(wallet, data ? snapshotFromRow(data) : null);
}

function emptyAttestationStats() {
  return { count: 0, uniqueCounterparties: 0, weight: 0, repeatedPairRatio: 0 };
}

async function safeIdentityPart<T>(wallet: string, label: string, loader: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.warn("[arc-identity] progressive_identity_enrichment_unavailable", {
      wallet,
      label,
      error: error instanceof Error ? error.message : String(error)
    });
    return fallback;
  }
}

async function ensureBaselineSnapshot(walletAddress: string) {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  try {
    const { data: existing, error: existingError } = await supabase
      .from("wallet_activity_snapshots")
      .select("id")
      .eq("wallet_address", wallet)
      .limit(1);
    if (existingError) throw existingError;
    if ((existing ?? []).length > 0) return;
    const { error } = await supabase.from("wallet_activity_snapshots").insert({
      wallet_address: wallet,
      tx_count: 0,
      volume: 0,
      counterparties: 0,
      active_days: 0,
      calculated_score: 0,
      latest_block: 0,
      native_balance: 0,
      recent_activity_count: 0,
      wallet_age_days: 0,
      activity_frequency: 0,
      transfer_count: 0,
      contract_interaction_count: 0,
      indexer_source: "baseline_identity"
    });
    if (error) throw error;
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      console.warn("[arc-identity] baseline_snapshot_create_failed_nonfatal", {
        wallet,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export async function ensureWalletProfile(walletAddress: string, signature: string, signatureMessage: string) {
  const wallet = normalizeWallet(walletAddress);
  await verifyWalletSignature({ walletAddress: wallet, signature, message: signatureMessage });
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const existing = await getProfileByWallet(wallet);

  if (!existing?.username) {
    console.log("[arc-identity] completed_profile_lookup", { wallet, found: false });
    return null;
  }

  console.log("[arc-identity] completed_profile_lookup", { wallet, found: true, username: existing.username });
  const { data, error } = await supabase
    .from("profiles")
    .update({ signature, verified_wallet: true, last_seen: now, updated_at: now })
    .ilike("wallet_address", wallet)
    .not("username", "is", null)
    .select("*")
    .single();
  if (error) throw error;
  return profileFromRow(data);
}

export async function claimUsername(walletAddress: string, username: string, signature: string, signatureMessage: string) {
  const wallet = normalizeWallet(walletAddress);
  await verifyWalletSignature({ walletAddress: wallet, signature, message: signatureMessage });
  const normalizedUsername = toArcUsername(username);
  const supabase = getSupabaseAdmin();
  const existing = await getProfileByWallet(wallet);
  if (existing?.username) {
    console.log("[arc-identity] profile username claim existing wallet", { wallet, username: existing.username });
    return existing;
  }

  console.log("[arc-identity] profile username claim", { wallet, username: normalizedUsername });
  const now = new Date().toISOString();
  const basePayload = {
    wallet_address: wallet,
    username: normalizedUsername,
    signature,
    verified_wallet: true,
    arc_score: initialArcScore,
    risk_level: "High Risk",
    risk_flags: [],
    score_trend: 0,
    activity_level: "Dormant",
    tx_count: 0,
    first_seen: now,
    last_seen: now,
    created_at: now,
    updated_at: now
  };
  let result = existing
    ? await supabase
        .from("profiles")
        .update({ username: normalizedUsername, signature, verified_wallet: true, arc_score: initialArcScore, risk_level: "High Risk", updated_at: now, last_seen: now })
        .ilike("wallet_address", wallet)
        .select("*")
        .single()
    : await supabase
      .from("profiles")
      .insert(basePayload)
      .select("*")
      .single();
  if (result.error && isMissingSchemaError(result.error) && !existing) {
    result = await supabase
      .from("profiles")
      .insert({
        wallet_address: wallet,
        username: normalizedUsername,
        signature,
        verified_wallet: true,
        arc_score: initialArcScore,
        risk_level: "High Risk",
        first_seen: now,
        last_seen: now,
        created_at: now,
        updated_at: now
      })
      .select("*")
      .single();
  }
  const { data, error } = result;
  if (error) {
    if (isUniqueViolation(error)) throw new Error("Username already taken.");
    throw new Error(dbErrorMessage(error));
  }
  void ensureBaselineSnapshot(wallet);
  void refreshWalletProfile(wallet).catch((refreshError) => {
    console.warn("[arc-identity] post_claim_refresh_background_failed", {
      wallet,
      username: normalizedUsername,
      error: refreshError instanceof Error ? refreshError.message : String(refreshError)
    });
  });
  return profileFromRow(data);
}

async function listAttestationRows(wallet: string) {
  const supabase = getSupabaseAdmin();
  const normalized = normalizeWallet(wallet);
  const { data, error } = await supabase
    .from("attestations")
    .select("*")
    .or(`from_wallet.eq.${normalized},to_wallet.eq.${normalized}`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

function isVerifiedAttestationRow(row: any) {
  return Boolean(row.verified_transaction) && typeof row.tx_hash === "string" && row.tx_hash.length > 0;
}

async function getAttestationStats(wallet: string) {
  const rows = (await listAttestationRows(wallet)).filter(isVerifiedAttestationRow);
  const normalized = normalizeWallet(wallet);
  const counterparties = new Set<string>();
  const pairCounts = new Map<string, number>();
  const txHashes = new Set<string>();
  let totalWeight = 0;

  for (const row of rows) {
    const txHash = String(row.tx_hash ?? "").toLowerCase();
    if (!txHash || txHashes.has(txHash)) continue;
    txHashes.add(txHash);
    const from = normalizeWallet(row.from_wallet);
    const to = normalizeWallet(row.to_wallet);
    const counterparty = from === normalized ? to : from;
    counterparties.add(counterparty);
    pairCounts.set(counterparty, (pairCounts.get(counterparty) ?? 0) + 1);
    totalWeight += Number(row.weight ?? 0);
  }

  const repeatedExcess = Array.from(pairCounts.values()).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  return {
    count: txHashes.size,
    uniqueCounterparties: counterparties.size,
    weight: totalWeight,
    repeatedPairRatio: txHashes.size ? repeatedExcess / txHashes.size : 0
  };
}

function refreshJobFromRow(row: any): WalletRefreshJob {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? null,
    errorMessage: row.error_message ?? null,
    chainsTotal: Number(row.chains_total ?? 0),
    chainsCompleted: Number(row.chains_completed ?? 0),
    indexedCount: Number(row.indexed_count ?? 0),
    limitedCount: Number(row.limited_count ?? 0),
    noActivityCount: Number(row.no_activity_count ?? 0),
    errorCount: Number(row.error_count ?? 0),
    refreshVersion: row.refresh_version ?? null,
    createdAt: row.created_at
  };
}

async function requireScoreIntegritySchema() {
  const supabase = getSupabaseAdmin();
  const [profileCheck, arcSnapshotCheck, chainSnapshotCheck] = await Promise.all([
    supabase.from("profiles").select("score_model_version,score_inputs,score_breakdown,score_calculated_at").limit(1),
    supabase.from("wallet_activity_snapshots").select("evidence_version,counterparty_addresses").limit(1),
    supabase.from("wallet_chain_snapshots").select("counterparty_addresses").limit(1)
  ]);
  const error = profileCheck.error ?? arcSnapshotCheck.error ?? chainSnapshotCheck.error;
  if (error) {
    console.warn("[arc-identity] score_integrity_schema_required", {
      code: error.code ?? null,
      message: error.message ?? String(error)
    });
    throw new Error("Identity Score integrity migration is required before wallet intelligence can refresh");
  }
}

async function createRefreshJob(walletAddress: string) {
  const supabase = getSupabaseAdmin();
  const wallet = normalizeWallet(walletAddress);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { error: staleError } = await supabase
    .from("wallet_refresh_jobs")
    .update({
      status: "failed",
      completed_at: new Date().toISOString(),
      error_message: "Refresh expired before score commit"
    })
    .eq("wallet_address", wallet)
    .in("status", ["started", "indexing_chains", "recomputing_score"])
    .lt("started_at", staleBefore);
  if (staleError && !isMissingSchemaError(staleError)) throw staleError;
  const refreshVersion = crypto.randomUUID();
  const { data, error } = await supabase
    .from("wallet_refresh_jobs")
    .insert({
      wallet_address: wallet,
      status: "started",
      refresh_version: refreshVersion,
      chains_total: 0,
      chains_completed: 0,
      indexed_count: 0,
      limited_count: 0,
      no_activity_count: 0,
      error_count: 0
    })
    .select("*")
    .single();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    if (isUniqueViolation(error)) throw new Error("Wallet intelligence refresh already in progress");
    throw error;
  }
  return refreshJobFromRow(data);
}

async function updateRefreshJob(job: WalletRefreshJob | null, patch: Partial<{
  status: RefreshStatus;
  completedAt: string | null;
  errorMessage: string | null;
  chainsTotal: number;
  chainsCompleted: number;
  indexedCount: number;
  limitedCount: number;
  noActivityCount: number;
  errorCount: number;
}>) {
  if (!job) return null;
  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = {};
  if (patch.status) payload.status = patch.status;
  if ("completedAt" in patch) payload.completed_at = patch.completedAt;
  if ("errorMessage" in patch) payload.error_message = patch.errorMessage;
  if (patch.chainsTotal != null) payload.chains_total = patch.chainsTotal;
  if (patch.chainsCompleted != null) payload.chains_completed = patch.chainsCompleted;
  if (patch.indexedCount != null) payload.indexed_count = patch.indexedCount;
  if (patch.limitedCount != null) payload.limited_count = patch.limitedCount;
  if (patch.noActivityCount != null) payload.no_activity_count = patch.noActivityCount;
  if (patch.errorCount != null) payload.error_count = patch.errorCount;
  const { data, error } = await supabase.from("wallet_refresh_jobs").update(payload).eq("id", job.id).select("*").single();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  return refreshJobFromRow(data);
}

export async function getLatestRefreshJob(walletAddress: string): Promise<WalletRefreshJob | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wallet_refresh_jobs")
    .select("*")
    .eq("wallet_address", normalizeWallet(walletAddress))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingSchemaError(error)) return null;
    throw error;
  }
  return data ? refreshJobFromRow(data) : null;
}

function chainStatusCounts(multiChain: MultiChainWalletProfile | null) {
  const chains = multiChain?.chains ?? [];
  return {
    chainsTotal: chains.length,
    chainsCompleted: chains.length,
    indexedCount: chains.filter((chain) => chain.status === "indexed").length,
    limitedCount: chains.filter((chain) => chain.status === "limited" || chain.status === "not_configured").length,
    noActivityCount: chains.filter((chain) => chain.status === "no_activity").length,
    errorCount: chains.filter((chain) => chain.status === "error").length
  };
}

function sortedList(values: string[]) {
  return [...values].sort().join("|");
}

type CanonicalDirectoryScore = {
  score: number | null;
  riskLevel: Profile["riskLevel"];
  updatedAt: string | null;
  source: "profile_score_v2" | "score_refresh_snapshot" | "profile" | "legacy_profile" | "placeholder";
};

function validScore(value: unknown) {
  const score = Number(value);
  return Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : null;
}

function latestEventScore(row: any): { score: number | null; riskLevel: Profile["riskLevel"] | null; updatedAt: string | null } {
  const metadata = (row?.metadata ?? {}) as Record<string, any>;
  const score = validScore(metadata.newScore ?? metadata.arcIdentityScore ?? metadata.score);
  const riskLevel = typeof metadata.newRiskLevel === "string" ? metadata.newRiskLevel as Profile["riskLevel"] : null;
  return { score, riskLevel, updatedAt: row?.created_at ?? null };
}

async function getLatestScoreRefreshRows(wallets: string[]) {
  if (wallets.length === 0) return new Map<string, any>();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reputation_events")
    .select("wallet_address,created_at,metadata")
    .in("wallet_address", wallets)
    .eq("event_type", "score_refresh")
    .order("created_at", { ascending: false })
    .limit(Math.max(20, wallets.length * 4));
  if (error) {
    console.warn("[arc-identity] directory_score_source_mismatch", { stage: "latest_score_refresh_query", error: error.message });
    return new Map<string, any>();
  }
  const latest = new Map<string, any>();
  for (const row of data ?? []) {
    const wallet = normalizeWallet(row.wallet_address);
    if (!latest.has(wallet)) latest.set(wallet, row);
  }
  return latest;
}

async function getLatestGlobalProfileRows(wallets: string[]) {
  if (wallets.length === 0) return new Map<string, any>();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wallet_global_profiles")
    .select("*")
    .in("wallet_address", wallets);
  if (error) {
    if (isMissingSchemaError(error)) return new Map<string, any>();
    console.warn("[arc-identity] directory_score_source_mismatch", { stage: "latest_global_profile_query", error: error.message });
    return new Map<string, any>();
  }
  return new Map((data ?? []).map((row) => [normalizeWallet(row.wallet_address), row]));
}

async function getLatestChainSnapshotRows(wallets: string[]) {
  if (wallets.length === 0) return new Map<string, ChainSnapshot[]>();
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("wallet_chain_snapshots")
    .select("*")
    .in("wallet_address", wallets)
    .order("indexed_at", { ascending: false })
    .limit(Math.max(60, wallets.length * 8));
  if (error) {
    if (isMissingSchemaError(error)) return new Map<string, ChainSnapshot[]>();
    console.warn("[arc-identity] directory_score_source_mismatch", { stage: "latest_chain_snapshot_query", error: error.message });
    return new Map<string, ChainSnapshot[]>();
  }
  const latestByWallet = new Map<string, ChainSnapshot[]>();
  const seen = new Set<string>();
  for (const row of data ?? []) {
    const wallet = normalizeWallet(row.wallet_address);
    const chainName = String(row.chain_name ?? "");
    const key = `${wallet}:${chainName}`;
    if (!chainName || seen.has(key)) continue;
    seen.add(key);
    const current = latestByWallet.get(wallet) ?? [];
    current.push(chainSnapshotFromRow(row));
    latestByWallet.set(wallet, current);
  }
  return latestByWallet;
}

function getCanonicalDirectoryScore(profile: Profile, scoreRow: any | null): CanonicalDirectoryScore {
  const storedInput = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
    ? scoreInputFromUnknown(profile.scoreInputs)
    : null;
  if (storedInput) {
    const storedScore = arcScoreFromInput(profile.walletAddress, storedInput, profile.scoreCalculatedAt ?? profile.updatedAt);
    return {
      score: storedScore.arcScore,
      riskLevel: storedScore.riskLevel,
      updatedAt: profile.scoreCalculatedAt ?? profile.updatedAt,
      source: "profile_score_v2"
    };
  }
  const event = latestEventScore(scoreRow);
  const profileScore = validScore(profile.arcScore);
  const credentialScore = validScore(profile.credentialScore);
  if (profileScore != null) {
    return {
      score: profileScore,
      riskLevel: profile.riskLevel,
      updatedAt: profile.updatedAt,
      source: "profile"
    };
  }
  if (event.score != null) {
    return {
      score: event.score,
      riskLevel: event.riskLevel ?? getRiskLevel(event.score),
      updatedAt: event.updatedAt,
      source: "score_refresh_snapshot"
    };
  }
  if (credentialScore != null) {
    return {
      score: credentialScore,
      riskLevel: profile.credentialLevel,
      updatedAt: profile.updatedAt,
      source: "legacy_profile"
    };
  }
  return {
    score: null,
    riskLevel: "New / Unproven",
    updatedAt: profile.updatedAt,
    source: "placeholder"
  };
}

function shouldInsertScoreRefreshEvent(profile: Profile, score: { arcScore: number; riskLevel: string }, multiChain: MultiChainWalletProfile | null) {
  return profile.arcScore !== score.arcScore || profile.riskLevel !== score.riskLevel || sortedList(profile.indexedChains) !== sortedList(multiChain?.activeChains ?? []);
}

type ScoreBreakdown = {
  globalWalletAge: number;
  crossChainActivity: number;
  arcActivity: number;
  counterpartyDiversity: number;
  verifiedAttestations: number;
  trustPropagation: number;
  indexedChainDepth: number;
  riskPenalty: number;
};

function scoreBreakdown(score: ArcScore): ScoreBreakdown {
  return {
    globalWalletAge: score.longevityScore,
    crossChainActivity: score.activityScore,
    arcActivity: score.balanceSignalScore,
    counterpartyDiversity: score.counterpartyDiversityScore,
    verifiedAttestations: score.attestationScore,
    trustPropagation: score.trustPropagationScore,
    indexedChainDepth: score.consistencyScore,
    riskPenalty: score.riskPenalty
  };
}

function isZeroSignalBreakdown(breakdown: ScoreBreakdown) {
  return breakdown.globalWalletAge <= 0 &&
    breakdown.crossChainActivity <= 0 &&
    breakdown.arcActivity <= 0 &&
    breakdown.counterpartyDiversity <= 0 &&
    breakdown.verifiedAttestations <= 0 &&
    breakdown.trustPropagation <= 0 &&
    breakdown.indexedChainDepth <= 0 &&
    breakdown.riskPenalty <= 0;
}

export function isGeneratedDirectoryUsername(username: string | null | undefined) {
  const base = String(username ?? "").trim().toLowerCase().replace(/\.(?:kyro|arcid)$/i, "");
  return DIRECTORY_HIDDEN_USERNAME_PREFIXES.some((prefix) => base.startsWith(prefix));
}

function changedComponents(previous: ScoreBreakdown | null, next: ScoreBreakdown) {
  if (!previous) return Object.keys(next);
  return (Object.keys(next) as Array<keyof ScoreBreakdown>).filter((key) => Math.abs(next[key] - previous[key]) >= 2);
}

function reasonForComponent(component: string, previous: ScoreBreakdown | null, next: ScoreBreakdown) {
  const before = previous?.[component as keyof ScoreBreakdown] ?? 0;
  const after = next[component as keyof ScoreBreakdown];
  const direction = after >= before ? "increased" : "decreased";
  if (component === "globalWalletAge") return `Wallet maturity confidence was recalculated from indexed history.`;
  if (component === "crossChainActivity") return `Chain coverage context was recalculated as a supporting confidence signal.`;
  if (component === "arcActivity") return `Arc ecosystem activity stabilized after the latest Arc index refresh.`;
  if (component === "counterpartyDiversity") return `Verified and Arc-weighted counterparty context was recalculated.`;
  if (component === "verifiedAttestations") return `Verified attestations ${direction} trust contribution.`;
  if (component === "trustPropagation") return `Trust propagation normalized after latest network refresh.`;
  if (component === "indexedChainDepth") return `Global activity context was recalculated for wallet intelligence.`;
  if (component === "riskPenalty") return `Risk penalty ${direction} based on current risk flags and anomaly signals.`;
  return "Score recalibration completed from latest indexed data.";
}

function buildScoreRefreshReason(previous: ScoreBreakdown | null, next: ScoreBreakdown, components: string[], counts: ReturnType<typeof chainStatusCounts>, scoreDelta: number, category: string) {
  if (isZeroSignalBreakdown(next)) return "No indexed wallet activity, Arc activity, verified attestations or trust graph evidence was detected. Profile creation does not add reputation, so Identity Score now reflects the verified signal total.";
  if (components.length === 0) return category === "SCORE_RECALCULATION" ? "Score recalibration completed from current Arc-native reputation signals and supporting wallet context." : "Score recalculated from current Arc-native reputation signals and supporting wallet context.";
  const reasons = components.slice(0, 3).map((component) => reasonForComponent(component, previous, next));
  if (scoreDelta <= -10) {
    if (counts.errorCount > 0 || counts.limitedCount > 0) reasons.push("Temporary provider coverage changed chain depth scoring.");
    reasons.push("Passive recalculation drops are capped so temporary indexing changes do not feel punitive.");
  }
  return reasons.join(" ");
}

function classifyScoreEvent(previousBreakdown: ScoreBreakdown | null, nextBreakdown: ScoreBreakdown, input: { previousRiskFlags: string[]; nextRiskFlags: string[]; previousAnomalyScore: number; nextAnomalyScore: number; attestationCountChanged: boolean }) {
  const riskPenaltyIncrease = previousBreakdown ? nextBreakdown.riskPenalty - previousBreakdown.riskPenalty : 0;
  const anomalyIncrease = input.nextAnomalyScore - input.previousAnomalyScore;
  if (anomalyIncrease >= 10 || input.nextRiskFlags.includes("trust_network_anomaly")) return "ANOMALY_DETECTED";
  if (riskPenaltyIncrease >= 5 || input.nextRiskFlags.length > input.previousRiskFlags.length) return "RISK_EVENT";
  if (input.attestationCountChanged) return "VERIFIED_ACTIVITY";
  if (previousBreakdown && Math.abs(nextBreakdown.trustPropagation - previousBreakdown.trustPropagation) >= 2) return "TRUST_UPDATE";
  return "SCORE_RECALCULATION";
}

function isPassiveScoreEvent(category: string) {
  return category === "SCORE_RECALCULATION" || category === "TRUST_UPDATE";
}

async function getLatestScoreRefreshContext(wallet: string): Promise<{ createdAt: string | null; breakdown: ScoreBreakdown | null; score: number | null; riskLevel: string | null; anomalyScore: number; attestationCount: number | null }> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("reputation_events")
    .select("*")
    .eq("wallet_address", wallet)
    .eq("event_type", "score_refresh")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const metadata = (data?.metadata ?? {}) as Record<string, any>;
  const breakdown = metadata.newBreakdown ?? metadata.scoreBreakdown;
  return {
    createdAt: data?.created_at ?? null,
    breakdown: breakdown ? scoreBreakdownFromUnknown(breakdown) : null,
    score: typeof metadata.newScore === "number" ? metadata.newScore : null,
    riskLevel: typeof metadata.newRiskLevel === "string" ? metadata.newRiskLevel : null,
    anomalyScore: typeof metadata.trustPropagation?.anomalyScore === "number" ? metadata.trustPropagation.anomalyScore : 0,
    attestationCount: typeof metadata.attestationCount === "number" ? metadata.attestationCount : null
  };
}

function scoreBreakdownFromUnknown(value: Record<string, any>): ScoreBreakdown | null {
  if (typeof value.globalWalletAge === "number") return value as ScoreBreakdown;
  if (typeof value.longevityScore === "number") {
    return {
      globalWalletAge: Number(value.longevityScore ?? 0),
      crossChainActivity: Number(value.activityScore ?? 0),
      arcActivity: Number(value.balanceSignalScore ?? 0),
      counterpartyDiversity: Number(value.counterpartyDiversityScore ?? 0),
      verifiedAttestations: Number(value.attestationScore ?? 0),
      trustPropagation: Number(value.trustPropagationScore ?? 0),
      indexedChainDepth: Number(value.consistencyScore ?? 0),
      riskPenalty: Number(value.riskPenalty ?? 0)
    };
  }
  return null;
}

function recentScoreRefresh(createdAt: string | null) {
  return createdAt ? Date.now() - new Date(createdAt).getTime() < 2 * 60 * 1000 : false;
}

export async function refreshWalletProfile(walletAddress: string): Promise<IdentityRecord | null> {
  const profile = await getProfileByWallet(walletAddress);
  if (!profile) return null;
  await requireScoreIntegritySchema();

  const supabase = getSupabaseAdmin();
  const previousScore = profile.arcScore;
  const job = await createRefreshJob(profile.walletAddress);
  console.log("[arc-identity] score_refresh_started", { wallet: profile.walletAddress, previousScore });

  try {
    await updateRefreshJob(job, { status: "indexing_chains" });
    const committedEvidenceAt = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
      ? profile.scoreCalculatedAt
      : null;
    const [analytics, liveArc, multiChainRaw, stats, cachedMultiChain, cachedSnapshot] = await Promise.all([
      getWalletAnalytics(profile.walletAddress, 3400),
      getArcLiveWalletData(profile.walletAddress, 6500),
      getMultiChainWalletProfile(profile.walletAddress),
      getAttestationStats(profile.walletAddress),
      getCachedMultiChainProfile(profile.walletAddress, committedEvidenceAt).catch((error) => {
        console.warn("[arc-identity] cached_multichain_floor_unavailable", { wallet: profile.walletAddress, error: error instanceof Error ? error.message : String(error) });
        return null;
      }),
      getLatestSnapshot(profile.walletAddress, committedEvidenceAt).catch((error) => {
        console.warn("[arc-identity] cached_arc_snapshot_floor_unavailable", { wallet: profile.walletAddress, error: error instanceof Error ? error.message : String(error) });
        return null;
      })
    ]);
    const analyticsWithLiveArc = {
      ...analytics,
      balance: liveArc.balance ?? analytics.balance,
      latestBlock: Math.max(analytics.latestBlock, liveArc.latestBlock ?? 0),
      txCount: Math.max(analytics.txCount, liveArc.txCount ?? 0),
      indexerSource: liveArc.providerStatus === "live" ? "live_arc_rpc_plus_indexer" : analytics.indexerSource,
      rpcAvailable: analytics.rpcAvailable || liveArc.providerStatus === "live"
    };
    const mergedChains = multiChainRaw.chains.map((chain) => chain.chain === "Arc Testnet" ? {
      ...chain,
      status: liveArc.providerStatus === "live" && Math.max(chain.txCount, liveArc.txCount ?? 0) === 0 ? "no_activity" as const : liveArc.providerStatus === "live" || chain.txCount > 0 ? "indexed" as const : chain.status,
      txCount: Math.max(chain.txCount, liveArc.txCount ?? 0),
      nativeBalance: liveArc.balance ?? chain.nativeBalance,
      providerSource: liveArc.providerStatus === "live" ? "live_arc_rpc" : chain.providerSource,
      errorMessage: liveArc.providerStatus === "live" ? null : chain.errorMessage
    } : chain);
    const freshMultiChain = aggregateMultiChainFromChains(profile.walletAddress, mergedChains, multiChainRaw);
    const preliminaryMultiChain = buildStableMultiChainProfile(profile, freshMultiChain, cachedMultiChain);
    console.log("[arc-identity] score_refresh_stable_evidence_merged", {
      wallet: profile.walletAddress,
      freshScoreInputs: { totalTx: freshMultiChain.totalTxCount, activeChains: freshMultiChain.activeChains, globalWalletAgeDays: freshMultiChain.globalWalletAgeDays },
      cachedScoreInputs: cachedMultiChain ? { totalTx: cachedMultiChain.totalTxCount, activeChains: cachedMultiChain.activeChains, globalWalletAgeDays: cachedMultiChain.globalWalletAgeDays } : null,
      stableScoreInputs: { totalTx: preliminaryMultiChain.totalTxCount, activeChains: preliminaryMultiChain.activeChains, globalWalletAgeDays: preliminaryMultiChain.globalWalletAgeDays }
    });
    console.log("[arc-identity] arc_data_source_selected", {
      wallet: profile.walletAddress,
      balanceSource: liveArc.providerStatus === "live" ? "live_arc_rpc" : analyticsWithLiveArc.indexerSource,
      balance: analyticsWithLiveArc.balance,
      latestBlock: analyticsWithLiveArc.latestBlock
    });

    const now = new Date().toISOString();
    const snapshotLike = stableArcSnapshot(profile.walletAddress, analyticsWithLiveArc, cachedSnapshot, preliminaryMultiChain, now);
    const multiChain = mergeArcSnapshotIntoMultiChain(preliminaryMultiChain, snapshotLike);
    const counts = chainStatusCounts(multiChain);
    await updateRefreshJob(job, { status: "recomputing_score", ...counts });

    if (counts.errorCount > 0 && counts.indexedCount === 0 && counts.noActivityCount === 0) {
      throw new Error("Refresh produced only provider errors; preserving cached score");
    }

    const previousScoreInput = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
      ? scoreInputFromUnknown(profile.scoreInputs)
      : null;
    const trustGraph = await getTrustGraph(profile.walletAddress).catch((error) => {
      if (!previousScoreInput) throw error;
      console.warn("[arc-identity] trust_graph_refresh_unavailable_preserving_score_inputs", {
        wallet: profile.walletAddress,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    });
    const { score: rawScore, riskFlags, activityLevel, scoreInput, components: scoreComponents } = buildArcScore(profile, {
      snapshot: snapshotLike,
      multiChain,
      attestationWeight: stats.weight,
      attestationCount: stats.count,
      uniqueAttestationCounterparties: stats.uniqueCounterparties,
      repeatedPairRatio: stats.repeatedPairRatio,
      propagatedTrustScore: trustGraph?.metrics.propagatedTrustScore ?? previousScoreInput?.propagatedTrustScore ?? 0,
      trustAnomalyScore: trustGraph?.metrics.anomalyScore ?? previousScoreInput?.anomalyScore ?? 0
    });
    const latestContext = await getLatestScoreRefreshContext(profile.walletAddress);
    const previousBreakdown = latestContext.breakdown;
    const nextBreakdownRaw = scoreBreakdown(rawScore);
    const changed = changedComponents(previousBreakdown, nextBreakdownRaw);
    const eventCategory = classifyScoreEvent(previousBreakdown, nextBreakdownRaw, {
      previousRiskFlags: profile.riskFlags,
      nextRiskFlags: riskFlags,
      previousAnomalyScore: latestContext.anomalyScore,
      nextAnomalyScore: trustGraph?.metrics.anomalyScore ?? 0,
      attestationCountChanged: latestContext.attestationCount != null && latestContext.attestationCount !== stats.count
    });
    const reasonSummary = buildScoreRefreshReason(previousBreakdown, nextBreakdownRaw, changed, counts, rawScore.arcScore - previousScore, eventCategory);
    console.log("[arc-identity] score_refresh_reason_generated", { wallet: profile.walletAddress, components: changed, reasonSummary });
    const score = rawScore;
    if (score.arcScore - previousScore <= -10) {
      console.log("[arc-identity] score_refresh_large_delta", { wallet: profile.walletAddress, previousScore, score: score.arcScore, eventCategory, reasonSummary });
    }
    const scoreTrend = score.arcScore - previousScore;
    const coverageChanged = sortedList(profile.indexedChains) !== sortedList(multiChain?.activeChains ?? []);
    const riskChanged = profile.riskLevel !== score.riskLevel;
    const recentRefresh = recentScoreRefresh(latestContext.createdAt);
    const shouldLogRefresh = shouldInsertScoreRefreshEvent(profile, score, multiChain) &&
      !(recentRefresh && Math.abs(scoreTrend) < 5 && !riskChanged && !coverageChanged);
    if (!shouldLogRefresh) {
      console.log("[arc-identity] score_refresh_suppressed", { wallet: profile.walletAddress, scoreTrend, recentRefresh, riskChanged, coverageChanged });
    }

    await persistMultiChainProfile(multiChain, now);

    let { data: snapshotRow, error: snapshotError } = await supabase
      .from("wallet_activity_snapshots")
      .insert({
        wallet_address: profile.walletAddress,
        tx_count: snapshotLike.txCount,
        volume: snapshotLike.volume,
        counterparties: snapshotLike.counterparties,
        counterparty_addresses: snapshotLike.counterpartyAddresses,
        evidence_version: snapshotLike.evidenceVersion,
        active_days: snapshotLike.activeDays,
        recent_activity_count: snapshotLike.recentActivityCount,
        wallet_age_days: snapshotLike.walletAgeDays,
        activity_frequency: snapshotLike.activityFrequency,
        transfer_count: snapshotLike.transferCount,
        contract_interaction_count: snapshotLike.contractInteractionCount,
        indexer_source: snapshotLike.indexerSource,
        calculated_score: snapshotLike.calculatedScore,
        latest_block: snapshotLike.latestBlock,
        native_balance: snapshotLike.nativeBalance,
        last_activity_at: snapshotLike.lastActivityAt,
        created_at: now
      })
      .select("*")
      .single();
    if (snapshotError && isMissingSchemaError(snapshotError)) {
      const fallback = await supabase
        .from("wallet_activity_snapshots")
        .insert({
          wallet_address: profile.walletAddress,
          tx_count: snapshotLike.txCount,
          volume: snapshotLike.volume,
          counterparties: snapshotLike.counterparties,
          active_days: snapshotLike.activeDays,
          calculated_score: snapshotLike.calculatedScore,
          latest_block: snapshotLike.latestBlock,
          native_balance: snapshotLike.nativeBalance,
          last_activity_at: snapshotLike.lastActivityAt,
          created_at: now
        })
        .select("*")
        .single();
      snapshotRow = fallback.data;
      snapshotError = fallback.error;
    }
    if (snapshotError) throw snapshotError;

    const snapshot = snapshotFromRow(snapshotRow);
    console.log("[arc-identity] arc_snapshot_updated", {
      wallet: profile.walletAddress,
      balance: snapshot.nativeBalance,
      latestBlock: snapshot.latestBlock,
      source: snapshot.indexerSource,
      createdAt: snapshot.createdAt
    });
    console.log("[arc-identity] score_snapshot_write_started", {
      wallet: profile.walletAddress,
      profileId: profile.id,
      score: score.arcScore,
      riskLevel: score.riskLevel,
      totalTx: multiChain.totalTxCount,
      activeChains: multiChain.activeChains.length,
      globalWalletAgeDays: multiChain.globalWalletAgeDays
    });
    const sortedMultiChainSeenAt = multiChain.chains
      .map((chain) => chain.lastSeenAt)
      .filter((value): value is string => Boolean(value))
      .sort();
    const latestMultiChainSeenAt = sortedMultiChainSeenAt[sortedMultiChainSeenAt.length - 1] ?? null;
    const scoreBreakdownPayload = Object.fromEntries(Object.entries(scoreComponents).map(([key, component]) => [key, component.points]));
    let { data: updatedProfileRow, error: profileError } = await supabase
      .from("profiles")
      .update({
        arc_score: score.arcScore,
        risk_level: score.riskLevel,
        risk_flags: riskFlags,
        score_trend: scoreTrend,
        activity_level: activityLevel,
        tx_count: multiChain.totalTxCount,
        first_seen: multiChain.globalFirstSeenAt ?? analyticsWithLiveArc.firstSeenAt ?? profile.firstSeen,
        last_seen: latestDate(analyticsWithLiveArc.lastActivityAt ?? null, latestMultiChainSeenAt) ?? now,
        updated_at: now,
        global_wallet_age_days: multiChain.globalWalletAgeDays,
        arc_wallet_age_days: snapshot.walletAgeDays,
        active_chain_count: multiChain.activeChains.length,
        credential_score: score.arcScore,
        credential_level: score.riskLevel,
        indexed_chains: multiChain.activeChains,
        score_model_version: score.modelVersion,
        score_inputs: scoreInput,
        score_breakdown: scoreBreakdownPayload,
        score_calculated_at: now
      })
      .eq("id", profile.id)
      .select("id,wallet_address,username,arc_score,risk_level,updated_at")
      .single();
    if (profileError) throw profileError;
    if (!updatedProfileRow || Number(updatedProfileRow.arc_score ?? 0) !== score.arcScore) {
      throw new Error("Score snapshot write verification failed");
    }
    console.log("[arc-identity] score_snapshot_write_success", {
      wallet: profile.walletAddress,
      profileId: profile.id,
      score: score.arcScore,
      updatedAt: now
    });

    if (shouldLogRefresh) {
      await supabase.from("reputation_events").insert({
        wallet_address: profile.walletAddress,
        event_type: "score_refresh",
        score_delta: scoreTrend,
        metadata: {
          dataSource: "arc_rpc_plus_transaction_verified_attestations",
          refreshVersion: job?.refreshVersion,
          latestBlock: analyticsWithLiveArc.latestBlock,
          txCount: analyticsWithLiveArc.txCount,
          recentActivityCount: analyticsWithLiveArc.recentActivityCount,
          uniqueCounterparties: analyticsWithLiveArc.uniqueCounterparties,
          activeDays: analyticsWithLiveArc.activeDays,
          transferCount: analyticsWithLiveArc.transferCount,
          contractInteractionCount: analyticsWithLiveArc.contractInteractionCount,
          indexerSource: analyticsWithLiveArc.indexerSource,
          firstSeenAt: analyticsWithLiveArc.firstSeenAt,
          lastActivityAt: analyticsWithLiveArc.lastActivityAt,
          riskFlags,
          chainCoverage: counts,
          previousScore,
          newScore: score.arcScore,
          rawCalculatedScore: score.arcScore,
          scoreDelta: scoreTrend,
          previousBreakdown,
          newBreakdown: scoreBreakdown(score),
          rawBreakdown: nextBreakdownRaw,
          changedComponents: changed,
          affectedCategories: changed,
          reasonSummary,
          eventCategory,
          isRecalibration: eventCategory === "SCORE_RECALCULATION",
          passiveRecalculation: isPassiveScoreEvent(eventCategory),
          scoreConfidence: (multiChain.totalTxCount < 5 || stats.count === 0) ? "stabilizing" : "normal",
          confidenceMessage: (multiChain.totalTxCount < 5 || stats.count === 0) ? "Score still stabilizing as more activity is indexed." : "Score confidence is based on indexed activity and verified attestations.",
          stabilized: false,
          tinyChangeSuppressed: false,
          memoryFloor: null,
          attestationCount: stats.count,
          trustPropagation: trustGraph ? {
            propagatedTrustScore: trustGraph.metrics.propagatedTrustScore,
            trustConfidence: trustGraph.metrics.trustConfidence,
            anomalyScore: trustGraph.metrics.anomalyScore,
            networkMaturity: trustGraph.metrics.networkMaturity
          } : null,
          scoreModelVersion: score.modelVersion,
          scoreInputs: scoreInput,
          scoreBreakdown: scoreBreakdownPayload
        }
      });
    }

    const committedJob = await updateRefreshJob(job, { status: "committed", completedAt: new Date().toISOString(), ...counts });
    const identity = await getIdentityByWallet(profile.walletAddress, false, snapshot);
    return identity ? {
      ...identity,
      profile: { ...identity.profile, arcScore: score.arcScore, riskLevel: score.riskLevel, riskFlags, scoreTrend, activityLevel, txCount: multiChain.totalTxCount, globalWalletAgeDays: multiChain.globalWalletAgeDays, arcWalletAgeDays: snapshot.walletAgeDays, activeChainCount: multiChain.activeChains.length, credentialScore: score.arcScore, credentialLevel: score.riskLevel, indexedChains: multiChain.activeChains, scoreModelVersion: score.modelVersion, scoreInputs: scoreInput, scoreBreakdown: scoreBreakdownPayload, scoreCalculatedAt: now },
      score,
      multiChain,
      refreshJob: committedJob ?? identity.refreshJob
    } : identity;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown refresh failure";
    await updateRefreshJob(job, { status: "failed", completedAt: new Date().toISOString(), errorMessage: message });
    console.warn("[arc-identity] atomic refresh failed; cached score preserved", { wallet: profile.walletAddress, message });
    throw error;
  }
}

export async function getIdentityByWallet(walletAddress: string, refresh = true, latestSnapshot?: WalletActivitySnapshot): Promise<IdentityRecord | null> {
  const wallet = normalizeWallet(walletAddress);
  if (refresh) {
    const refreshed = await refreshWalletProfile(wallet);
    if (refreshed) return refreshed;
  }

  const profile = await getProfileByWallet(wallet);
  if (!profile) return null;
  const committedEvidenceAt = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
    ? profile.scoreCalculatedAt
    : null;
  const [stats, snapshot, multiChain, refreshJob, trustGraph] = await Promise.all([
    safeIdentityPart(wallet, "attestation_stats", () => getAttestationStats(wallet), emptyAttestationStats()),
    latestSnapshot ? Promise.resolve(latestSnapshot) : safeIdentityPart<WalletActivitySnapshot | null>(wallet, "latest_snapshot", () => getLatestSnapshot(wallet, committedEvidenceAt), null),
    safeIdentityPart<MultiChainWalletProfile | null>(wallet, "cached_multichain", () => getCachedMultiChainProfile(wallet, committedEvidenceAt), null),
    safeIdentityPart<WalletRefreshJob | null>(wallet, "latest_refresh_job", () => getLatestRefreshJob(wallet), null),
    safeIdentityPart(wallet, "trust_graph", () => getTrustGraph(wallet), null)
  ]);
  const canonicalSnapshot = canonicalArcSnapshotForScore(wallet, snapshot, multiChain);
  const { score: calculatedScore, riskFlags, activityLevel } = buildArcScore(profile, {
    snapshot: canonicalSnapshot,
    multiChain,
    attestationWeight: stats.weight,
    attestationCount: stats.count,
    uniqueAttestationCounterparties: stats.uniqueCounterparties,
    repeatedPairRatio: stats.repeatedPairRatio,
    propagatedTrustScore: trustGraph?.metrics.propagatedTrustScore ?? 0,
    trustAnomalyScore: trustGraph?.metrics.anomalyScore ?? 0
  });
  const persistedInput = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
    ? scoreInputFromUnknown(profile.scoreInputs)
    : null;
  const score = persistedInput
    ? arcScoreFromInput(profile.walletAddress, persistedInput, profile.scoreCalculatedAt ?? calculatedScore.lastSyncedAt)
    : calculatedScore;
  const canonicalRiskFlags = persistedInput ? profile.riskFlags : riskFlags;

  return {
    profile: {
      ...profile,
      arcScore: score.arcScore,
      riskLevel: score.riskLevel,
      riskFlags: canonicalRiskFlags,
      activityLevel: persistedInput ? profile.activityLevel : activityLevel,
      txCount: multiChain?.totalTxCount ?? profile.txCount
    },
    score,
    snapshot: canonicalSnapshot,
    acceptedAttestations: stats.count,
    uniqueCounterparties: stats.uniqueCounterparties,
    attestationWeight: stats.weight,
    repeatedPairRatio: stats.repeatedPairRatio,
    trustGraph,
    multiChain,
    refreshJob
  };
}

export async function getIdentityByUsername(username: string, refresh = false) {
  const supabase = getSupabaseAdmin();
  const normalized = maybeArcUsername(username);
  if (!normalized) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("username", normalized)
    .not("username", "is", null)
    .limit(2);
  if (error) throw error;
  const row = data?.[0] ?? null;
  if (!data) return null;
  try {
    if (!row) return null;
    if ((data?.length ?? 0) > 1) {
      console.warn("[arc-identity] profile_route_duplicate_username_rows", { username: normalized, rows: data?.length ?? 0 });
    }
    return await getIdentityByWallet(row.wallet_address, refresh);
  } catch (identityError) {
    console.warn("[arc-identity] profile enrichment failed; rendering baseline identity", {
      username: normalized,
      wallet: row.wallet_address,
      error: identityError instanceof Error ? identityError.message : String(identityError)
    });
    const profile = profileFromRow(row);
    const { score: calculatedScore, riskFlags, activityLevel } = buildArcScore(profile, {
      snapshot: null,
      multiChain: null,
      attestationWeight: 0,
      attestationCount: 0,
      uniqueAttestationCounterparties: 0,
      repeatedPairRatio: 0,
      propagatedTrustScore: 0,
      trustAnomalyScore: 0
    });
    const storedInput = profile.scoreModelVersion === ARC_SCORE_MODEL_VERSION
      ? scoreInputFromUnknown(profile.scoreInputs)
      : null;
    const score = storedInput
      ? arcScoreFromInput(profile.walletAddress, storedInput, profile.scoreCalculatedAt ?? calculatedScore.lastSyncedAt)
      : calculatedScore;
    return {
      profile: {
        ...profile,
        arcScore: score.arcScore,
        riskLevel: score.riskLevel,
        riskFlags: storedInput ? profile.riskFlags : riskFlags,
        activityLevel: storedInput ? profile.activityLevel : activityLevel
      },
      score,
      snapshot: null,
      acceptedAttestations: 0,
      uniqueCounterparties: 0,
      trustGraph: null,
      multiChain: null,
      refreshJob: null
    };
  }
}

export async function listUsers(sort: UserSort = DIRECTORY_DEFAULT_SORT, limit = DIRECTORY_DEFAULT_LIMIT, search = "") {
  const supabase = getSupabaseAdmin();
  const started = Date.now();
  const normalizedSort = normalizeDirectorySort(sort);
  const normalizedLimit = normalizeDirectoryLimit(limit);
  const normalizedSearch = search.trim().toLowerCase();
  const searchBase = normalizedSearch.replace(/\.(?:kyro|arcid)$/i, "");
  const searchTerm = normalizedSearch.replace(/[%,]/g, "");
  const searchBaseTerm = searchBase.replace(/[%,]/g, "");
  console.log("[arc-identity] directory_fetch_started", { claimedOnly: true, sort: normalizedSort, limit: normalizedLimit, hasSearch: Boolean(normalizedSearch) });
  const dbStarted = Date.now();
  let query = supabase
    .from("profiles")
    .select("*")
    .not("username", "is", null);
  if (searchTerm) {
    const clauses = [
      `username.ilike.%${searchTerm}%`,
      searchBaseTerm && searchBaseTerm !== searchTerm ? `username.ilike.%${searchBaseTerm}%` : "",
      `wallet_address.ilike.%${searchTerm}%`
    ].filter(Boolean).join(",");
    query = query.or(clauses);
  }
  const { data, error } = await query;
  const dbDuration = Date.now() - dbStarted;
  console.log("[arc-identity] users_db_duration", { durationMs: dbDuration });
  if (error) {
    console.warn("[arc-identity] directory_fetch_failed", { durationMs: Date.now() - started, error: error.message });
    throw error;
  }

  const claimedProfiles = (data ?? []).filter((row) => {
    if (!(typeof row.username === "string" && row.username.length > 0)) return false;
    if (isGeneratedDirectoryUsername(row.username)) return false;
    if (!normalizedSearch) return true;
    const username = row.username.toLowerCase();
    const usernameBase = username.replace(/\.(?:kyro|arcid)$/i, "");
    const wallet = String(row.wallet_address ?? "").toLowerCase();
    return username.includes(normalizedSearch) || username.includes(searchBase) || usernameBase.includes(searchBase) || wallet.includes(normalizedSearch);
  });
  console.log("[arc-identity] directory query result", { totalRows: data?.length ?? 0, claimedRows: claimedProfiles.length });

  const enrichmentStarted = Date.now();
  const directoryWallets = claimedProfiles.map((row) => normalizeWallet(row.wallet_address));
  const [latestScoreRows, latestGlobalRows, latestChainRows] = await Promise.all([
    getLatestScoreRefreshRows(directoryWallets),
    getLatestGlobalProfileRows(directoryWallets),
    getLatestChainSnapshotRows(directoryWallets)
  ]);
  const rows = claimedProfiles.map((row) => {
    const profile = profileFromRow(row);
    const storedInput = versionedProfileScoreInput(profile);
    const walletKey = normalizeWallet(profile.walletAddress);
    const globalRow = latestGlobalRows.get(walletKey) ?? null;
    const chainSnapshots = latestChainRows.get(walletKey) ?? [];
    const arcChain = chainSnapshots.find((chain) => chain.chain === "Arc Testnet") ?? null;
    const canonicalTotalTx = storedInput?.indexedTx ?? Math.max(Number(globalRow?.total_tx_count ?? 0), profile.txCount, chainSnapshots.reduce((sum, chain) => sum + Number(chain.txCount ?? 0), 0));
    const indexedChainNames = chainSnapshots.filter((chain) => chain.status === "indexed" && chain.txCount > 0).map((chain) => chain.chain);
    const derivedActiveChains = Array.from(new Set([...(Array.isArray(globalRow?.active_chains) ? globalRow.active_chains : []), ...profile.indexedChains, ...indexedChainNames])).filter(Boolean);
    const canonicalActiveChains = storedInput ? profile.indexedChains : derivedActiveChains;
    const canonicalGlobalAge = storedInput?.walletAgeDays ?? Math.max(Number(globalRow?.global_wallet_age_days ?? 0), profile.globalWalletAgeDays, chainSnapshots.reduce((max, chain) => Math.max(max, chain.walletAgeDays), 0));
    const canonicalArcAge = storedInput?.arcWalletAgeDays ?? Math.max(profile.arcWalletAgeDays, arcChain?.walletAgeDays ?? 0);
    const canonicalScore = getCanonicalDirectoryScore(profile, latestScoreRows.get(normalizeWallet(profile.walletAddress)) ?? null);
    const { score: calculatedScore, riskFlags, activityLevel } = buildArcScore(profile, {
      snapshot: arcChain ? {
        id: `directory-arc-${profile.walletAddress}`,
        walletAddress: profile.walletAddress,
        txCount: arcChain.txCount,
        volume: 0,
        counterparties: arcChain.uniqueCounterparties,
        counterpartyAddresses: arcChain.counterpartyAddresses,
        activeDays: arcChain.activeDays,
        recentActivityCount: arcChain.recentActivityCount,
        walletAgeDays: arcChain.walletAgeDays,
        activityFrequency: arcChain.walletAgeDays > 0 ? arcChain.txCount / arcChain.walletAgeDays : 0,
        transferCount: arcChain.txCount,
        contractInteractionCount: arcChain.contractInteractions,
        indexerSource: arcChain.providerSource,
        calculatedScore: 0,
        latestBlock: 0,
        nativeBalance: arcChain.nativeBalance,
        lastActivityAt: arcChain.lastSeenAt,
        createdAt: arcChain.indexedAt
      } : null,
      multiChain: null,
      attestationWeight: 0,
      attestationCount: 0,
      uniqueAttestationCounterparties: 0,
      repeatedPairRatio: 0,
      propagatedTrustScore: 0,
      trustAnomalyScore: 0
    });
    const score = storedInput
      ? arcScoreFromInput(profile.walletAddress, storedInput, profile.scoreCalculatedAt ?? calculatedScore.lastSyncedAt)
      : calculatedScore;
    const cachedArcScore = canonicalScore.score ?? score.arcScore;
    const cachedRiskLevel = canonicalScore.riskLevel || score.riskLevel;
    const directoryScoreUpdatedAt = canonicalScore.updatedAt ?? globalRow?.updated_at ?? profile.updatedAt;
    const directoryScoreSource = canonicalScore.source;
    console.log("[arc-identity] directory_score_source_selected", {
      wallet: profile.walletAddress,
      username: profile.username,
      score: cachedArcScore,
      source: directoryScoreSource,
      scoreUpdatedAt: directoryScoreUpdatedAt
    });
    console.log("[arc-identity] score_snapshot_read_directory", {
      wallet: profile.walletAddress,
      username: profile.username,
      score: cachedArcScore,
      updatedAt: directoryScoreUpdatedAt
    });
    const directoryIdentity = {
      profile: {
        ...profile,
        arcScore: cachedArcScore,
        riskLevel: cachedRiskLevel,
        riskFlags: profile.riskFlags.length ? profile.riskFlags : riskFlags,
        activityLevel: profile.activityLevel || activityLevel,
        txCount: canonicalTotalTx,
        globalWalletAgeDays: canonicalGlobalAge,
        arcWalletAgeDays: canonicalArcAge,
        activeChainCount: canonicalActiveChains.length,
        indexedChains: canonicalActiveChains
      },
      profileUrl: profile.username ? profileRouteFor(profile.username) : undefined,
      score: { ...score, arcScore: cachedArcScore, riskLevel: cachedRiskLevel },
      username: profile.username,
      wallet: profile.walletAddress,
      riskLevel: cachedRiskLevel,
      globalWalletAgeDays: canonicalGlobalAge,
      activeChains: canonicalActiveChains,
      totalTx: canonicalTotalTx,
      scoreValue: cachedArcScore,
      scoreUpdatedAt: directoryScoreUpdatedAt,
      scoreSource: directoryScoreSource,
      snapshot: arcChain ? {
        id: `directory-arc-${profile.walletAddress}`,
        walletAddress: profile.walletAddress,
        txCount: arcChain.txCount,
        volume: 0,
        counterparties: arcChain.uniqueCounterparties,
        activeDays: arcChain.activeDays,
        counterpartyAddresses: arcChain.counterpartyAddresses,
        recentActivityCount: arcChain.recentActivityCount,
        walletAgeDays: arcChain.walletAgeDays,
        activityFrequency: arcChain.walletAgeDays > 0 ? arcChain.txCount / arcChain.walletAgeDays : 0,
        transferCount: arcChain.txCount,
        contractInteractionCount: arcChain.contractInteractions,
        indexerSource: arcChain.providerSource,
        calculatedScore: 0,
        latestBlock: 0,
        nativeBalance: arcChain.nativeBalance,
        lastActivityAt: arcChain.lastSeenAt,
        createdAt: arcChain.indexedAt
      } : null,
      acceptedAttestations: 0,
      uniqueCounterparties: 0,
      trustGraph: null,
      multiChain: {
        walletAddress: profile.walletAddress,
        globalFirstSeenAt: globalRow?.global_first_seen_at ?? null,
        globalWalletAgeDays: canonicalGlobalAge,
        totalTxCount: canonicalTotalTx,
        activeChains: canonicalActiveChains,
        uniqueCounterparties: Number(globalRow?.total_unique_counterparties ?? 0),
        totalContractInteractions: Number(globalRow?.total_contract_interactions ?? 0),
        chains: chainSnapshots
      },
      refreshJob: null
    } as IdentityRecord & Record<string, unknown>;
    const canonical = getCanonicalWalletSnapshot(directoryIdentity);
    const canonicalDirectoryScoreUpdatedAt = canonical.scoreUpdatedAt ?? directoryScoreUpdatedAt;
    const canonicalDirectoryScoreSource = canonical.scoreSource ?? directoryScoreSource;
    console.log("[arc-identity] users_api_score_mapping", {
      wallet: profile.walletAddress,
      username: profile.username,
      score: canonical.arcIdentityScore,
      scoreUpdatedAt: canonicalDirectoryScoreUpdatedAt,
      scoreSource: canonicalDirectoryScoreSource
    });
    return {
      ...directoryIdentity,
      ...canonical,
      score: { ...directoryIdentity.score, arcScore: canonical.arcIdentityScore, riskLevel: canonical.riskLevel },
      scoreValue: canonical.arcIdentityScore,
      scoreUpdatedAt: canonicalDirectoryScoreUpdatedAt,
      scoreSource: canonicalDirectoryScoreSource
    } as IdentityRecord & Record<string, unknown>;
  });
  console.log("[arc-identity] users_enrichment_duration", { durationMs: Date.now() - enrichmentStarted, mode: "lightweight_profile_only" });
  const sorted = rows.sort((a, b) => {
    if (normalizedSort === "activity") return (b.profile.txCount) - (a.profile.txCount);
    if (normalizedSort === "newest") return new Date(b.profile.createdAt).getTime() - new Date(a.profile.createdAt).getTime();
    if (normalizedSort === "risk") return a.profile.riskFlags.length - b.profile.riskFlags.length || b.score.arcScore - a.score.arcScore;
    return b.score.arcScore - a.score.arcScore;
  }).slice(0, normalizedLimit);
  console.log("[arc-identity] directory_fetch_success", { durationMs: Date.now() - started, count: rows.length });
  console.log("[arc-identity] directory_fetch_duration", { durationMs: Date.now() - started });
  console.log("[arc-identity] directory_result_count", { count: sorted.length, totalClaimed: rows.length });
  console.log("[arc-identity] users_count", { count: sorted.length, totalClaimed: rows.length });
  console.log("[arc-identity] users_total_duration", { durationMs: Date.now() - started });

  return sorted;
}

export async function listAttestations(wallet: string) {
  const rows = await listAttestationRows(wallet);
  const supabase = getSupabaseAdmin();
  const wallets = Array.from(new Set(rows.flatMap((row) => [normalizeWallet(row.from_wallet), normalizeWallet(row.to_wallet)])));
  const { data: profileRows } = wallets.length ? await supabase.from("profiles").select("*").in("wallet_address", wallets) : { data: [] };
  const profiles = new Map((profileRows ?? []).map((row) => [normalizeWallet(row.wallet_address), profileFromRow(row)]));
  return rows.map((row) => attestationFromRow(row, profiles));
}

export async function listTrustConnections(wallet: string) {
  const rows = (await listAttestationRows(wallet)).filter(isVerifiedAttestationRow);
  const normalized = normalizeWallet(wallet);
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const from = normalizeWallet(row.from_wallet);
    const to = normalizeWallet(row.to_wallet);
    const counterparty = from === normalized ? to : from;
    grouped.set(counterparty, [...(grouped.get(counterparty) ?? []), row]);
  }

  const wallets = Array.from(grouped.keys());
  if (wallets.length === 0) return [];
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from("profiles").select("*").in("wallet_address", wallets);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const profile = profileFromRow(row);
    return { profile, attestations: (grouped.get(normalizeWallet(profile.walletAddress)) ?? []).map((item) => attestationFromRow(item)) };
  });
}
export async function listReputationEvents(wallet: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("reputation_events")
    .select("*")
    .eq("wallet_address", normalizeWallet(wallet))
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map(eventFromRow);
}

function hasMultichainAttestationEligibility(identity: IdentityRecord | null) {
  if (!identity) return false;
  return (
    (identity.multiChain?.totalTxCount ?? 0) >= 5 ||
    (identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays ?? 0) >= 30 ||
    (identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount ?? 0) >= 1 ||
    identity.score.arcScore >= 10 ||
    (identity.profile.verifiedWallet && Boolean(identity.refreshJob ? identity.refreshJob.status === "committed" || identity.refreshJob.status === "failed" : identity.profile.updatedAt))
  );
}

function attestationEligibilityError(label: "Connected wallet" | "Counterparty") {
  return `${label} needs indexed activity before creating verified attestations. Refresh intelligence first.`;
}

function senderTrustMultiplier(score: number) {
  if (score < 40) return 0.5;
  if (score < 70) return 1;
  return 1.5;
}

function diminishingMultiplier(pairHistoryCount: number) {
  if (pairHistoryCount <= 0) return 1;
  if (pairHistoryCount === 1) return 0.7;
  if (pairHistoryCount === 2) return 0.4;
  return 0.1;
}

function normalizeInteractionType(value: unknown): InteractionType {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (allowedInteractionTypes.has(normalized as InteractionType)) return normalized as InteractionType;
  throw new Error(`Unsupported interaction type: ${String(value ?? "") || "missing"}. Allowed values: ${Array.from(allowedInteractionTypes).join(", ")}`);
}

function postgresErrorDetails(error: any) {
  if (!error) return null;
  return {
    message: error.message ?? String(error),
    code: error.code ?? null,
    details: error.details ?? null,
    hint: error.hint ?? null,
    constraint: error.constraint ?? null
  };
}

function logAttestationPersistence(step: string, payload: Record<string, unknown>, error?: unknown) {
  const serializedError = postgresErrorDetails(error) ?? (error instanceof Error ? { message: error.message, name: error.name } : error ? { message: String(error) } : null);
  console.log("[arc-identity] attestation persistence", {
    step,
    ...payload,
    ...(serializedError ? { error: serializedError } : {})
  });
}

function throwPersistenceError(step: string, table: string, payload: Record<string, unknown>, error: unknown): never {
  logAttestationPersistence(step, { table, payload }, error);
  const details = postgresErrorDetails(error);
  const message = details?.message ?? (error instanceof Error ? error.message : String(error));
  throw new Error(`Attestation persistence failed during ${step} on ${table}: ${message}`);
}

export async function createAttestation(fromWallet: string, toWallet: string, txHash: string, interactionType: InteractionType = "payment") {
  const from = normalizeWallet(fromWallet);
  const to = normalizeWallet(toWallet);
  const type = normalizeInteractionType(interactionType);
  if (!from || !to) throw new Error("Connected wallet and counterparty are required");
  if (!txHash) throw new Error("Transaction hash required");
  if (from === to) throw new Error("Self-attestation is not allowed");

  const supabase = getSupabaseAdmin();
  const [fromIdentity, toIdentity] = await Promise.all([
    getIdentityByWallet(from, false),
    getIdentityByWallet(to, false)
  ]);
  const fromSnapshot = fromIdentity?.snapshot ?? null;
  const fromProfile = fromIdentity?.profile ?? null;
  const toProfile = toIdentity?.profile ?? null;
  if (!fromProfile?.verifiedWallet || !fromProfile.username) throw new Error("Connected wallet must have a verified claimed profile");
  if (!toProfile?.verifiedWallet || !toProfile.username) throw new Error("Counterparty must have a verified claimed profile");
  const senderScore = fromIdentity!.score.arcScore;
  if (!hasMultichainAttestationEligibility(fromIdentity)) throw new Error(attestationEligibilityError("Connected wallet"));
  if (!hasMultichainAttestationEligibility(toIdentity)) throw new Error(attestationEligibilityError("Counterparty"));

  const verifiedTx = await verifyArcTransaction({ txHash, fromWallet: from, counterpartyWallet: to });
  logAttestationPersistence("verified_tx", {
    txHash: verifiedTx.txHash,
    fromWallet: from,
    toWallet: to,
    blockNumber: verifiedTx.blockNumber,
    txValue: verifiedTx.value,
    chainId: verifiedTx.chainId
  });
  const { data: duplicate, error: duplicateError } = await supabase
    .from("attestations")
    .select("id")
    .eq("tx_hash", verifiedTx.txHash)
    .limit(1);
  if (duplicateError) throwPersistenceError("checking_duplicate_attestation", "attestations", { txHash: verifiedTx.txHash }, duplicateError);
  if ((duplicate ?? []).length > 0) throw new Error("Duplicate attestation: this transaction has already been used for Kyro reputation");

  const since = new Date(Date.now() - rateLimitMs).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from("attestations")
    .select("id")
    .or(`and(from_wallet.eq.${from},to_wallet.eq.${to}),and(from_wallet.eq.${to},to_wallet.eq.${from})`)
    .gte("created_at", since)
    .limit(1);
  if (recentError) throwPersistenceError("checking_pair_rate_limit", "attestations", { fromWallet: from, toWallet: to, since }, recentError);
  if ((recent ?? []).length > 0) throw new Error("This wallet pair already has a verified transaction attestation in the last 24 hours");

  const previous = (await listAttestationRows(from)).filter(isVerifiedAttestationRow);
  const pairHistoryCount = previous.filter((row) => {
    const rowFrom = normalizeWallet(row.from_wallet);
    const rowTo = normalizeWallet(row.to_wallet);
    return (rowFrom === from && rowTo === to) || (rowFrom === to && rowTo === from);
  }).length;
  const diversityMultiplier = pairHistoryCount === 0 ? 1 : 0.65;
  const trustMultiplier = senderTrustMultiplier(senderScore);
  const sizeMultiplier = scoreTransactionSize(verifiedTx.value);
  const walletAgeMultiplier = Math.min(1.25, 0.75 + Math.min(fromSnapshot?.walletAgeDays ?? 0, 60) / 120);
  const weight = Math.round(diminishingMultiplier(pairHistoryCount) * diversityMultiplier * trustMultiplier * sizeMultiplier * walletAgeMultiplier * 100) / 100;

  const attestationPayload = {
    from_wallet: from,
    to_wallet: to,
    type,
    weight,
    sender_score_at: senderScore,
    pair_history_count: pairHistoryCount,
    tx_hash: verifiedTx.txHash,
    tx_block_number: verifiedTx.blockNumber,
    tx_timestamp: verifiedTx.timestamp,
    tx_value: verifiedTx.value,
    verified_participants: verifiedTx.participants,
    verified_transaction: true,
    chain_id: verifiedTx.chainId
  };
  logAttestationPersistence("inserting_attestation", { table: "attestations", payload: attestationPayload });
  let { data, error } = await supabase
    .from("attestations")
    .insert(attestationPayload)
    .select("*")
    .single();
  if (error) throwPersistenceError("inserting_attestation", "attestations", attestationPayload, error);
  logAttestationPersistence("attestation_inserted", { table: "attestations", attestationId: data.id, txHash: verifiedTx.txHash });

  const reputationEventPayload = [
    { wallet_address: from, event_type: "transaction_attestation_sent", score_delta: 0, metadata: { fromUsername: fromProfile.username, toUsername: toProfile.username, toWallet: to, weight, pairHistoryCount, txHash: verifiedTx.txHash, txValue: verifiedTx.value, type } },
    { wallet_address: to, event_type: "transaction_attestation_received", score_delta: 0, metadata: { fromUsername: fromProfile.username, toUsername: toProfile.username, fromWallet: from, weight, senderScoreAt: senderScore, pairHistoryCount, txHash: verifiedTx.txHash, txValue: verifiedTx.value, type } }
  ];
  logAttestationPersistence("inserting_reputation_event", { table: "reputation_events", payload: reputationEventPayload });
  const { error: reputationError } = await supabase.from("reputation_events").insert(reputationEventPayload);
  if (reputationError) {
    logAttestationPersistence("reputation_event_insert_failed", { table: "reputation_events", payload: reputationEventPayload }, reputationError);
  } else {
    logAttestationPersistence("reputation_event_inserted", { table: "reputation_events", txHash: verifiedTx.txHash });
  }

  const attestation = attestationFromRow(data, new Map([[from, fromProfile], [to, toProfile]]));
  logAttestationPersistence("creating_trust_edge", { table: "trust_edges", txHash: verifiedTx.txHash, fromWallet: from, toWallet: to });
  try {
    await upsertTrustEdgeFromAttestation(attestation);
    logAttestationPersistence("trust_edge_created", { table: "trust_edges", txHash: verifiedTx.txHash, fromWallet: from, toWallet: to });
  } catch (trustError) {
    logAttestationPersistence("trust_edge_failed_nonfatal", { table: "trust_edges", txHash: verifiedTx.txHash, fromWallet: from, toWallet: to }, trustError);
  }
  try {
    await upsertTrustConnection(from, to);
  } catch (connectionError) {
    logAttestationPersistence("legacy_trust_connection_failed_nonfatal", { table: "trust_connections", txHash: verifiedTx.txHash, fromWallet: from, toWallet: to }, connectionError);
  }
  void Promise.all([refreshWalletProfile(from), refreshWalletProfile(to)]).catch((refreshError) => {
    logAttestationPersistence("profile_refresh_failed_nonfatal", { txHash: verifiedTx.txHash, fromWallet: from, toWallet: to }, refreshError);
  });
  logAttestationPersistence("completed", { attestationId: data.id, txHash: verifiedTx.txHash, fromWallet: from, toWallet: to });
  return attestation;
}

async function upsertTrustConnection(walletA: string, walletB: string) {
  const supabase = getSupabaseAdmin();
  const [a, b] = [normalizeWallet(walletA), normalizeWallet(walletB)].sort();
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("trust_connections")
    .select("id,interaction_count")
    .eq("wallet_a", a)
    .eq("wallet_b", b)
    .maybeSingle();
  if (data) {
    await supabase.from("trust_connections").update({ interaction_count: Number(data.interaction_count ?? 0) + 1, last_interaction_at: now }).eq("id", data.id);
    return;
  }
  await supabase.from("trust_connections").insert({ wallet_a: a, wallet_b: b, interaction_count: 1, last_interaction_at: now });
}

