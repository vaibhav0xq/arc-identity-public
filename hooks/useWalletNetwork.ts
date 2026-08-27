"use client";

/* Tracks which network the connected wallet is currently on. Advisory only:
   Kyro scores a fixed chain set server side and personal_sign verification
   works from any network, so nothing here ever blocks a flow. When the
   provider cannot be resolved or refuses eth_chainId the hook reports null
   and consumers render nothing rather than guessing. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  discoverInjectedWallets,
  providerKey,
  providerName,
  safeWalletIcon,
  type DetectedWallet,
  type Eip1193Provider
} from "@/lib/wallet-discovery";
import {
  describeWalletNetwork,
  parseChainId,
  switchTarget,
  type WalletNetworkInfo
} from "@/lib/wallet-network";

type EventfulProvider = Eip1193Provider & {
  on?: (event: string, listener: (payload: unknown) => void) => void;
  removeListener?: (event: string, listener: (payload: unknown) => void) => void;
};

function dismissalKey(chainId: number) {
  return `arcNetworkNoticeDismissed:${chainId}`;
}

export function useWalletNetwork() {
  const [wallet, setWallet] = useState("");
  const [wallets, setWallets] = useState<DetectedWallet[]>([]);
  const [network, setNetwork] = useState<WalletNetworkInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [switchNote, setSwitchNote] = useState("");
  const providerRef = useRef<EventfulProvider | null>(null);

  const applyChainId = useCallback((raw: unknown) => {
    const chainId = parseChainId(raw);
    if (chainId === null) {
      setNetwork(null);
      return;
    }
    setNetwork(describeWalletNetwork(chainId));
    try {
      setDismissed(sessionStorage.getItem(dismissalKey(chainId)) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  /* Connected wallet address, kept in sync with the connect button's
     localStorage contract. */
  useEffect(() => {
    function sync() {
      setWallet(localStorage.getItem("arcIdentityWallet") ?? "");
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("arc-identity-wallet-changed", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("arc-identity-wallet-changed", sync);
    };
  }, []);

  /* Passive provider discovery, same shape as WalletConnectButton. */
  useEffect(() => {
    const eip6963Wallets = new Map<string, DetectedWallet>();
    function refresh() {
      setWallets(discoverInjectedWallets(Array.from(eip6963Wallets.values())));
    }
    function onAnnounce(event: WindowEventMap["eip6963:announceProvider"]) {
      const detail = event.detail;
      if (!detail?.provider) return;
      const id = detail.info?.uuid || detail.info?.rdns || providerKey(detail.provider, detail.info?.name ?? "eip6963");
      eip6963Wallets.set(id, {
        id,
        name: detail.info?.name || providerName(detail.provider),
        provider: detail.provider,
        rdns: detail.info?.rdns,
        source: "eip6963",
        icon: safeWalletIcon(detail.info?.icon)
      });
      refresh();
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    refresh();
    const timer = window.setTimeout(refresh, 500);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  /* Resolve the provider the user connected with, then follow its network.
     The name stored at connect time must identify exactly one discovered
     wallet; failing that we fall back only to a sole discovered wallet,
     otherwise we stay silent instead of reading some other wallet's chain. */
  useEffect(() => {
    if (!wallet) {
      providerRef.current = null;
      setNetwork(null);
      setSwitchNote("");
      return;
    }
    let cancelled = false;
    const storedName = (localStorage.getItem("arcIdentityWalletProvider") ?? "").trim().toLowerCase();
    /* Generic names like "Browser Wallet" can describe several injected
       providers at once. Picking one arbitrarily could read another
       wallet's chain and aim the switch request at a wallet the user never
       connected, so an ambiguous match resolves to nothing. */
    const nameMatches = storedName
      ? wallets.filter(
          (item) =>
            providerName(item.provider).toLowerCase() === storedName ||
            item.name.trim().toLowerCase() === storedName
        )
      : [];
    const match =
      nameMatches.length === 1
        ? nameMatches[0]
        : nameMatches.length === 0 && wallets.length === 1
          ? wallets[0]
          : undefined;
    const provider = (match?.provider ?? null) as EventfulProvider | null;
    providerRef.current = provider;
    if (!provider) {
      setNetwork(null);
      return;
    }
    function onChainChanged(payload: unknown) {
      if (!cancelled) applyChainId(payload);
    }
    function readChain() {
      provider
        ?.request({ method: "eth_chainId" })
        .then((raw) => {
          if (!cancelled) applyChainId(raw);
        })
        .catch(() => {
          if (!cancelled) setNetwork(null);
        });
    }
    readChain();
    provider.on?.("chainChanged", onChainChanged);
    /* Some wallets never emit chainChanged; re-read when the tab regains
       focus so a manual in-wallet switch is still picked up. */
    function onFocus() {
      readChain();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      provider.removeListener?.("chainChanged", onChainChanged);
      window.removeEventListener("focus", onFocus);
    };
  }, [wallet, wallets, applyChainId]);

  const switchToEthereum = useCallback(async () => {
    const provider = providerRef.current;
    if (!provider || switching) return;
    setSwitching(true);
    setSwitchNote("");
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: switchTarget.chainIdHex }]
      });
      /* chainChanged usually follows; re-read for wallets that skip it. */
      const raw = await provider.request({ method: "eth_chainId" }).catch(() => null);
      if (raw !== null) applyChainId(raw);
    } catch (error) {
      const code = (error as { code?: number } | null)?.code;
      if (code !== 4001) {
        setSwitchNote("Automatic switching is unavailable in this wallet. Change the network inside the wallet itself.");
      }
    } finally {
      setSwitching(false);
    }
  }, [applyChainId, switching]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    const chainId = network?.chainId;
    if (typeof chainId === "number") {
      try {
        sessionStorage.setItem(dismissalKey(chainId), "1");
      } catch {
        /* Session storage unavailable; the in-memory dismissal still holds. */
      }
    }
  }, [network]);

  return {
    connected: Boolean(wallet),
    network,
    dismissed,
    dismiss,
    switching,
    switchNote,
    switchToEthereum
  };
}
