"use client";

import Link from "next/link";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { useArcIdentity } from "@/hooks/useArcIdentity";

type WalletGateProps = {
  children: React.ReactNode;
  requireClaimed?: boolean;
  sectionLabel?: string;
  title?: string;
  description?: string;
};

export function WalletGate({
  children,
  requireClaimed = false,
  sectionLabel = "Kyro",
  title = "Connect your wallet to access Kyro.",
  description = "Connect your wallet to continue."
}: WalletGateProps) {
  const { identity, refreshIdentity } = useArcIdentity();

  if (identity.status === "claimed") return <>{children}</>;
  if (!requireClaimed && identity.status === "unclaimed") return <>{children}</>;

  const checking = identity.status === "checking";
  const disconnected = identity.status === "disconnected";
  const error = identity.status === "error";
  const unclaimed = identity.status === "unclaimed";

  const cardTitle = checking
    ? "Checking wallet connection..."
    : unclaimed
      ? "Claim your Kyro to continue."
      : error
        ? "Could not verify wallet connection."
        : title;

  const cardDescription = checking
    ? "Preparing your Kyro session."
    : unclaimed
      ? "Claim a username to activate your public Kyro."
      : error
        ? identity.error ?? "We could not complete this step. Retry or reconnect your wallet."
        : description;

  return (
    <section className="fade-in py-8 lg:py-12">
      <div className="mb-8 lg:mb-10">
        <p className="kicker">Kyro</p>
        <h1 className="mt-3 text-5xl tracking-[-0.055em] text-ink lg:text-6xl">{sectionLabel}</h1>
      </div>

      <div className="r4-panel max-w-3xl pt-5 text-left text-mutedc lg:pt-7">
        <p className="kicker">Kyro setup</p>
        <h2 className="mt-3 max-w-3xl text-3xl tracking-[-0.04em] text-ink sm:text-4xl">{cardTitle}</h2>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-mutedc">{cardDescription}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {disconnected ? <WalletConnectButton /> : null}
          {unclaimed ? (
            <Link href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">
              Claim username
            </Link>
          ) : null}
          {error ? (
            <button type="button" onClick={() => void refreshIdentity(identity.normalizedWallet)} className="arc-button-secondary px-5 py-3 text-sm font-bold">
              Retry wallet check
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
