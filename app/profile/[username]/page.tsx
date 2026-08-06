export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { TxLink } from "@/components/TxLink";
import { unstable_noStore as noStore } from "next/cache";
import { ArcShell } from "@/components/ArcShell";
import { ChainCoverageExplorer } from "@/components/ChainCoverageExplorer";
import { DecisionPanel } from "@/components/DecisionPanel";
import { ExplainableReputationCard } from "@/components/ExplainableReputationCard";
import { OnchainActivityCard } from "@/components/OnchainActivityCard";
import { TrustGraphCard } from "@/components/TrustGraphCard";
import { TrustNetwork } from "@/components/TrustNetwork";
import { getIdentityByUsername, listAttestations, listReputationEvents, listTrustConnections } from "@/lib/db";
import { getArcLiveWalletData } from "@/lib/onchain";
import { getBadge } from "@/lib/score";
import { buildExplainableReputation, reputationInputFromIdentity } from "@/lib/explainable-reputation";
import { getTrustGraph } from "@/lib/trust-graph";
import { maybeArcUsername } from "@/lib/username";
import { shortenAddress } from "@/lib/wallet";

type PublicProfilePageProps = {
  params: Promise<{ username: string }>;
};

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  noStore();
  const { username } = await params;
  const normalizedUsername = maybeArcUsername(username);
  console.log("[arc-identity] profile_route_open_attempt", { username, normalizedUsername });
  console.log("[arc-identity] onboarding_profile_fetch_started", { username, normalizedUsername });
  const identity = await getIdentityByUsername(username).catch((error) => {
    console.warn("[arc-identity] onboarding_profile_fetch_failed", {
      username,
      normalizedUsername,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  });
  if (identity) console.log("[arc-identity] onboarding_profile_fetch_success", { username: identity.profile.username, wallet: identity.profile.walletAddress });
  if (identity) console.log("[arc-identity] score_snapshot_read_profile", { username: identity.profile.username, wallet: identity.profile.walletAddress, score: identity.score.arcScore, updatedAt: identity.profile.updatedAt });
  if (!identity) {
    console.warn("[arc-identity] profile_route_not_found_reason", { username, normalizedUsername, reason: normalizedUsername ? "no_profile_row" : "invalid_username" });
    return (
      <ArcShell>
        <section className="mx-auto flex min-h-[60vh] max-w-3xl items-center py-12">
          <div className="arc-surface w-full rounded-[2px] p-8 text-center sm:p-10">
            <p className="arc-section-label">Profile not found</p>
             <h1 className="mt-4 text-3xl font-semibold text-ink">This profile could not be found.</h1>
             <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-mutedc">
              This username is not registered yet. Claimed identities render immediately with initial wallet intelligence while enrichment runs in the background.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">Claim username</Link>
              <Link href="/directory" className="arc-button-secondary px-5 py-3 text-sm font-bold">View directory</Link>
            </div>
          </div>
        </section>
      </ArcShell>
    );
  }

  const [attestations, events, trustConnections, trustGraph, liveArc] = await Promise.all([
    listAttestations(identity.profile.walletAddress),
    listReputationEvents(identity.profile.walletAddress),
    listTrustConnections(identity.profile.walletAddress),
    getTrustGraph(identity.profile.walletAddress),
    getArcLiveWalletData(identity.profile.walletAddress, 3500)
  ]);
  const explainableReputation = buildExplainableReputation(reputationInputFromIdentity(identity, attestations));
  const arcChain = identity.multiChain?.chains.find((chain) => chain.chain.toLowerCase().includes("arc")) ?? null;

  return (
    <ArcShell>
      <section className="fade-in min-w-0 space-y-5 py-4 sm:py-6">
        <section className="public-hero">
          <div className="min-w-0">
            <p className="kicker text-[#b8bdb2]">{identity.profile.verifiedWallet ? "PUBLIC WALLET CREDENTIAL / SIGNATURE VERIFIED" : "PUBLIC WALLET CREDENTIAL"}</p>
            <h1 className="mt-4 break-words font-heading text-5xl font-semibold leading-[.9] tracking-[-.06em] text-bone sm:text-7xl">{identity.profile.username}</h1>
            <p className="mt-5 break-all font-mono text-xs text-[#b8bdb2] sm:text-sm">{identity.profile.walletAddress}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className={`chip ${/high risk|anomaly/i.test(identity.score.riskLevel) ? "rose" : /review|required|unproven/i.test(identity.score.riskLevel) ? "amber" : identity.score.arcScore > 75 ? "green" : "amber"}`}><span className="dot" />{/protected review required/i.test(getBadge(identity.score.arcScore)) ? "Review recommended" : getBadge(identity.score.arcScore)}</span>
              <span className="font-mono text-xs text-[#b8bdb2]">{identity.score.riskLevel} · confidence {(Math.max(0, Math.min(100, trustGraph.metrics.trustConfidence)) / 100).toFixed(2)}</span>
            </div>
          </div>
          <div className="public-score">
            <span className="kicker">IDENTITY SCORE</span>
            <strong>{identity.score.arcScore}</strong>
          </div>
        </section>

        <section className="r4-panel">
          <div className="r4-panel-head"><span>What this credential says</span><span className="font-mono text-xs text-mutedc">{identity.score.modelVersion.replace(/^arc_score_/, "score model ")}</span></div>
          <div className="r4-panel-body">
            <div className="grid gap-x-8 sm:grid-cols-2">
              <div className="ledger-row"><span><b>Wallet history</b><small>Observed wallet maturity</small></span><span className="font-mono text-xs text-mutedc">{identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays} days</span></div>
              <div className="ledger-row"><span><b>Trust network</b><small>Transaction-verified counterparties</small></span><span className="font-mono text-xs text-mutedc">{trustGraph.metrics.trustedPeerCount} edges</span></div>
              <div className="ledger-row"><span><b>Attestations</b><small>Signed interactions indexed</small></span><span className="font-mono text-xs text-mutedc">{identity.acceptedAttestations} current</span></div>
              <div className="ledger-row"><span><b>Chain coverage</b><small>Indexed network footprint</small></span><span className="font-mono text-xs text-mutedc">{identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount} networks</span></div>
            </div>
          </div>
        </section>
        <section className="r4-panel">
          <div className="r4-panel-head"><span>Attestation history</span><span className="font-mono text-xs text-mutedc">{attestations.length} records</span></div>
          <div className="r4-panel-body">
            {attestations.length === 0 ? <p className="py-3 text-sm text-mutedc">No transaction-backed attestations yet.</p> : attestations.slice(0, 5).map((item) => (
              <div key={item.id} className="ledger-row">
                <span><b>{item.fromUsername ?? shortenAddress(item.fromWallet)} · {item.type.replaceAll("_", " ")}</b><small>Transaction-backed · value {item.txValue}</small></span>
                <span className="chip green"><span className="dot" />Verified</span>
              </div>
            ))}
          </div>
        </section>
        <section className="r4-panel">
          <div className="r4-panel-head"><span>Chain coverage</span><span className="font-mono text-xs text-mutedc">{identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount} networks indexed</span></div>
          <div className="r4-panel-body overflow-x-auto">
            {(identity.multiChain?.chains ?? []).length === 0 ? <p className="text-sm text-mutedc">Chain coverage is still being indexed.</p> : (
              <table className="coverage-table">
                <thead><tr><th>Network</th><th>Activity</th><th>Wallet age</th><th>Status</th></tr></thead>
                <tbody>{identity.multiChain?.chains.slice(0, 6).map((chain) => (
                  <tr key={`${chain.chain}-${chain.chainId}`}><td className="font-semibold text-ink">{chain.chain}</td><td className="font-mono text-mutedc">{chain.txCount} tx</td><td className="font-mono text-mutedc">{chain.walletAgeDays} days</td><td><span className={`chip ${chain.status === "indexed" ? "green" : "amber"}`}><span className="dot" />{chain.status}</span></td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </section>
        <div className="flex flex-col justify-between gap-2 border-y border-linec py-3 font-mono text-[0.65rem] text-mutedc sm:flex-row">
          <span>Score model {identity.score.modelVersion.replace(/^arc_score_/, "")} · refreshed {new Date(identity.score.lastSyncedAt).toLocaleString()}</span>
          <span>Issued by Arc Identity</span>
        </div>

        <div className="grid min-w-0 gap-7">
          <ExplainableReputationCard
            wallet={identity.profile.walletAddress}
            arcId={identity.profile.username}
            initialReputation={explainableReputation}
          />
           <section className="r4-panel">
             <div className="r4-panel-head"><span>Wallet intelligence context</span><span className="font-mono text-xs text-mutedc">supporting signals</span></div>
             <div className="r4-panel-body">
             <p className="mt-2 text-sm leading-6 text-mutedc">Global wallet intelligence provides maturity and coverage context. Arc-native activity, verified attestations and trust graph strength drive Identity Score.</p>
            <div className="mt-5 grid gap-x-8 sm:grid-cols-3">
               <div className="border-t border-linec py-4"><p className="kicker">Wallet maturity</p><p className="mt-2 font-heading text-3xl text-ink">{identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays}d</p></div>
               <div className="border-t border-linec py-4"><p className="kicker">Indexed chain coverage</p><p className="mt-2 font-heading text-3xl text-ink">{identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount}</p></div>
               <div className="border-t border-linec py-4"><p className="kicker">Global activity context</p><p className="mt-2 font-heading text-3xl text-ink">{identity.multiChain?.totalTxCount ?? 0}</p></div>
            </div>
            </div>
          </section>
          <ChainCoverageExplorer chains={identity.multiChain?.chains ?? []} />
          <DecisionPanel score={identity.score} trustGraph={trustGraph} />
          <OnchainActivityCard
            onchain={identity.snapshot}
            arcChain={arcChain}
            liveArc={{
              balance: liveArc.balance,
              balanceFormatted: liveArc.balance == null ? "Not available" : liveArc.balance === 0 ? "0.000 USDC" : `${liveArc.balance.toLocaleString("en-US", { maximumFractionDigits: liveArc.balance < 1 ? 6 : 3 })} USDC`,
              balanceSource: liveArc.source,
              balanceUpdatedAt: liveArc.updatedAt,
              dataFreshness: liveArc.providerStatus === "live" ? "live" : "unavailable",
              providerStatus: liveArc.providerStatus,
              latestBlock: liveArc.latestBlock
            }}
          />
          <TrustGraphCard graph={trustGraph} title="Public Trust Network" />
           <section className="r4-panel">
             <div className="r4-panel-head"><span>Transaction attestations</span><span className="font-mono text-xs text-mutedc">{identity.acceptedAttestations} accepted</span></div>
            <div className="r4-panel-body">
              {attestations.length === 0 ? <p className="text-mutedc">No transaction-backed attestations yet.</p> : attestations.slice(0, 5).map((item) => (
                 <div key={item.id} className="ledger-row text-sm text-ink">
                  <span><b>{item.fromUsername ?? shortenAddress(item.fromWallet)} to {item.toUsername ?? shortenAddress(item.toWallet)}</b><small>{item.type.replaceAll("_", " ")} · value {item.txValue} · trust weight {item.weight}</small><TxLink txHash={item.txHash} className="mt-2" /></span>
                  <span className="chip green"><span className="dot" />Verified</span>
                </div>
              ))}
            </div>
          </section>
           <section className="r4-panel">
             <div className="r4-panel-head"><span>Reputation timeline</span><span className="font-mono text-xs text-mutedc">recent events</span></div>
            <div className="r4-panel-body">
              {events.length === 0 ? <p className="text-mutedc">No reputation events yet.</p> : events.slice(0, 5).map((event) => (
                 <div key={event.id} className="ledger-row text-sm text-ink">
                   <span><b>{typeof event.metadata.fromUsername === "string" || typeof event.metadata.toUsername === "string" ? [event.metadata.fromUsername, event.metadata.toUsername].filter(Boolean).join(" to ") : event.eventType.replaceAll("_", " ")}</b></span><span className="font-mono text-xs text-mutedc">{new Date(event.createdAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </section>
          <TrustNetwork connections={trustConnections} />
        </div>
      </section>
    </ArcShell>
  );
}




