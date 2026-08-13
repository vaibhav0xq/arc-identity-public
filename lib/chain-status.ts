import type { ChainStatus } from "@/lib/types";

/* NOTE: deliberately does NOT match the synthetic "Provider access required"
   placeholder that the read/cache-fallback layers assign to limited rows with
   no stored message — a placeholder is not evidence of a real plan
   restriction, and matching it would fabricate standing=true coverage gaps
   from rows whose limitation cause is unknown. */
const coverageRestrictionPattern = /free api access is not supported|full chain coverage|upgrade your api plan|paid plan|paid etherscan coverage|unsupported free-tier|chain unavailable on current plan|current plan|bsctrace|meganode|explorer coverage restriction|requires paid/i;

export function isProviderCoverageRestriction(message?: unknown) {
  if (message == null) return false;
  return coverageRestrictionPattern.test(String(message));
}

/* Phase 0 coverage correctness: transient provider failures (timeouts,
   aborts, rate limits, network faults, 5xx/429) are retry-worthy one-off
   events and must never read as a standing coverage gap. Plan-coverage
   restrictions are standing by definition and always classify as NOT
   transient, whatever their wording. */
const transientProviderPattern = /timed out|timeout|abort|rate limit|max calls per sec|too many requests|fetch failed|network|econn|socket hang|http 5\d\d|http 429|provider unavailable/i;

/* Single source of truth for the per-action history fetch cap. Providers
   return at most this many rows per action; counts derived from a capped
   fetch are floors, never totals. */
export const HISTORY_FETCH_LIMIT = 1000;

export function isTransientProviderError(message?: unknown) {
  if (message == null) return false;
  if (isProviderCoverageRestriction(message)) return false;
  return transientProviderPattern.test(String(message));
}

/* History-cap inference for chain snapshot rows written before the
   coverage-metadata migration (raw_result_count NULL): a deduped tx_count at
   or above the per-action fetch cap proves rows were dropped by the cap;
   below it the cap state is unknowable (dedup can shrink a capped fetch
   under the cap), so the answer is null (unknown) — never false. */
export function inferHistoryCappedFromTxCount(txCount: number | null | undefined, historyLimit: number): true | null {
  const count = Number(txCount ?? 0);
  return Number.isFinite(count) && count >= historyLimit ? true : null;
}

export function normalizeChainStatus(input: {
  status?: string | null;
  txCount?: number | null;
  errorMessage?: string | null;
  providerSource?: string | null;
  chainName?: string | null;
  noActivity?: boolean;
  missingConfig?: boolean;
}): ChainStatus {
  const status = String(input.status ?? "").toLowerCase();
  const txCount = Number(input.txCount ?? 0);
  const message = input.errorMessage ?? "";
  const provider = input.providerSource ?? "";
  const chainName = input.chainName ?? "";

  if (input.missingConfig || status === "not_configured") return "not_configured";
  if (status === "limited" || provider === "limited_provider_required" || isProviderCoverageRestriction(message)) return "limited";
  if (status === "error" && txCount === 0 && chainName === "BNB Chain" && (!provider || provider === "unknown" || provider === "etherscan_v2")) return "limited";
  if (status === "error" && txCount === 0 && chainName === "Base" && (!provider || provider === "unknown" || provider === "etherscan_v2")) return "limited";
  if (status === "indexed" || txCount > 0) return "indexed";
  if (status === "no_activity" || input.noActivity) return "no_activity";
  return "error";
}