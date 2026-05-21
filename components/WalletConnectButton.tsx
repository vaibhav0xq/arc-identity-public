"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { shortenAddress } from "@/lib/wallet";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { maybeArcUsername } from "@/lib/username";
import { isIdentityCreatedRevealActive } from "@/lib/onboarding";

declare global {
  interface Window {
    ethereum?: Eip1193Provider & { providers?: Eip1193Provider[] };
    rabby?: Eip1193Provider;
    okxwallet?: Eip1193Provider;
    coinbaseWalletExtension?: { ethereum?: Eip1193Provider } | Eip1193Provider;
    coinbaseWallet?: Eip1193Provider;
  }

  interface WindowEventMap {
    "eip6963:announceProvider": CustomEvent<Eip6963ProviderDetail>;
  }
}

type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
};

type Eip6963ProviderDetail = {
  info?: {
    uuid?: string;
    name?: string;
    icon?: string;
    rdns?: string;
  };
  provider?: Eip1193Provider;
};

type DetectedWallet = {
  id: string;
  name: string;
  provider: Eip1193Provider;
  rdns?: string;
  source: "eip6963" | "injected";
};

type ProfileEnsureResponse = {
  profile: { username: string | null } | null;
};

type ScoreLookupResponse = {
  username: string | null;
};

const identityLookupTimeoutMs = 3000;
const lookupWarningKey = "arcIdentityLookupWarning";

function usernameWalletKey(wallet: string) {
  return `arcIdentityUsernameWallet:${wallet.toLowerCase()}`;
}

function walletUsernameKey(wallet: string) {
  return `arcIdentityUsername:${wallet.toLowerCase()}`;
}

function storeUsernameForWallet(wallet: string, username: string) {
  const canonical = maybeArcUsername(username);
  if (!canonical) return;
  localStorage.setItem(walletUsernameKey(wallet), canonical);
  localStorage.setItem("arcIdentityUsername", canonical);
  localStorage.setItem(usernameWalletKey(wallet), wallet.toLowerCase());
  window.dispatchEvent(new Event("arc-identity-wallet-changed"));
}

function clearCurrentUsername() {
  localStorage.removeItem("arcIdentityUsername");
}

function clearWalletScopedState(wallet?: string | null) {
  localStorage.removeItem("arcIdentityWallet");
  localStorage.removeItem("arcIdentityWalletProvider");
  localStorage.removeItem("arcIdentitySignature");
  localStorage.removeItem("arcIdentityUsername");
  localStorage.removeItem(lookupWarningKey);
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key) continue;
    const walletScoped =
      key.startsWith("arcIdentityUsernameWallet:") ||
      key.startsWith("arcIdentityUsername:") ||
      key.startsWith("arcIdentityDashboardCache:") ||
      key.startsWith("arcIdentityPostClaim:") ||
      key.startsWith("arcIdentityProfileCache:");
    if (!walletScoped) continue;
    localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event("arc-identity-wallet-changed"));
}

function logIdentityLookup(event: string, details: Record<string, unknown>) {
  console.log(`[arc-identity] ${event}`, details);
}

function isTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|aborted|timeout|signal/i.test(message);
}

function providerName(provider: Eip1193Provider, fallback = "Injected wallet") {
  if (provider.isRabby) return "Rabby";
  if (provider.isOkxWallet || provider.isOKExWallet) return "OKX Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return fallback === "Injected wallet" ? "Browser Wallet" : fallback;
}

function providerKey(provider: Eip1193Provider, fallback: string, rdns = "", name = "") {
  const normalizedRdns = rdns.toLowerCase();
  const normalizedName = name.toLowerCase();
  if (provider.isRabby || normalizedRdns.includes("rabby") || normalizedName.includes("rabby")) return "rabby";
  if (provider.isOkxWallet || provider.isOKExWallet || normalizedRdns.includes("okx") || normalizedName.includes("okx")) return "okx";
  if (provider.isCoinbaseWallet || normalizedRdns.includes("coinbase") || normalizedName.includes("coinbase")) return "coinbase";
  if (provider.isMetaMask || normalizedRdns.includes("metamask") || normalizedName.includes("metamask")) return "metamask";
  const flags = [
    provider.isRabby ? "rabby" : "",
    provider.isOkxWallet || provider.isOKExWallet ? "okx" : "",
    provider.isCoinbaseWallet ? "coinbase" : "",
    provider.isMetaMask ? "metamask" : ""
  ].filter(Boolean).join(":");
  return flags || fallback;
}

