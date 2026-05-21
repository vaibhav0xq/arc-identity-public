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
  sectionLabel = "Wallet required",
  title = "Connect your wallet to access ARC Identity.",
  description = "Wallet connection verifies ownership and unlocks this section."
}: WalletGateProps) {
  const { identity, refreshIdentity } = useArcIdentity();

  if (identity.status === "claimed") return <>{children}</>;
  if (!requireClaimed && identity.status === "unclaimed") return <>{children}</>;

  const checking = identity.status === "checking";
  const disconnected = identity.status === "disconnected";
  const error = identity.status === "error";
  const unclaimed = identity.status === "unclaimed";

  return (
    <section className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center py-10">
      <div className="arc-surface w-full rounded-3xl p-7 text-center shadow-panel sm:p-10">
        <p className="arc-section-label">{checking ? "Checking wallet" : unclaimed ? "Identity required" : error ? "Retry available" : sectionLabel}</p>
        <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">
          {checking
            ? "Checking wallet connection..."
            : unclaimed
              ? "Claim your ARC Identity to continue."
              : error
                ? "Could not verify wallet connection."
                : title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">
          {checking
            ? "Looking for a verified wallet in this browser session."
            : unclaimed
              ? "Wallet ownership is verified. Claim a username to unlock this section."
              : error
                ? identity.error ?? "The wallet lookup did not complete. Retry the check or reconnect your wallet."
                : description}
        </p>
        <div className="mx-auto mt-7 flex max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
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
