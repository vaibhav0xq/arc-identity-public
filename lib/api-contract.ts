import { NextResponse } from "next/server";
import type { ChainSnapshot, IdentityRecord, InteractionGraph, Profile, TrustGraph } from "@/lib/types";
import { isProviderCoverageRestriction } from "@/lib/chain-status";

export const publicNoStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
};

/* Canonical implementation lives in lib/wallet-validation (F-03); this
   re-export keeps the many existing route imports stable. */
export { isValidWalletAddress } from "@/lib/wallet-validation";

export function publicApiError(error: string, message: string, status = 500, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, message, ...extra }, { status, headers: publicNoStoreHeaders });
}

export function sanitizeRefreshError(value?: string | null) {
  if (!value) return null;
  return "Some wallet intelligence is temporarily unavailable. Cached data is still safe to use.";
}

function publicSource(source?: string | null) {
  const normalized = (source ?? "").toLowerCase();
  if (!normalized) return "unavailable";
  if (normalized.includes("live") || normalized.includes("rpc")) return "arc_rpc";
  if (normalized.includes("verified") || normalized.includes("attestation")) return "verified_attestation_context";
  if (normalized.includes("unavailable")) return "unavailable";
  // Keep the standing provider-plan limitation label distinct so clients can tell a
  // permanent coverage gap apart from a transient failure after sanitization.
  if (normalized === "limited_provider_required") return "limited_provider_required";
  if (normalized.includes("limited") || normalized.includes("not_configured") || normalized.includes("error")) return "limited_coverage";
  return "cached_wallet_intelligence";
}

function publicCoverageMessage(status?: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "indexed") return null;
  if (normalized === "no_activity") return null;
  return "Some chain data is temporarily unavailable.";
}

export function sanitizeChainSnapshot(chain: ChainSnapshot): ChainSnapshot {
  return {
    ...chain,
    counterpartyAddresses: [],
    providerSource: publicSource(chain.providerSource),
    errorMessage: publicCoverageMessage(chain.status)
  };
}

export function sanitizeCanonicalSnapshot<T extends Record<string, any>>(snapshot: T): T {
  const chainRows = Array.isArray(snapshot.chainRows) ? snapshot.chainRows.map(sanitizeChainSnapshot) : snapshot.chainRows;
  const indexedChains = Array.isArray(snapshot.indexedChains) ? snapshot.indexedChains.map(sanitizeChainSnapshot) : snapshot.indexedChains;
  return {
    ...snapshot,
    chainRows,
    indexedChains,
    providerStatuses: Array.isArray(snapshot.providerStatuses)
      ? snapshot.providerStatuses.map((item: any) => ({
        chain: item.chain,
        status: item.status,
        message: publicCoverageMessage(item.status)
      }))
      : snapshot.providerStatuses,
    arcBalanceSource: publicSource(snapshot.arcBalanceSource),
    arcDataFreshness: snapshot.arcDataFreshness === "live" ? "live" : snapshot.arcDataFreshness === "unavailable" ? "unavailable" : "cached",
    arcProviderStatus: snapshot.arcProviderStatus === "unavailable" ? "unavailable" : snapshot.arcProviderStatus ? "available" : snapshot.arcProviderStatus,
    refreshError: sanitizeRefreshError(snapshot.refreshError)
  };
}

export function sanitizeUserProfile(profile: Profile): Profile {
  return { ...profile, signature: null, scoreInputs: null };
}

export function sanitizeIdentityRecord(identity: IdentityRecord): IdentityRecord {
  return {
    ...identity,
    profile: sanitizeUserProfile(identity.profile),
    snapshot: identity.snapshot ? { ...identity.snapshot, counterpartyAddresses: [], indexerSource: publicSource(identity.snapshot.indexerSource) } : identity.snapshot,
    multiChain: identity.multiChain ? {
      ...identity.multiChain,
      chains: identity.multiChain.chains.map(sanitizeChainSnapshot)
    } : identity.multiChain,
    refreshJob: identity.refreshJob ? {
      ...identity.refreshJob,
      errorMessage: sanitizeRefreshError(identity.refreshJob.errorMessage)
    } : identity.refreshJob
  };
}