function isBlockedLaunchWallet(wallet: DetectedWallet) {
  const label = `${wallet.name} ${wallet.rdns ?? ""}`.toLowerCase();
  return label.includes("phantom") || Boolean(wallet.provider.isPhantom);
}

function coinbaseExtensionProvider(value: Window["coinbaseWalletExtension"]) {
  if (!value) return null;
  return "request" in value ? value : value.ethereum ?? null;
}

function discoverInjectedWallets(eip6963Wallets: DetectedWallet[] = []) {
  if (typeof window === "undefined") return [];
  const detected = new Map<string, DetectedWallet>();
  const seenProviders = new WeakSet<Eip1193Provider>();

  function add(wallet: DetectedWallet | null | undefined) {
    if (!wallet?.provider?.request) return;
    if (isBlockedLaunchWallet(wallet)) return;
    const key = providerKey(wallet.provider, wallet.id || wallet.name, wallet.rdns, wallet.name);
    if (seenProviders.has(wallet.provider) && detected.has(key)) return;
    seenProviders.add(wallet.provider);
    if (!detected.has(key)) detected.set(key, wallet);
  }

  eip6963Wallets.forEach(add);

  const providerList = window.ethereum?.providers?.length ? window.ethereum.providers : window.ethereum ? [window.ethereum] : [];
  providerList.forEach((provider, index) => {
    add({
      id: providerKey(provider, `ethereum-${index}`),
      name: providerName(provider, index === 0 ? "Browser wallet" : `Injected wallet ${index + 1}`),
      provider,
      source: "injected"
    });
  });

  add(window.rabby ? { id: "rabby", name: "Rabby", provider: window.rabby, source: "injected" } : null);
  add(window.okxwallet ? { id: "okx", name: "OKX Wallet", provider: window.okxwallet, source: "injected" } : null);
  const coinbaseProvider = coinbaseExtensionProvider(window.coinbaseWalletExtension) ?? window.coinbaseWallet ?? null;
  add(coinbaseProvider ? { id: "coinbase", name: "Coinbase Wallet", provider: coinbaseProvider, source: "injected" } : null);

  return Array.from(detected.values());
}

function walletErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? Number((error as { code?: unknown }).code) : null;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (code === 4001 || /rejected|denied|cancelled|canceled/i.test(message)) return "Wallet request rejected.";
  if (/unsupported|not supported/i.test(message)) return "Unsupported wallet provider.";
  if (/signature/i.test(message)) return "Signature rejected.";
  if (/provider|ethereum|wallet/i.test(message)) return "Wallet provider unavailable.";
  return "Wallet connection failed. Retry with a supported EVM wallet.";
}

