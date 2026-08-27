/* Browser-side half of the wallet challenge flow (audit finding F-01).

   Every wallet-authenticated mutation fetches a fresh server-issued message,
   asks the wallet to sign it, and sends the pair along with the request.
   Nothing is cached: challenges are single use and expire in minutes, so
   there is nothing worth storing in localStorage anymore. */

export type WalletChallengePurpose =
  | "key-management"
  | "team-management"
  | "username-claim"
  | "profile-setup"
  | "portal-login"
  | "portal-admin-action";

export type WalletChallengeSignature = {
  signature: string;
  signatureMessage: string;
};

export type Eip1193ChallengeProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ChallengeEnvelope = {
  ok?: boolean;
  data?: { message?: unknown; nonce?: unknown; expiresAt?: unknown };
  error?: { message?: unknown };
};

export async function requestWalletChallenge(walletAddress: string, purpose: WalletChallengePurpose) {
  const response = await fetch("/api/v1/auth/challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ walletAddress, purpose })
  });
  const json = (await response.json().catch(() => null)) as ChallengeEnvelope | null;
  if (!response.ok || !json?.ok || typeof json.data?.message !== "string") {
    const serverMessage = typeof json?.error?.message === "string" ? json.error.message : null;
    throw new Error(serverMessage ?? "Could not start wallet verification. Please retry.");
  }
  return {
    message: json.data.message,
    nonce: typeof json.data.nonce === "string" ? json.data.nonce : "",
    expiresAt: typeof json.data.expiresAt === "string" ? json.data.expiresAt : ""
  };
}

export async function signWalletChallenge(
  provider: Eip1193ChallengeProvider,
  walletAddress: string,
  purpose: WalletChallengePurpose
): Promise<WalletChallengeSignature> {
  const challenge = await requestWalletChallenge(walletAddress, purpose);
  const signature = await provider.request({
    method: "personal_sign",
    params: [challenge.message, walletAddress]
  });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Wallet did not return a signature.");
  }
  return { signature, signatureMessage: challenge.message };
}

async function silentAccounts(provider: Eip1193ChallengeProvider): Promise<string[]> {
  try {
    const accounts = await provider.request({ method: "eth_accounts" });
    return Array.isArray(accounts) ? accounts.map((account) => String(account).toLowerCase()) : [];
  } catch {
    return [];
  }
}

function injectedProviders(): Eip1193ChallengeProvider[] {
  if (typeof window === "undefined") return [];
  const injected = (window as { ethereum?: Eip1193ChallengeProvider & { providers?: Eip1193ChallengeProvider[] } }).ethereum;
  if (!injected) return [];
  return injected.providers?.length ? injected.providers : [injected];
}

/* EIP-6963 wallets announce themselves through window events, so wallets
   that never claim window.ethereum (some Rabby and OKX setups) are only
   reachable this way. The listener window is short: providers answer the
   request event synchronously in practice. */
function discoverEip6963Providers(waitMs = 350): Promise<Eip1193ChallengeProvider[]> {
  if (typeof window === "undefined") return Promise.resolve([]);
  return new Promise((resolve) => {
    const found: Eip1193ChallengeProvider[] = [];
    const onAnnounce = (event: Event) => {
      const detail = (event as CustomEvent<{ provider?: Eip1193ChallengeProvider }>).detail;
      if (detail?.provider?.request) found.push(detail.provider);
    };
    window.addEventListener("eip6963:announceProvider", onAnnounce as EventListener);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.setTimeout(() => {
      window.removeEventListener("eip6963:announceProvider", onAnnounce as EventListener);
      resolve(found);
    }, waitMs);
  });
}

export async function findProviderForWallet(walletAddress: string): Promise<Eip1193ChallengeProvider | null> {
  const wallet = walletAddress.toLowerCase();
  const candidates = injectedProviders();
  for (const provider of candidates) {
    if ((await silentAccounts(provider)).includes(wallet)) return provider;
  }
  for (const provider of await discoverEip6963Providers()) {
    if ((await silentAccounts(provider)).includes(wallet)) return provider;
  }
  /* No provider currently exposes this account (permissions reset after a
     reload, for example). Fall back to the primary injected provider and let
     the connect prompt in signChallengeWithConnectedWallet sort it out; a
     wrong-account signature is rejected server side with a clear message. */
  return candidates[0] ?? null;
}

export async function signChallengeWithConnectedWallet(
  walletAddress: string,
  purpose: WalletChallengePurpose
): Promise<WalletChallengeSignature> {
  const challenge = await requestWalletChallenge(walletAddress, purpose);
  return signIssuedChallengeWithConnectedWallet(walletAddress, challenge.message);
}

export async function signIssuedChallengeWithConnectedWallet(
  walletAddress: string,
  message: string
): Promise<WalletChallengeSignature> {
  const provider = await findProviderForWallet(walletAddress);
  if (!provider) {
    throw new Error("No compatible EVM wallet found. Reconnect your wallet and retry.");
  }
  const accounts = await silentAccounts(provider);
  if (!accounts.includes(walletAddress.toLowerCase())) {
    try {
      await provider.request({ method: "eth_requestAccounts" });
    } catch {
      /* The signing step below surfaces the real failure. */
    }
  }
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, walletAddress]
  });
  if (typeof signature !== "string" || !signature.startsWith("0x")) {
    throw new Error("Wallet did not return a signature.");
  }
  return { signature, signatureMessage: message };
}
