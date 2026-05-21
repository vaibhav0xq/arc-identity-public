import type { IdentityRecord } from "@/lib/types";
import { scoreComponentsFromIdentity } from "@/lib/score-contract";

export type ScoreExplanations = {
  globalWalletAge: string;
  crossChainActivity: string;
  counterpartyDiversity: string;
  arcActivity: string;
  indexedChainDepth: string;
  verifiedAttestations: string;
  riskPenalty: string;
};

const missing = "ARC Intelligence will update as Arc ecosystem activity, verified attestations, and trusted counterparties grow.";

export function buildScoreExplanations(identity: IdentityRecord | null): ScoreExplanations {
  if (!identity) {
    return {
      globalWalletAge: missing,
      crossChainActivity: missing,
      counterpartyDiversity: missing,
      arcActivity: missing,
      indexedChainDepth: missing,
      verifiedAttestations: missing,
      riskPenalty: missing
    };
  }

  const multi = identity.multiChain;
  const chains = multi?.chains ?? [];
  const indexedChains = chains.filter((chain) => chain.status === "indexed");
  const limitedChains = chains.filter((chain) => chain.status === "limited");
  const noActivityChains = chains.filter((chain) => chain.status === "no_activity");
  const globalAge = multi?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays ?? 0;
  const totalTx = multi?.totalTxCount ?? 0;
  const uniqueCounterparties = multi?.uniqueCounterparties ?? 0;
  const arcTx = identity.snapshot?.txCount ?? identity.profile.txCount ?? 0;
  const arcCounterparties = identity.snapshot?.counterparties ?? 0;
  const arcActiveDays = identity.snapshot?.activeDays ?? 0;
  const attestationCount = identity.acceptedAttestations ?? 0;
  const attestationCounterparties = identity.uniqueCounterparties ?? 0;
  const riskFlags = identity.profile.riskFlags ?? [];
  const freshWallet = totalTx === 0 && arcTx === 0 && globalAge === 0 && attestationCount === 0 && indexedChains.length === 0;
  const providerLimited = limitedChains.length > 0 || chains.some((chain) => chain.status === "error" || chain.status === "not_configured");
  const components = scoreComponentsFromIdentity(identity);

  return {
    globalWalletAge: globalAge > 0 && multi?.globalFirstSeenAt
      ? components.walletAge.reason
      : freshWallet ? "This wallet appears freshly created." : missing,
    crossChainActivity: totalTx > 0 && (multi?.activeChains.length ?? 0) > 0
      ? `${components.crossChain.reason} ${components.transactionActivity.reason} These global signals remain wallet intelligence context, not the primary ARC Score driver.`
      : providerLimited ? "Provider coverage limited. ARC is showing baseline or cached data until providers recover." : "No indexed activity detected yet.",
    counterpartyDiversity: components.diversity.points > 0
      ? components.diversity.reason
      : "No verified or Arc-native counterparties detected yet.",
    arcActivity: arcTx > 0
      ? `${components.arcActivity.reason} Includes ${arcCounterparties} Arc counterparties and ${arcActiveDays} active days.`
      : "No Arc Testnet activity detected yet. ARC Score is primarily based on Arc ecosystem behavior.",
    indexedChainDepth: chains.length > 0
      ? `${components.transactionActivity.reason} Coverage: ${indexedChains.length} indexed chains, ${limitedChains.length} limited provider, ${noActivityChains.length} no-activity chains. Chain explorer data supports maturity and anti-sybil context while Arc-native behavior drives reputation.`
      : providerLimited ? "Provider coverage limited. Transaction activity is not treated as confirmed zero." : "No indexed transactions detected yet.",
    verifiedAttestations: attestationCount > 0
      ? `${components.attestations.reason} Verified counterparties: ${attestationCounterparties}.`
      : "No verified transaction attestations exist yet.",
    riskPenalty: identity.score.riskPenalty > 0 && riskFlags.length > 0
      ? `Penalty applied because ${riskFlags.join(", ").replaceAll("_", " ")}.`
      : freshWallet ? "No risk penalty is applied while ARC Intelligence initializes." : "No risk penalty is currently applied."
  };
}
