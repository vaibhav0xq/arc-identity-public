import type { ChainStatus } from "@/lib/types";

const coverageRestrictionPattern = /free api access is not supported|full chain coverage|upgrade your api plan|paid plan|paid etherscan coverage|unsupported free-tier|chain unavailable on current plan|current plan|provider access required|bsctrace|meganode|explorer coverage restriction|requires paid/i;

export function isProviderCoverageRestriction(message?: unknown) {
  if (message == null) return false;
  return coverageRestrictionPattern.test(String(message));
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