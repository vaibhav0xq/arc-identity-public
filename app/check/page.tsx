import type { Metadata } from "next";
import { ArcShell } from "@/components/ArcShell";
import { KyroCheckClient } from "@/components/KyroCheckClient";

export const metadata: Metadata = {
  title: "Counterparty Check | Kyro",
  description:
    "Enter a wallet or Kyro username, pick what you're about to do and get Kyro's verdict: allow, caution or block, with the evidence behind it."
};

export default function CheckPage() {
  return (
    <ArcShell>
      <div className="fade-in mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6 lg:px-8">
        <header className="pb-6 pt-6 sm:pb-8 sm:pt-8">
          <p className="kicker">Decision Engine / Counterparty Check</p>
          <h1 className="mt-3 max-w-3xl font-heading text-3xl font-semibold text-ink sm:text-4xl">
            Check before you transact.
          </h1>
          <p className="mt-3 max-w-2xl text-[0.95rem] leading-6 text-mutedc">
            Enter a wallet or Kyro username, pick what you&apos;re about to do and get Kyro&apos;s verdict:
            allow, caution or block, with the evidence behind it.
          </p>
        </header>
        <KyroCheckClient />
      </div>
    </ArcShell>
  );
}
