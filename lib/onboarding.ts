"use client";

import { maybeArcUsername, profileRouteFor } from "@/lib/username";

export type PostClaimRevealContext = {
  username: string;
  wallet: string;
  profileUrl: string;
  createdAt: string;
  source: "claim-success" | "already-claimed" | "query" | "session";
};

export const postClaimRevealKey = "arc-identity:post-claim-reveal";

function legacyRevealStateKey(wallet: string, username: string) {
  return `arcIdentityReveal:${wallet.toLowerCase()}:${username.toLowerCase()}`;
}

function legacyRevealLatestKey(wallet: string) {
  return `arcIdentityRevealLatest:${wallet.toLowerCase()}`;
}

export function normalizeWallet(value?: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

export function revealRouteFor(username: string, wallet: string) {
  return `/identity-created?username=${encodeURIComponent(username)}&wallet=${encodeURIComponent(wallet)}`;
}

function parseStoredReveal(raw: string | null, expectedWallet = "", expectedUsername: string | null = null): PostClaimRevealContext | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PostClaimRevealContext>;
    const wallet = normalizeWallet(parsed.wallet);
    const username = maybeArcUsername(parsed.username);
    if (!wallet || !username) return null;
    if (expectedWallet && wallet !== expectedWallet) return null;
    if (expectedUsername && username !== expectedUsername) return null;
    return {
      wallet,
      username,
      profileUrl: parsed.profileUrl?.startsWith("/profile/") ? parsed.profileUrl : profileRouteFor(username),
      createdAt: parsed.createdAt ?? new Date().toISOString(),
      source: parsed.source === "claim-success" || parsed.source === "already-claimed" ? parsed.source : "session"
    };
  } catch {
    return null;
  }
}

export function setPostClaimRevealContext(walletInput: string, usernameInput: string, profileUrlInput?: string | null, source: "claim-success" | "already-claimed" = "claim-success") {
  if (typeof window === "undefined") return null;
  const wallet = normalizeWallet(walletInput);
  const username = maybeArcUsername(usernameInput);
  if (!wallet || !username) return null;
  const context: PostClaimRevealContext = {
    wallet,
    username,
    profileUrl: profileUrlInput?.startsWith("/profile/") ? profileUrlInput : profileRouteFor(username),
    createdAt: new Date().toISOString(),
    source
  };
  const payload = JSON.stringify(context);
  try {
    sessionStorage.setItem(postClaimRevealKey, payload);
    sessionStorage.setItem(legacyRevealStateKey(wallet, username), payload);
    sessionStorage.setItem(legacyRevealLatestKey(wallet), payload);
  } catch {
    // Query params still carry the reveal identity if session storage is unavailable.
  }
  return context;
}

export function getPostClaimRevealContext(search?: string | URLSearchParams | null) {
  const params = typeof search === "string"
    ? new URLSearchParams(search)
    : search instanceof URLSearchParams
      ? search
      : typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : new URLSearchParams();

  const queryUsername = maybeArcUsername(params.get("username"));
  const queryWallet = normalizeWallet(params.get("wallet"));
  const stored = typeof window !== "undefined" ? parseStoredReveal(sessionStorage.getItem(postClaimRevealKey), queryWallet, queryUsername) : null;

  if (queryUsername && queryWallet) {
    return {
      wallet: queryWallet,
      username: queryUsername,
      profileUrl: stored?.profileUrl ?? profileRouteFor(queryUsername),
      createdAt: stored?.createdAt ?? new Date().toISOString(),
      source: "query" as const
    };
  }

  if (stored) return stored;

  if (typeof window === "undefined") return null;
  const walletForLegacy = queryWallet || normalizeWallet(localStorage.getItem("arcIdentityWallet"));
  if (!walletForLegacy) return null;
  const legacy = parseStoredReveal(sessionStorage.getItem(legacyRevealLatestKey(walletForLegacy)), walletForLegacy, queryUsername);
  if (legacy) return legacy;
  return queryUsername
    ? parseStoredReveal(sessionStorage.getItem(legacyRevealStateKey(walletForLegacy, queryUsername)), walletForLegacy, queryUsername)
    : null;
}

export function isIdentityCreatedRevealActive(pathname?: string, walletInput?: string | null) {
  if (typeof window === "undefined") return false;
  const currentPath = pathname ?? window.location.pathname;
  if (currentPath !== "/identity-created") return false;
  const context = getPostClaimRevealContext();
  if (!context) return false;
  const wallet = normalizeWallet(walletInput);
  return !wallet || context.wallet === wallet;
}

export function clearPostClaimRevealContext(walletInput?: string | null, usernameInput?: string | null) {
  if (typeof window === "undefined") return;
  const wallet = normalizeWallet(walletInput);
  const username = maybeArcUsername(usernameInput);
  try {
    sessionStorage.removeItem(postClaimRevealKey);
    if (wallet) sessionStorage.removeItem(legacyRevealLatestKey(wallet));
    if (wallet && username) sessionStorage.removeItem(legacyRevealStateKey(wallet, username));
  } catch {
    // Clearing reveal state is best effort only.
  }
}
