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
  sectionLabel = "ARC Identity",
  title = "Connect your wallet to access ARC Identity.",
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
      ? "Claim your ARC Identity to continue."
      : error
        ? "Could not verify wallet connection."
        : title;

  const cardDescription = checking
    ? "Preparing your ARC Identity session."
    : unclaimed
      ? "Claim a username to activate your public ARC Identity."
      : error
        ? identity.error ?? "We could not complete this step. Retry or reconnect your wallet."
        : description;

  return (
    <section className="fade-in py-10">
      <div className="mb-10">
        <p className="arc-section-label">ARC Identity</p>
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white lg:text-5xl">{sectionLabel}</h1>
      </div>

      <div className="arc-surface rounded-2xl p-8 text-left text-slate-300 shadow-panel">
        <p className="arc-section-label">ARC Identity setup</p>
        <h2 className="mt-3 max-w-3xl text-2xl font-extrabold text-white sm:text-3xl">{cardTitle}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{cardDescription}</p>
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
