"use client";

import Link from "next/link";
import { ConnectGatePanel } from "@/components/ConnectGatePanel";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useArcIdentity } from "@/hooks/useArcIdentity";

type WalletGateProps = {
  children: React.ReactNode;
  requireClaimed?: boolean;
  sectionLabel?: string;
  eyebrow?: string;
  sub?: string;
  title?: string;
  description?: string;
  unlocks?: string[];
  preview?: React.ReactNode;
};

export function WalletGate({
  children,
  requireClaimed = false,
  sectionLabel = "Kyro",
  eyebrow = "Kyro workspace",
  sub,
  title = "Connect your wallet to access Kyro.",
  description = "Connect your wallet to continue.",
  unlocks,
  preview
}: WalletGateProps) {
  const { identity, refreshIdentity } = useArcIdentity();

  if (identity.status === "claimed") return <>{children}</>;
  if (!requireClaimed && identity.status === "unclaimed") return <>{children}</>;

  const checking = identity.status === "checking";
  const disconnected = identity.status === "disconnected";
  const error = identity.status === "error";
  const unclaimed = identity.status === "unclaimed";

  const kicker = checking
    ? "Checking wallet"
    : unclaimed
      ? "Username required"
      : error
        ? "Connection error"
        : "Wallet required";

  const cardTitle = checking
    ? "Checking wallet connection..."
    : unclaimed
      ? "Claim your identity to continue."
      : error
        ? "Could not verify wallet connection."
        : title;

  const cardDescription = checking
    ? "Preparing your identity session."
    : unclaimed
      ? "Claim a username to activate your public identity."
      : error
        ? identity.error ?? "We could not complete this step. Retry or reconnect your wallet."
        : description;

  return (
    <section className="fade-in py-8 lg:py-12">
      <header className="mb-8 lg:mb-10">
        <p className="kicker">{eyebrow}</p>
        <h1 className="mt-3 text-5xl tracking-[-0.055em] text-ink sm:text-7xl">{sectionLabel}</h1>
        {sub ? <p className="mt-4 max-w-2xl text-lg leading-relaxed text-mutedc">{sub}</p> : null}
      </header>

      <ConnectGatePanel
        kicker={kicker}
        title={cardTitle}
        description={cardDescription}
        checking={checking}
        unlocks={unlocks}
        actions={
          <>
            {disconnected ? <WalletConnectButton /> : null}
            {unclaimed ? (
              <Link href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">
                Claim username
              </Link>
            ) : null}
            {error ? (
              <button
                type="button"
                onClick={() => void refreshIdentity(identity.normalizedWallet)}
                className="arc-button-secondary px-5 py-3 text-sm font-bold"
              >
                Retry wallet check
              </button>
            ) : null}
          </>
        }
      />

      {preview ? <div className="mt-7 grid gap-7 lg:mt-8">{preview}</div> : null}
    </section>
  );
}
