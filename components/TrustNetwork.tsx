import Link from "next/link";
import type { Attestation, Profile } from "@/lib/types";
import { shortenAddress } from "@/lib/wallet";

type TrustProfile = {
  profile: Profile;
  attestations: Attestation[];
};

export function TrustNetwork({ connections = [] }: { connections?: TrustProfile[] }) {
  if (connections.length === 0) {
    return (
      <section className="arc-surface rounded-2xl p-7">
        <p className="arc-section-label">Trust network</p>
        <h2 className="mt-2.5 text-2xl font-extrabold text-white">No verified connections yet</h2>
        <p className="mt-3 max-w-2xl text-[0.8125rem] leading-relaxed text-slate-400">Your trust network is empty. Verified transaction edges will appear here.</p>
      </section>
    );
  }

  const strength = Math.min(100, connections.reduce((sum, item) => sum + item.attestations.length * 14, 0));

  return (
    <section className="arc-surface rounded-2xl p-7">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="arc-section-label">Trust network</p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-white">Transaction-verified counterparty graph</h2>
        </div>
        <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-right">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Connections</p>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-white">{connections.length}</p>
        </div>
      </div>
      <div className="mt-6 arc-bar-track">
        <div className="arc-bar-fill block bg-gradient-to-r from-emerald-300 via-cyan-300 to-sky-300" style={{ width: `${strength}%` }} />
      </div>
      <div className="mt-6 grid gap-3.5 sm:grid-cols-3">
        {connections.map(({ profile, attestations }) => (
          <Link key={profile.id} href={profile.username ? `/profile/${profile.username}` : "/directory"} className="arc-card-hover rounded-xl border border-white/[0.06] bg-white/[0.025] p-5">
            <p className="font-extrabold text-white">{profile.username ?? "Unclaimed wallet"}</p>
            <p className="mt-0.5 text-sm font-medium text-slate-400">{shortenAddress(profile.walletAddress)}</p>
            <p className="mt-3 text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-slate-500">{attestations.length} verified edges</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
