"use client";

import { useEffect, useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/useIsomorphicLayoutEffect";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { shortenAddress } from "@/lib/wallet";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { signWalletChallenge } from "@/lib/wallet-challenge-client";
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
  icon?: string;
};

/** EIP-6963 icons are wallet-supplied URIs; only render safe schemes. */
function safeWalletIcon(icon?: string) {
  if (!icon) return "";
  return icon.startsWith("data:image/") || icon.startsWith("https://") ? icon : "";
}

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
  localStorage.removeItem("arcIdentitySignatureMessage");
  localStorage.removeItem("arcIdentityUsername");
  localStorage.removeItem(lookupWarningKey);
  sessionStorage.removeItem("arcIdentityVerifiedWallet");
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
  // Visual stage of the connect ceremony. Mirrors (never replaces) the status text:
  // "pick" shows the wallet list, the rest drive the verification chamber steps.
  const [stage, setStage] = useState<"pick" | "link" | "sign" | "sync">("pick");
  const [selectedWalletName, setSelectedWalletName] = useState("");
  const [selectedWalletIcon, setSelectedWalletIcon] = useState("");
  const pickerPanelRef = useRef<HTMLDivElement | null>(null);

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
        source: "eip6963",
        icon: safeWalletIcon(detail.info?.icon)
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

  useIsomorphicLayoutEffect(() => {
    function syncWalletState() {
      const stored = localStorage.getItem("arcIdentityWallet") ?? "";
      /* Signatures are no longer cached. "Signature verified" is a
         tab-scoped display hint set right after a successful challenge. */
      const verifiedWallet = sessionStorage.getItem("arcIdentityVerifiedWallet") ?? "";
      setWallet(stored);
      setVerified(Boolean(stored) && verifiedWallet.toLowerCase() === stored.toLowerCase());
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
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusables = () => {
      const panel = pickerPanelRef.current;
      if (!panel) return [] as HTMLElement[];
      return Array.from(panel.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));
    };
    focusables()[0]?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeWalletPicker();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [showWalletPicker]);

  function closeWalletPicker() {
    setShowWalletPicker(false);
    setError("");
    setStatus("");
    setStage("pick");
  }

  function openWalletPicker() {
    setError("");
    setStatus("");
    setStage("pick");
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

    const selectedWallet = wallets.find((item) => item.provider === provider);
    setSelectedWalletName(selectedWallet?.name ?? providerName(provider));
    setSelectedWalletIcon(safeWalletIcon(selectedWallet?.icon));
    setStage("link");

    try {
      // Ask the wallet to show its account picker first, so users with
      // multiple accounts can choose which one to connect. Wallets that
      // don't support permission prompts fall through to the standard
      // connect request below.
      try {
        await provider.request({
          method: "wallet_requestPermissions",
          params: [{ eth_accounts: {} }]
        });
      } catch (permissionError) {
        const code = (permissionError as { code?: number } | null)?.code;
        if (code === 4001) throw permissionError; // user rejected the request
      }
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
      setStage("sign");
      /* The verification message is issued by the server (single use,
         short expiry) and signed here, never built or cached client side.
         Connect-time verification is best effort: if challenge issuance is
         unavailable the wallet still connects unverified, because every
         mutation demands its own fresh challenge anyway. A user who declines
         the signature still cancels the connect. */
      let credentials: { signature: string; signatureMessage: string } | null = null;
      try {
        credentials = await signWalletChallenge(provider, connected, "profile-setup");
      } catch (challengeError) {
        const code = (challengeError as { code?: number } | null)?.code;
        if (code === 4001) throw challengeError;
        console.warn(
          "[arc-identity] connect verification unavailable, continuing unverified:",
          challengeError instanceof Error ? challengeError.message : challengeError
        );
      }

      localStorage.setItem("arcIdentityWallet", connected);
      /* Cached signature pairs are gone; scrub keys left by old sessions. */
      localStorage.removeItem("arcIdentitySignature");
      localStorage.removeItem("arcIdentitySignatureMessage");
      localStorage.setItem("arcIdentityWalletProvider", providerName(provider));
      if (credentials) {
        sessionStorage.setItem("arcIdentityVerifiedWallet", connected);
      } else {
        sessionStorage.removeItem("arcIdentityVerifiedWallet");
      }
      setWallet(connected);
      setVerified(Boolean(credentials));
      onConnect?.(connected);
      shouldClosePicker = true;
      setStatus(credentials ? "Signature verified. Syncing Kyro profile..." : "Wallet connected. Syncing Kyro profile...");
      setStage("sync");

      try {
        logIdentityLookup("wallet_identity_lookup_started", { wallet: connected, source: "profile_ensure" });
        const data = await fetchJsonWithTimeout<ProfileEnsureResponse>("/api/profile/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(credentials ? { walletAddress: connected, ...credentials } : { walletAddress: connected })
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
            setStatus("Create your Kyro identity.");
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
      setStage("pick");
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
      <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
        <span
          className={`inline-flex max-w-full items-center justify-center gap-2.5 rounded-[2px] border border-emerald-300/30 bg-emerald-300/10 font-extrabold text-emerald-100 ${
            compact ? "min-w-0 flex-1 px-3 py-2 text-xs sm:flex-none sm:px-3.5 sm:text-sm" : "px-5 py-3 text-base"
          }`}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-300 shadow-none" />
          <span className="truncate">{shortenAddress(wallet)}</span>
        </span>
        <span className="hidden rounded-[2px] border border-white/[0.08] bg-white/[0.03] px-3.5 py-2 text-xs font-bold text-slate-300 sm:inline-flex">
          {verified ? "Signature verified" : "Wallet connected"}
        </span>
        <button
          type="button"
          onClick={disconnect}
          className="arc-button-secondary flex-none px-3 py-2 text-xs font-bold sm:px-4 sm:text-sm"
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
        <div className="wcm-overlay fixed inset-0 z-[10000] flex min-h-[100dvh] w-full items-center justify-center overflow-y-auto overflow-x-hidden bg-black/65 p-4 backdrop-blur-[2px]" onMouseDown={closeWalletPicker}>
          <div ref={pickerPanelRef} className="wcm-panel my-auto w-[min(100%,440px)] max-w-full p-7" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="Connect wallet">
            <span className="wcm-scanwrap" aria-hidden="true" />
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="arc-section-label">Credential intake</p>
                <h2 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.02em] text-ink">{stage === "pick" ? "Connect wallet" : "Verifying ownership"}</h2>
                <p className="mt-2 text-sm leading-6 text-mutedc">{stage === "pick" ? "Choose an EVM wallet to continue." : `${selectedWalletName || "Your wallet"} is asking for your approval.`}</p>
              </div>
              <button type="button" onClick={closeWalletPicker} className="grid h-9 w-9 flex-none place-items-center rounded-[2px] border border-linec text-mutedc transition hover:border-ink hover:text-ink" aria-label="Close wallet selector">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                  <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
                </svg>
              </button>
            </div>
            <div className="wcm-notice mt-5 bg-[#ece8dc] p-4 text-sm leading-6 text-mutedc">
              <p className="font-bold text-ink">Kyro only asks for a wallet signature to verify ownership.</p>
              <p className="mt-1">This does not send a transaction. This does not grant token access.</p>
            </div>
            {stage === "pick" ? (
              <div className="mt-5 grid gap-2">
                {availableWallets.length ? availableWallets.map((item, index) => (
                  <button
                    key={providerKey(item.provider, item.id, item.rdns, item.name)}
                    type="button"
                    onClick={() => void connect(item.provider)}
                    className="wcm-item flex items-center justify-between bg-[#f6f3e9] px-4 py-3 text-left text-sm font-extrabold text-ink hover:bg-[#efebe0]"
                    style={{ animationDelay: `${0.12 + index * 0.06}s` }}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      {safeWalletIcon(item.icon) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={safeWalletIcon(item.icon)} alt="" aria-hidden="true" className="h-5 w-5 flex-none rounded-[2px]" />
                      ) : (
                        <span className="grid h-5 w-5 flex-none place-items-center rounded-[2px] bg-[#252827] font-heading text-[0.7rem] font-semibold leading-none text-[#f2eee3]">{item.name.slice(0, 1)}</span>
                      )}
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-quiet">{item.source === "eip6963" ? "Detected" : "Injected"}</span>
                  </button>
                )) : (
                  <div className="wcm-item is-note bg-[#efe3c8] p-4 text-sm leading-6 text-[#9a6e2b]">
                    <p className="font-bold">No compatible EVM wallet found.</p>
                    <p className="mt-1">Install or enable MetaMask, Rabby, OKX Wallet or Coinbase Wallet to continue.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="wcm-chamber mt-6">
                <div className="wcm-seal" aria-hidden="true">
                  <span className="wcm-seal-ring" />
                  <span className="wcm-seal-ring inner" />
                  {selectedWalletIcon ? (
                    <span className="wcm-seal-core has-icon">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={selectedWalletIcon} alt="" />
                    </span>
                  ) : (
                    <span className="wcm-seal-core font-heading">{(selectedWalletName || "W").slice(0, 1)}</span>
                  )}
                </div>
                <div className="mt-5">
                  {([["01", "Wallet link", "link"], ["02", "Ownership signature", "sign"], ["03", "Record sync", "sync"]] as const).map(([idx, label, key]) => {
                    const order = ["link", "sign", "sync"] as const;
                    const state = order.indexOf(key) < order.indexOf(stage as typeof order[number]) ? "done" : key === stage ? "active" : "pending";
                    return (
                      <div key={key} className="wcm-step" data-state={state}>
                        <span className="wcm-step-idx">{idx}</span>
                        <span className="wcm-step-label">{label}</span>
                        <span className="wcm-step-state">{state === "done" ? "Done" : state === "active" ? "Active" : "Queued"}</span>
                        <span className="wcm-step-bar" />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {status ? <p className="mt-4 font-mono text-[0.68rem] font-medium uppercase tracking-[0.12em] leading-5 text-mutedc">{status}</p> : null}
            {error ? (
              <div className="wcm-notice is-rose mt-4 bg-[#ecdcd4] p-3 text-sm font-semibold leading-6 text-[#8c4a3f]">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ), document.body) : null}
    </div>
  );
}