export function WalletConnectButton({
  onConnect,
  compact = false
}: {
  onConnect?: (wallet: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const [wallet, setWallet] = useState("");
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [availableWallets, setAvailableWallets] = useState<DetectedWallet[]>([]);
  const [showWalletPicker, setShowWalletPicker] = useState(false);

  useEffect(() => {
    const eip6963Wallets = new Map<string, DetectedWallet>();
    function refreshWallets() {
      setAvailableWallets(discoverInjectedWallets(Array.from(eip6963Wallets.values())));
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
        source: "eip6963"
      });
      refreshWallets();
    }
    window.addEventListener("eip6963:announceProvider", onAnnounce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    refreshWallets();
    const timer = window.setTimeout(refreshWallets, 500);
    return () => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    function syncWalletState() {
      const stored = localStorage.getItem("arcIdentityWallet") ?? "";
      const signature = localStorage.getItem("arcIdentitySignature") ?? "";
      setWallet(stored);
      setVerified(Boolean(signature));
      onConnect?.(stored);
    }
    syncWalletState();
    window.addEventListener("storage", syncWalletState);
    window.addEventListener("arc-identity-wallet-changed", syncWalletState);
    return () => {
      window.removeEventListener("storage", syncWalletState);
      window.removeEventListener("arc-identity-wallet-changed", syncWalletState);
    };
  }, [onConnect]);

  useEffect(() => {
    if (!showWalletPicker) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeWalletPicker();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showWalletPicker]);

  function closeWalletPicker() {
    setShowWalletPicker(false);
    setError("");
    setStatus("");
  }

  function openWalletPicker() {
    setError("");
    setStatus("");
    const wallets = discoverInjectedWallets(availableWallets);
    setAvailableWallets(wallets);
    setShowWalletPicker(true);
  }

  function routeAfterWalletLookup(target: string, connected: string, source: string) {
    if (isIdentityCreatedRevealActive(window.location.pathname, connected)) {
      logIdentityLookup("wallet_identity_route_suppressed_for_reveal", { wallet: connected, target, source });
      return;
    }
    router.push(target);
  }

  async function connect(selectedProvider?: Eip1193Provider) {
    setError("");
    setStatus("Requesting wallet connection...");
    setConnecting(true);
    let shouldClosePicker = false;

    const wallets = availableWallets.length ? availableWallets : discoverInjectedWallets();
    const provider = selectedProvider ?? wallets[0]?.provider;

    if (!provider) {
      setError("No compatible EVM wallet found.");
      setStatus("");
      setConnecting(false);
      return;
    }

    try {
      const accounts = (await provider.request({
        method: "eth_requestAccounts"
      })) as string[];
      const connected = accounts[0];
      if (!connected) return;
      const previousWallet = localStorage.getItem("arcIdentityWallet") ?? "";
      if (previousWallet && previousWallet.toLowerCase() !== connected.toLowerCase()) {
        clearCurrentUsername();
      }

      setStatus("Requesting signature verification...");
      const issuedAt = new Date().toISOString();
      const nonce = crypto.randomUUID();
      const message = [
        "ARC Identity",
        "Domain: arcidentity.in",
        "Purpose: Verify wallet ownership",
        `Wallet address: ${connected}`,
        "Username: Not claimed yet",
        `Nonce: ${nonce}`,
        `Issued at: ${issuedAt}`,
        "",
        "This signature does not send a transaction.",
        "This signature does not grant token access."
      ].join("\n");
      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, connected]
      })) as string;

      localStorage.setItem("arcIdentityWallet", connected);
      localStorage.setItem("arcIdentitySignature", signature);
      localStorage.setItem("arcIdentityWalletProvider", providerName(provider));
      setWallet(connected);
      setVerified(true);
      onConnect?.(connected);
      shouldClosePicker = true;
      setStatus("Signature verified. Syncing ARC Identity profile...");

      try {
        logIdentityLookup("wallet_identity_lookup_started", { wallet: connected, source: "profile_ensure" });
        const data = await fetchJsonWithTimeout<ProfileEnsureResponse>("/api/profile/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: connected, signature })
        }, identityLookupTimeoutMs);
        logIdentityLookup("wallet_identity_lookup_success", { wallet: connected, username: data.profile?.username ?? null });
        const ensuredUsername = maybeArcUsername(data.profile?.username);
        if (ensuredUsername) {
          storeUsernameForWallet(connected, ensuredUsername);
          setStatus("Identity found. Redirecting to dashboard...");
          logIdentityLookup("wallet_identity_route_decision", { wallet: connected, route: "/dashboard", source: "profile_ensure" });
          router.refresh();
          routeAfterWalletLookup("/dashboard", connected, "profile_ensure");
        } else {
          const score = await fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${connected}`, {}, identityLookupTimeoutMs).catch(() => null);
          const scoreUsername = maybeArcUsername(score?.username);
          if (scoreUsername) {
            storeUsernameForWallet(connected, scoreUsername);
            setStatus("Identity found. Redirecting to dashboard...");
            logIdentityLookup("wallet_identity_route_decision", { wallet: connected, route: "/dashboard", source: "score_fallback" });
            router.refresh();
            routeAfterWalletLookup("/dashboard", connected, "score_fallback");
          } else {
            clearCurrentUsername();
            localStorage.removeItem(lookupWarningKey);
            setStatus("Create your ARC Identity.");
            logIdentityLookup("wallet_identity_route_decision", { wallet: connected, route: "/create", source: "unclaimed" });
            routeAfterWalletLookup("/create", connected, "unclaimed");
          }
        }
      } catch (ensureError) {
        logIdentityLookup(isTimeoutError(ensureError) ? "wallet_identity_lookup_timeout" : "wallet_identity_lookup_failed", {
          wallet: connected,
          source: "profile_ensure",
          error: ensureError instanceof Error ? ensureError.message : "Unknown error"
        });
        const score = await fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${connected}`, {}, identityLookupTimeoutMs).catch((scoreError) => {
          logIdentityLookup(isTimeoutError(scoreError) ? "wallet_identity_lookup_timeout" : "wallet_identity_lookup_failed", {
            wallet: connected,
            source: "score_fallback",
            error: scoreError instanceof Error ? scoreError.message : "Unknown error"
          });
          return null;
        });
        const scoreUsername = maybeArcUsername(score?.username);
        if (scoreUsername) {
          storeUsernameForWallet(connected, scoreUsername);
          setStatus("Identity found. Redirecting to dashboard...");
          logIdentityLookup("wallet_identity_route_decision", { wallet: connected, route: "/dashboard", source: "score_fallback" });
          router.refresh();
          routeAfterWalletLookup("/dashboard", connected, "score_fallback");
        } else {
          clearCurrentUsername();
          localStorage.setItem(lookupWarningKey, connected.toLowerCase());
          setStatus("Profile lookup is slow. Continue to claim if this is a new wallet.");
          logIdentityLookup("wallet_identity_route_decision", { wallet: connected, route: "/create", source: "lookup_failed" });
          routeAfterWalletLookup("/create", connected, "lookup_failed");
        }
      }
    } catch (connectError) {
      setError(walletErrorMessage(connectError));
      setStatus("");
    } finally {
      setConnecting(false);
      if (shouldClosePicker) closeWalletPicker();
    }
  }
  function disconnect() {
    clearWalletScopedState(wallet);
    setWallet("");
    setVerified(false);
    onConnect?.("");
    router.push("/");
  }

  if (wallet) {
    return (
      <div className="grid max-w-full gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
        <span
          className={`inline-flex max-w-full items-center justify-center gap-2.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 font-extrabold text-emerald-100 ${
            compact ? "px-3.5 py-2.5 text-sm sm:py-2" : "px-5 py-3 text-base"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
          <span className="truncate">{shortenAddress(wallet)}</span>
        </span>
        <span className="hidden rounded-lg border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-slate-300 sm:inline-flex">
          {verified ? "Signature verified" : "Wallet connected"}
        </span>
        <button
          type="button"
          onClick={disconnect}
          className="arc-button-secondary w-full px-4 py-2.5 text-sm font-bold sm:w-auto sm:py-2"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 gap-2">
      <button
        type="button"
        onClick={openWalletPicker}
        className={`arc-button-secondary inline-flex w-full items-center justify-center gap-2.5 font-extrabold text-emerald-100 ${
          compact ? "px-4 py-2.5 text-sm sm:py-2 lg:w-auto" : "px-5 py-3 text-base"
        }`}
      >
        <span className="h-2.5 w-2.5 rounded-full bg-slate-500" />
        {connecting ? "Connecting..." : "Connect Wallet"}
      </button>
      {showWalletPicker && typeof document !== "undefined" ? createPortal((
        <div className="fixed inset-0 z-[10000] flex min-h-[100dvh] w-full items-center justify-center overflow-x-hidden bg-black/65 p-4 backdrop-blur-[2px]" onMouseDown={closeWalletPicker}>
          <div className="w-[min(100%,440px)] max-w-full rounded-2xl border border-white/[0.1] bg-[rgba(8,16,22,0.98)] p-5 shadow-[0_32px_100px_rgba(0,0,0,0.62),0_0_52px_rgba(45,212,191,0.08)]" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Connect wallet">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="arc-section-label">Wallet</p>
                <h2 className="mt-2 text-2xl font-black text-white">Connect wallet</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Choose an EVM wallet to continue.</p>
              </div>
              <button type="button" onClick={closeWalletPicker} className="rounded-lg border border-white/10 px-3 py-2 text-sm font-bold text-slate-300 transition hover:bg-white/10" aria-label="Close wallet selector">
                X
              </button>
            </div>
            <div className="mt-5 rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-4 text-sm leading-6 text-emerald-50/85">
              <p className="font-bold text-emerald-100">ARC Identity only asks for a wallet signature to verify ownership.</p>
              <p className="mt-1">This does not send a transaction. This does not grant token access.</p>
            </div>
            <div className="mt-5 grid gap-2">
              {availableWallets.length ? availableWallets.map((item) => (
                <button
                  key={providerKey(item.provider, item.id, item.rdns, item.name)}
                  type="button"
                  onClick={() => void connect(item.provider)}
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-left text-sm font-extrabold text-white transition hover:border-emerald-300/25 hover:bg-white/[0.08]"
                >
                  <span>{item.name}</span>
                  <span className="text-xs font-bold text-slate-500">{item.source === "eip6963" ? "Detected" : "Injected"}</span>
                </button>
              )) : (
                <div className="rounded-xl border border-amber-300/20 bg-amber-300/[0.08] p-4 text-sm leading-6 text-amber-50/85">
                  <p className="font-bold text-amber-100">No compatible EVM wallet found.</p>
                  <p className="mt-1">Install or enable MetaMask, Rabby, OKX Wallet, or Coinbase Wallet to continue.</p>
                </div>
              )}
            </div>
            {status ? <p className="mt-4 text-sm text-emerald-100/80">{status}</p> : null}
            {error ? (
              <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.08] p-3 text-sm font-semibold leading-6 text-rose-100">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
