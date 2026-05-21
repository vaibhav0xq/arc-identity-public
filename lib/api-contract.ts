import { NextResponse } from "next/server";
import type { ChainSnapshot, IdentityRecord } from "@/lib/types";

export const publicNoStoreHeaders = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate"
};

export function isValidWalletAddress(wallet: string | null | undefined) {
  return /^0x[a-f0-9]{40}$/.test((wallet ?? "").trim().toLowerCase());
}

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

export function sanitizeIdentityRecord(identity: IdentityRecord): IdentityRecord {
  return {
    ...identity,
    snapshot: identity.snapshot ? { ...identity.snapshot, indexerSource: publicSource(identity.snapshot.indexerSource) } : identity.snapshot,
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

export function sanitizeCoverageIssues(chains: ChainSnapshot[] = []) {
  return chains
    .filter((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured")
    .map((chain) => ({
      chain: chain.chain,
      status: chain.status === "error" ? "limited" : chain.status,
      message: "Some chain data is temporarily unavailable."
    }));
}
