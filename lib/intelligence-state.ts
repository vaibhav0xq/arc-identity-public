import type { ChainSnapshot, IdentityRecord, WalletActivitySnapshot } from "@/lib/types";
import { isProviderCoverageRestriction } from "@/lib/chain-status";

export type IntelligenceState =
  | "unconnected"
  | "unclaimed"
  | "baseline_fresh"
  | "indexing"
  | "indexed"
  | "provider_unavailable"
  | "partial_indexed"
  | "error_retryable";

type ScoreLike = {
  refreshInProgress?: boolean | null;
  refreshFailed?: boolean | null;
  refreshStatus?: string | null;
  providerErrors?: unknown[] | null;
  totalTxCount?: number | null;
  activeChains?: unknown[] | null;
  indexedChains?: ChainSnapshot[] | null;
  arcProviderStatus?: string | null;
};

export function isActiveRefreshStatus(status?: string | null) {
  return status === "started" || status === "indexing_chains" || status === "recomputing_score";
}

export function deriveIntelligenceState(input: {
  walletConnected?: boolean;
  usernameClaimed?: boolean;
  identity?: IdentityRecord | null;
  score?: ScoreLike | null;
  snapshot?: WalletActivitySnapshot | null;
  chains?: ChainSnapshot[] | null;
}): IntelligenceState {
  if (!input.walletConnected) return "unconnected";
  if (!input.usernameClaimed) return "unclaimed";

  const score = input.score;
  const refreshActive = Boolean(score?.refreshInProgress) || isActiveRefreshStatus(score?.refreshStatus);
  if (refreshActive) return "indexing";
  if (score?.refreshFailed) return "error_retryable";

  const chains = input.chains ?? score?.indexedChains ?? input.identity?.multiChain?.chains ?? [];
  const indexedChains = chains.filter((chain) => chain.status === "indexed");
  const unavailableChains = chains.filter((chain) => chain.status === "error" || chain.status === "limited" || chain.status === "not_configured");
  const noActivityChains = chains.filter((chain) => chain.status === "no_activity");
  const providerErrors = score?.providerErrors ?? [];
  const totalTx = Number(score?.totalTxCount ?? input.identity?.multiChain?.totalTxCount ?? input.snapshot?.txCount ?? input.identity?.profile.txCount ?? 0);
  const activeChains = Number(score?.activeChains?.length ?? input.identity?.multiChain?.activeChains.length ?? input.identity?.profile.activeChainCount ?? 0);

  // Standing limitations are permanent provider-plan coverage gaps (e.g. BNB Chain
  // requires a paid explorer plan). They exist on every refresh, so they should not
  // downgrade an otherwise successful refresh to "partial". Transient failures of
  // normally-available chains still do.
  const isStandingLimitation = (chain: ChainSnapshot) =>
    chain.status === "limited" && (chain.providerSource === "limited_provider_required" || isProviderCoverageRestriction(chain.errorMessage));
  const transientUnavailable = unavailableChains.filter((chain) => !isStandingLimitation(chain));
  const actionableProviderErrors = providerErrors.filter((issue) => !(issue && typeof issue === "object" && (issue as { standing?: boolean }).standing === true));

  if (totalTx > 0 || activeChains > 0 || indexedChains.length > 0) {
    return transientUnavailable.length > 0 || actionableProviderErrors.length > 0 ? "partial_indexed" : "indexed";
  }

  if (providerErrors.length > 0 || (unavailableChains.length > 0 && indexedChains.length === 0 && noActivityChains.length === 0) || score?.arcProviderStatus === "unavailable") {
    return "provider_unavailable";
  }

  return "baseline_fresh";
}

export function intelligenceStateCopy(state: IntelligenceState) {
  switch (state) {
    case "unconnected":
      return "Connect a wallet to open Kyro.";
    case "unclaimed":
      return "Claim your Kyro identity to unlock wallet intelligence.";
    case "indexing":
      return "Updating wallet intelligence...";
    case "indexed":
      return "Wallet intelligence is indexed.";
    case "partial_indexed":
      return "Some chain data is temporarily unavailable.";
    case "provider_unavailable":
      return "Some chain data is temporarily unavailable. Using the safest available wallet intelligence.";
    case "error_retryable":
      return "Refresh failed. Cached wallet intelligence remains visible.";
    case "baseline_fresh":
    default:
      return "Fresh wallet detected. ARC Intelligence will update as activity appears.";
  }
}
