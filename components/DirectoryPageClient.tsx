"use client";

import { DirectoryBrowser } from "@/components/DirectoryBrowser";
import { WalletGate } from "@/components/WalletGate";
import type { UserSort } from "@/lib/db";

export function DirectoryPageClient({ sort, limit }: { sort: UserSort; limit: number }) {
  return (
    <WalletGate
      requireClaimed
      sectionLabel="Directory"
      title="Connect your wallet to view the Arc Identity Directory."
      description="Connect your wallet to browse registered Arc identities."
    >
      <section className="fade-in grid gap-7 py-8 lg:gap-8 lg:py-12">
        <DirectoryBrowser users={[]} currentSort={sort} initialLimit={limit} />
      </section>
    </WalletGate>
  );
}
