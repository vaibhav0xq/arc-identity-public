"use client";

/* Advisory strip shown under the chrome header when the connected wallet
   sits on a network Kyro does not read. Renders nothing while disconnected,
   while the chain is unknown or on every supported network, so the common
   path costs no layout. Never blocks: signatures verify from any chain. */

import { useWalletNetwork } from "@/hooks/useWalletNetwork";
import { kyroNetworkList, switchTarget } from "@/lib/wallet-network";

export function WalletNetworkNotice() {
  const { connected, network, dismissed, dismiss, switching, switchNote, switchToEthereum } = useWalletNetwork();

  if (!connected || !network || network.supported || dismissed) return null;

  return (
    <div id="wallet-network-notice" role="status" className="border-b border-[#d9c9a4] bg-[#f0e3c8]/70">
      <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <span className="whitespace-nowrap font-mono text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-[#9a6e2b]">
          Network notice
        </span>
        <p className="min-w-0 flex-1 basis-64 text-[0.8rem] leading-5 text-[#6d5524]">
          <span className="font-bold text-ink">Your wallet is on {network.label}, a network Kyro does not read.</span>{" "}
          Reputation draws from {kyroNetworkList()}. Signing still works from any network, so nothing is blocked.
        </p>
        <div className="flex flex-none items-center gap-2">
          <button
            type="button"
            onClick={() => void switchToEthereum()}
            disabled={switching}
            className="rounded-[2px] bg-[#252827] px-3 py-1.5 text-[0.7rem] font-bold text-[#f2eee3] transition-colors duration-150 hover:bg-black disabled:opacity-60"
          >
            {switching ? "Check your wallet..." : `Switch to ${switchTarget.name}`}
          </button>
          <button
            type="button"
            onClick={dismiss}
            className="rounded-[2px] border border-[#c9b58a] px-2.5 py-1.5 text-[0.7rem] font-bold text-[#7c5f22] transition-colors duration-150 hover:bg-[#e9dcbb]"
          >
            Dismiss
          </button>
        </div>
        {switchNote ? (
          <p className="w-full text-[0.72rem] leading-5 text-[#8c4a3f]">{switchNote}</p>
        ) : null}
      </div>
    </div>
  );
}
