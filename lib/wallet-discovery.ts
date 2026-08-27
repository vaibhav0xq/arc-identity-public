/* Shared EVM wallet discovery. One home for provider detection so the main
   site connect and the business portal gateway present the exact same wallet
   list with the exact same rules (EIP-6963 first, injected fallbacks, launch
   wallet blocks). Moved verbatim from WalletConnectButton. */

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

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isOkxWallet?: boolean;
  isOKExWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isPhantom?: boolean;
  providers?: Eip1193Provider[];
};

export type Eip6963ProviderDetail = {
  info?: {
    uuid?: string;
    name?: string;
    icon?: string;
    rdns?: string;
  };
  provider?: Eip1193Provider;
};

export type DetectedWallet = {
  id: string;
  name: string;
  provider: Eip1193Provider;
  rdns?: string;
  source: "eip6963" | "injected";
  icon?: string;
};

/** EIP-6963 icons are wallet-supplied URIs; only render safe schemes. */
export function safeWalletIcon(icon?: string) {
  if (!icon) return "";
  return icon.startsWith("data:image/") || icon.startsWith("https://") ? icon : "";
}

export function providerName(provider: Eip1193Provider, fallback = "Injected wallet") {
  if (provider.isRabby) return "Rabby";
  if (provider.isOkxWallet || provider.isOKExWallet) return "OKX Wallet";
  if (provider.isCoinbaseWallet) return "Coinbase Wallet";
  if (provider.isMetaMask) return "MetaMask";
  return fallback === "Injected wallet" ? "Browser Wallet" : fallback;
}

export function providerKey(provider: Eip1193Provider, fallback: string, rdns = "", name = "") {
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

export function isBlockedLaunchWallet(wallet: DetectedWallet) {
  const label = `${wallet.name} ${wallet.rdns ?? ""}`.toLowerCase();
  return label.includes("phantom") || Boolean(wallet.provider.isPhantom);
}

export function coinbaseExtensionProvider(value: Window["coinbaseWalletExtension"]) {
  if (!value) return null;
  return "request" in value ? value : value.ethereum ?? null;
}

export function discoverInjectedWallets(eip6963Wallets: DetectedWallet[] = []) {
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

export function walletErrorMessage(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? Number((error as { code?: unknown }).code) : null;
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (code === 4001 || /rejected|denied|cancelled|canceled/i.test(message)) return "Wallet request rejected.";
  if (/unsupported|not supported/i.test(message)) return "Unsupported wallet provider.";
  if (/signature/i.test(message)) return "Signature rejected.";
  if (/provider|ethereum|wallet/i.test(message)) return "Wallet provider unavailable.";
  return "Wallet connection failed. Retry with a supported EVM wallet.";
}
