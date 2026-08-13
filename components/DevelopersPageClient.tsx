"use client";

import { ApiKeysPanel } from "@/components/ApiKeysPanel";
import { DeveloperApiDemo } from "@/components/DeveloperApiDemo";
import { WalletGate } from "@/components/WalletGate";

export function DevelopersPageClient() {
  return (
    <WalletGate
      sectionLabel="Developer tools"
      eyebrow="Developer API / tools"
      sub="Run live lookups against the v1 API and manage your API keys."
      title="Connect your wallet to use the developer tools."
      description="The documentation above is public. Connecting a wallet unlocks the live endpoint demo and API key management."
      unlocks={["Live endpoint demo", "API key management"]}
    >
      <section className="min-w-0" aria-labelledby="dev-tools-title">
        <div className="border-b border-linec pb-6">
          <p className="kicker">Developer API / tools</p>
          <h2 id="dev-tools-title" className="mt-2 font-heading text-3xl font-semibold text-ink">
            Live demo and API keys
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-mutedc">
            Try real reads against the v1 API and create keys for the 120 units/minute budget. Keys are invite-only
            during beta and are shown once at creation.
          </p>
        </div>
        <div className="mt-8 min-w-0">
          <DeveloperApiDemo />
          <ApiKeysPanel />
        </div>
      </section>
    </WalletGate>
  );
}
