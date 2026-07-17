export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { ArcShell } from "@/components/ArcShell";
import { ChainCoverageExplorer } from "@/components/ChainCoverageExplorer";
import { DecisionPanel } from "@/components/DecisionPanel";
import { ExplainableReputationCard } from "@/components/ExplainableReputationCard";
import { OnchainActivityCard } from "@/components/OnchainActivityCard";
import { ScoreRing } from "@/components/ScoreRing";
import { TrustGraphCard } from "@/components/TrustGraphCard";
import { TrustNetwork } from "@/components/TrustNetwork";
import { getIdentityByUsername, listAttestations, listReputationEvents, listTrustConnections } from "@/lib/db";
import { getArcLiveWalletData } from "@/lib/onchain";
import { getBadge, getRecommendedAction } from "@/lib/score";
import { buildExplainableReputation, reputationInputFromIdentity } from "@/lib/explainable-reputation";
import { buildScoreExplanations } from "@/lib/score-explanations";
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
          <div className="arc-surface w-full rounded-2xl p-8 text-center sm:p-10">
            <p className="arc-section-label">Profile not found</p>
            <h1 className="mt-4 text-3xl font-extrabold text-white">This profile could not be found.</h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">
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
  const explorer = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL;
  const explanations = buildScoreExplanations(identity);
  const explainableReputation = buildExplainableReputation(reputationInputFromIdentity(identity, attestations));
  const arcChain = identity.multiChain?.chains.find((chain) => chain.chain.toLowerCase().includes("arc")) ?? null;

  return (
    <ArcShell>
      <section className="fade-in grid min-w-0 gap-7 py-6 sm:py-8 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="arc-surface min-w-0 rounded-2xl p-5 sm:p-8 xl:sticky xl:top-28 xl:self-start">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">Public profile</p>
          <h1 className="mt-2 break-words text-3xl font-black text-white sm:text-4xl">{identity.profile.username}</h1>
          <p className="mt-3 inline-flex max-w-full rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300">{shortenAddress(identity.profile.walletAddress)}</p>
          <div className="mt-8 flex flex-col items-center gap-5 text-center">
            <ScoreRing score={identity.score.arcScore} />
            <div>
              <p className="text-xl font-bold text-white">{getBadge(identity.score.arcScore)}</p>
              <p className="mt-2 text-slate-400">{identity.score.riskLevel}</p>
              <p className="mt-2 text-sm text-emerald-100">{identity.profile.verifiedWallet ? "Signature verified" : "Wallet not verified"}</p>
            </div>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-slate-400">Score trend</p>
              <p className={identity.profile.scoreTrend >= 0 ? "text-xl font-black text-emerald-200" : "text-xl font-black text-rose-200"}>{identity.profile.scoreTrend >= 0 ? "+" : ""}{identity.profile.scoreTrend}</p>
            </div>
            <div className="rounded border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs text-slate-400">Activity level</p>
              <p className="text-xl font-black text-white">{identity.profile.activityLevel}</p>
            </div>
          </div>
          <div className="mt-6 rounded border border-emerald-300/25 bg-emerald-300/10 p-5">
            <p className="text-sm text-emerald-100/70">Recommended action</p>
            <p className="mt-2 text-2xl font-black text-emerald-100">{getRecommendedAction(identity.score.arcScore)}</p>
          </div>
          {identity.profile.riskFlags.length ? <div className="mt-4 rounded border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">Risk flags: {identity.profile.riskFlags.join(", ")}</div> : null}
          {explorer ? <Link href={`${explorer.replace(/\/$/, "")}/address/${identity.profile.walletAddress}`} className="mt-4 inline-flex w-full justify-center rounded border border-white/10 px-4 py-3 font-bold text-white transition hover:bg-white/10 sm:w-auto">View on ArcScan</Link> : null}
        </div>
        <div className="grid min-w-0 gap-7">
          <ExplainableReputationCard
            wallet={identity.profile.walletAddress}
            arcId={identity.profile.username}
            initialReputation={explainableReputation}
          />
          <section className="arc-surface rounded-2xl p-5 sm:p-7">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Wallet intelligence context</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Global wallet intelligence provides maturity and coverage context. Arc-native activity, verified attestations, and trust graph strength drive ARC Score.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded border border-white/10 bg-white/[0.045] p-4"><p className="text-xs text-slate-400">Wallet Maturity</p><p className="mt-2 text-xl font-black text-white">{identity.multiChain?.globalWalletAgeDays ?? identity.profile.globalWalletAgeDays}d</p></div>
              <div className="rounded border border-white/10 bg-white/[0.045] p-4"><p className="text-xs text-slate-400">Indexed Chain Coverage</p><p className="mt-2 text-xl font-black text-white">{identity.multiChain?.activeChains.length ?? identity.profile.activeChainCount}</p></div>
              <div className="rounded border border-white/10 bg-white/[0.045] p-4"><p className="text-xs text-slate-400">Global Activity Context</p><p className="mt-2 text-xl font-black text-white">{identity.multiChain?.totalTxCount ?? 0}</p></div>
            </div>
          </section>
          <ChainCoverageExplorer chains={identity.multiChain?.chains ?? []} />
          <section className="arc-surface rounded-2xl p-5 sm:p-7">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Score Explainability</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ["Wallet Maturity", explanations.globalWalletAge],
                ["Chain Coverage Context", explanations.crossChainActivity],
                ["Verified Counterparties", explanations.counterpartyDiversity],
                ["Arc Activity", explanations.arcActivity],
                ["Global Activity Context", explanations.indexedChainDepth],
                ["Verified Attestations", explanations.verifiedAttestations],
                ["Risk Penalty", explanations.riskPenalty]
              ].map(([label, explanation]) => (
                <div key={label} className="rounded border border-white/10 bg-white/[0.045] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{explanation}</p>
                </div>
              ))}
            </div>
          </section>
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
          <section className="arc-surface rounded-2xl p-5 sm:p-7">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Transaction attestations</p>
            <p className="mt-2 text-3xl font-black text-white">{identity.acceptedAttestations}</p>
            <div className="mt-4 grid gap-3">
              {attestations.length === 0 ? <p className="text-slate-400">No transaction-backed attestations yet.</p> : attestations.slice(0, 5).map((item) => (
                <div key={item.id} className="rounded border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-300">
                  <p className="break-words">{item.fromUsername ?? shortenAddress(item.fromWallet)} to {item.toUsername ?? shortenAddress(item.toWallet)} - {item.type.replaceAll("_", " ")} - verified by transaction - value {item.txValue} - trust weight {item.weight}</p>
                  {item.txHash && explorer ? <Link href={`${explorer.replace(/\/$/, "")}/tx/${item.txHash}`} className="mt-2 inline-flex text-emerald-200 underline decoration-emerald-300/40 underline-offset-4">View transaction</Link> : null}
                </div>
              ))}
            </div>
          </section>
          <section className="arc-surface rounded-2xl p-7">
            <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Reputation timeline</p>
            <div className="mt-4 grid gap-3">
              {events.length === 0 ? <p className="text-slate-400">No reputation events yet.</p> : events.slice(0, 5).map((event) => (
                <div key={event.id} className="rounded border border-white/10 bg-white/[0.045] p-4 text-sm text-slate-300">
                  <span className="font-bold text-white">{typeof event.metadata.fromUsername === "string" || typeof event.metadata.toUsername === "string" ? [event.metadata.fromUsername, event.metadata.toUsername].filter(Boolean).join(" to ") : event.eventType.replaceAll("_", " ")}</span> - {new Date(event.createdAt).toLocaleString()}
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




