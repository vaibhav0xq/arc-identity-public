import Link from "next/link";
import type { ArcScore, Profile, ScoreExplanations, WalletActivitySnapshot } from "@/lib/types";
import { ScoreRing } from "@/components/ScoreRing";
import { getBadge } from "@/lib/score";
import { shortenAddress } from "@/lib/wallet";

const breakdownLabels = [
  ["Chain Coverage Context", "activityScore", "crossChainActivity"],
  ["Wallet Maturity", "longevityScore", "globalWalletAge"],
  ["Verified Counterparties", "counterpartyDiversityScore", "counterpartyDiversity"],
  ["Arc Activity", "balanceSignalScore", "arcActivity"],
  ["Verified Attestations", "attestationScore", "verifiedAttestations"],
  ["Global Activity Context", "consistencyScore", "indexedChainDepth"]
] as const;

export function ProfilePanel({
  profile,
  score,
  onchain,
  explanations
}: {
  profile: Profile;
  score: ArcScore;
  onchain?: WalletActivitySnapshot | null;
  explanations?: ScoreExplanations;
}) {
  return (
    <section className="grid gap-6 lg:grid-cols-[1.05fr_1.45fr]">
      <div className="arc-surface rounded-2xl p-8">
        <div className="flex flex-col items-center gap-6 text-center">
          <ScoreRing score={score.arcScore} />
          <div>
            <p className="arc-section-label">
              {profile.username}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold text-white">{getBadge(score.arcScore)}</h1>
            <div className="mt-4 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-left text-xs leading-relaxed text-emerald-50/80">
              <p className="font-extrabold text-emerald-100">ARC Identity Score model</p>
              <p className="mt-1">
                ARC Score is primarily based on Arc ecosystem activity, verified attestations, and trust graph strength. Global wallet maturity and chain coverage provide supporting confidence signals.
              </p>
            </div>
            <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2 text-sm font-medium text-slate-300">
              {shortenAddress(profile.walletAddress)}
            </p>
          </div>
          <div className="grid w-full grid-cols-2 gap-3.5">
            <div className="arc-metric-card">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Risk level</p>
              <p className="mt-2.5 font-extrabold text-white">{score.riskLevel}</p>
            </div>
            <Link
              href={`/profile/${profile.username}`}
              className="arc-metric-card !border-emerald-300/15 !bg-emerald-300/[0.06] text-left transition hover:!border-emerald-300/30 hover:!bg-emerald-300/[0.08]"
            >
              <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-100/70">Public profile</p>
              <p className="mt-2.5 font-extrabold text-emerald-100">Open identity</p>
            </Link>
          </div>
          <div className="grid w-full grid-cols-3 gap-3.5 text-left">
            <div className="arc-metric-card">
              <p className="text-[0.6875rem] font-medium text-slate-400">Trend</p>
              <p className={profile.scoreTrend >= 0 ? "mt-2 font-extrabold text-emerald-200" : "mt-2 font-extrabold text-rose-200"}>{profile.scoreTrend >= 0 ? "+" : ""}{profile.scoreTrend}</p>
            </div>
            <div className="arc-metric-card">
              <p className="text-[0.6875rem] font-medium text-slate-400">Activity</p>
              <p className="mt-2 font-extrabold text-white">{profile.activityLevel}</p>
            </div>
            <div className="arc-metric-card">
              <p className="text-[0.6875rem] font-medium text-slate-400">Risk flags</p>
              <p className="mt-2 font-extrabold tabular-nums text-white">{profile.riskFlags.length}</p>
            </div>
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {breakdownLabels.map(([label, key, explanationKey]) => (
          <div key={key} className="arc-surface arc-card-hover rounded-xl p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-extrabold text-white">{label}</h2>
              <span className="text-2xl font-extrabold tabular-nums text-emerald-200">{score[key]}</span>
            </div>
            <div className="mt-5 arc-bar-track">
              <div className="arc-bar-fill block" style={{ width: `${score[key]}%` }} />
            </div>
            <p className="mt-4 text-[0.8125rem] leading-relaxed text-slate-400">
{explanations?.[explanationKey] ?? "Not enough indexed data yet."}
            </p>
          </div>
        ))}
        <div className="arc-surface rounded-xl !bg-[rgba(244,63,94,0.06)] !border-rose-400/15 p-6 shadow-panel sm:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-extrabold text-rose-100">Risk Penalty</h2>
            <span className="text-2xl font-extrabold tabular-nums text-rose-300">-{score.riskPenalty}</span>
          </div>
          <p className="mt-3 text-[0.8125rem] leading-relaxed text-rose-200/80">
            {explanations?.riskPenalty ?? (profile.riskFlags.length ? profile.riskFlags.join(", ") : "No current risk flags from the wallet intelligence engine.")}
          </p>
        </div>
      </div>
    </section>
  );
}

