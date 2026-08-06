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
      <section className="r4-panel">
        <div className="r4-panel-body">
        <p className="kicker">Trust network</p>
        <h2 className="mt-2.5 font-heading text-2xl font-semibold text-ink">No verified connections yet</h2>
        <p className="mt-3 max-w-2xl text-[0.8125rem] leading-relaxed text-mutedc">Your trust network is empty. Verified transaction edges will appear here.</p>
        </div>
      </section>
    );
  }

  const strength = Math.min(100, connections.reduce((sum, item) => sum + item.attestations.length * 14, 0));

  return (
    <section className="r4-panel">
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div>
          <p className="kicker">Trust network</p>
          <h2 className="mt-2.5 font-heading text-2xl font-semibold text-ink">Transaction-verified counterparty graph</h2>
        </div>
        <div className="border-l border-linec pl-4 text-right">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-mutedc">Connections</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{connections.length}</p>
        </div>
      </div>
      <div className="mt-6 arc-bar-track">
        <div className="arc-bar-fill block bg-verified" style={{ width: `${strength}%` }} />
      </div>
      <div className="mt-6">
        {connections.map(({ profile, attestations }) => (
          <Link key={profile.id} href={profile.username ? `/profile/${profile.username}` : "/directory"} className="ledger-row arc-card-hover">
            <span><b>{profile.username ?? "Unclaimed wallet"}</b><small className="font-mono">{shortenAddress(profile.walletAddress)}</small></span>
            <span className="chip green"><span className="dot" />{attestations.length} verified edges</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