/* The trust graph is deliberately public — verified relationships are the
   product. What stays private is the fraud-detection internals: per-anomaly
   evidence details and the list of third-party wallets flagged as suspicious. */
export function sanitizeTrustGraph(graph: TrustGraph): TrustGraph;
export function sanitizeTrustGraph(graph: TrustGraph | null): TrustGraph | null;
export function sanitizeTrustGraph(graph: TrustGraph | null): TrustGraph | null {
  if (!graph) return graph;
  return {
    ...graph,
    anomalies: graph.anomalies.map((anomaly) => ({
      ...anomaly,
      details: {},
      suspiciousWallets: []
    }))
  };
}

/* Unlike Trust Graph, Interaction Graph contains only saved counterparty
   addresses, saved per-counterparty stats, and coverage metadata. Keep its
   public shape deliberately narrow: it must never inherit raw provider
   errors, and stored native-wei sums stay withheld until the value
   capability ships. */
export function sanitizeInteractionGraph(graph: InteractionGraph): InteractionGraph {
  return {
    walletAddress: graph.walletAddress,
    nodes: graph.nodes.map((node) => {
      const publicNode: InteractionGraph["nodes"][number] = {
        walletAddress: node.walletAddress,
        username: node.username,
        profileUrl: node.profileUrl,
        registered: node.registered,
        verifiedKyroPeer: node.verifiedKyroPeer,
        chains: node.chains.map((chain) => ({
          chain: chain.chain,
          chainId: chain.chainId,
          explorerUrl: chain.explorerUrl
        })),
        /* C1b: explicit field-by-field copy — the stored evidence behind this
           object carries native wei sums that must never serialize until the
           value capability ships, so no spread is allowed here. */
        metrics: node.metrics ? {
          transactionCount: {
            total: node.metrics.transactionCount.total,
            in: node.metrics.transactionCount.in,
            out: node.metrics.transactionCount.out
          },
          firstInteractionAt: node.metrics.firstInteractionAt,
          lastInteractionAt: node.metrics.lastInteractionAt,
          lowerBound: node.metrics.lowerBound,
          basis: {
            counted: node.metrics.basis.counted,
            pending: node.metrics.basis.pending,
            unavailable: node.metrics.basis.unavailable
          }
        } : null
      };
      /* C2: rank is allowlisted explicitly and only when the ranked read
         attached it — default responses must never gain the key. */
      return node.rank === undefined ? publicNode : { ...publicNode, rank: node.rank };
    }),
    summary: { ...graph.summary },
    coverage: {
      ...graph.coverage,
      chains: graph.coverage.chains.map((chain) => ({
        chain: chain.chain,
        chainId: chain.chainId,
        status: chain.status,
        counterpartyCount: chain.counterpartyCount,
        indexedAt: chain.indexedAt,
        source: chain.source,
        historyCapped: chain.historyCapped,
        recencyReliable: chain.recencyReliable,
        transientIssue: chain.transientIssue,
        standingLimitation: chain.standingLimitation
      }))
    },
    pagination: { ...graph.pagination },
    capabilities: { ...graph.capabilities },
    explanations: [...graph.explanations]
  };
}

export function sanitizeCoverageIssues(chains: ChainSnapshot[] = []) {
  return chains
    .filter((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured")
    .map((chain) => ({
      chain: chain.chain,
      status: chain.status === "error" ? "limited" : chain.status,
      message: "Some chain data is temporarily unavailable.",
      // A standing limitation is a known provider-plan coverage gap (e.g. BNB Chain
      // needs a paid explorer plan). It is permanent until the plan changes, so the
      // UI should not raise a fresh partial-coverage warning on every refresh for it.
      standing: chain.status === "limited" && (chain.providerSource === "limited_provider_required" || isProviderCoverageRestriction(chain.errorMessage))
    }));
}
