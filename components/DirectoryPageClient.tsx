"use client";

import { DirectoryBrowser } from "@/components/DirectoryBrowser";
import { WalletGate } from "@/components/WalletGate";
import type { UserSort } from "@/lib/db";

export function DirectoryPageClient({ sort, limit }: { sort: UserSort; limit: number }) {
  return (
    <WalletGate
      requireClaimed
      sectionLabel="Directory"
      title="Connect your wallet to view the ARC Identity Directory."
      description="Connect your wallet to browse registered ARC identities."
    >
      <section className="fade-in grid gap-6 py-8">
        <div className="max-w-4xl">
          <p className="arc-section-label">Directory</p>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white lg:text-5xl">Registered Arc identities</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-slate-300">Loaded from claimed ARC Identity profiles with lightweight cached reputation context. No unclaimed or placeholder wallets are shown.</p>
        </div>
        <DirectoryBrowser users={[]} currentSort={sort} initialLimit={limit} />
      </section>
    </WalletGate>
  );
}
