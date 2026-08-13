"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { maybeArcUsername, profileRouteFor } from "@/lib/username";
import { timeoutSignal } from "@/lib/timeouts";

export type ArcIdentityStatus = "disconnected" | "checking" | "claimed" | "unclaimed" | "error";
export type ArcIdentitySource = "server" | "optimistic_cache" | "none";

export type ArcIdentityState = {
  wallet: string | null;
  normalizedWallet: string | null;
  status: ArcIdentityStatus;
  username: string | null;
  profileUrl: string | null;
  source: ArcIdentitySource;
  error: string | null;
  checkedAt: number | null;
};

type ProfileByWalletResponse = {
  profile?: { username?: string | null } | null;
  username?: string | null;
};

const emptyState: ArcIdentityState = {
  wallet: null,
  normalizedWallet: null,
  status: "checking",
  username: null,
  profileUrl: null,
  source: "none",
  error: null,
  checkedAt: null
};

function normalizeWallet(wallet?: string | null) {
  const normalized = (wallet ?? "").trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

export function walletUsernameKey(wallet: string) {
  return `arcIdentity:${wallet.toLowerCase()}:username`;
}

export function walletClaimedKey(wallet: string) {
  return `arcIdentity:${wallet.toLowerCase()}:claimed`;
}

function legacyUsernameKey(wallet: string) {
  return `arcIdentityUsername:${wallet.toLowerCase()}`;
}

function legacyUsernameWalletKey(wallet: string) {
  return `arcIdentityUsernameWallet:${wallet.toLowerCase()}`;
}

function allArcKeysForWallet(wallet: string) {
  const normalized = wallet.toLowerCase();
  return [
    walletUsernameKey(normalized),
    walletClaimedKey(normalized),
    `arcIdentityUsername:${normalized}`,
    `arcIdentityUsernameWallet:${normalized}`,
    `arcIdentityDashboardCache:${normalized}`,
    `arcIdentityPostClaim:${normalized}`,
    `arcIdentityProfileCache:${normalized}`
  ];
}

export function readCachedArcIdentity(wallet: string) {
  const normalized = normalizeWallet(wallet);
  if (!normalized || typeof window === "undefined") return { username: null as string | null, claimed: false };
  const scoped = maybeArcUsername(localStorage.getItem(walletUsernameKey(normalized)));
  if (scoped) return { username: scoped, claimed: true };
  const legacyScoped = maybeArcUsername(localStorage.getItem(legacyUsernameKey(normalized)));
  if (legacyScoped) return { username: legacyScoped, claimed: true };
  const legacyUsername = localStorage.getItem("arcIdentityUsername") ?? "";
  const legacyWallet = localStorage.getItem(legacyUsernameWalletKey(normalized)) ?? "";
  const trustedLegacy = legacyWallet.toLowerCase() === normalized ? maybeArcUsername(legacyUsername) : null;
  return {
    username: trustedLegacy,
    claimed: Boolean(trustedLegacy || localStorage.getItem(walletClaimedKey(normalized)) === "true")
  };
}

export function storeArcIdentityCache(wallet: string, username: string) {
  const normalized = normalizeWallet(wallet);
  const canonical = maybeArcUsername(username);
  if (!normalized || !canonical || typeof window === "undefined") return;
  localStorage.setItem(walletUsernameKey(normalized), canonical);
  localStorage.setItem(walletClaimedKey(normalized), "true");
  localStorage.setItem(legacyUsernameKey(normalized), canonical);
  localStorage.setItem("arcIdentityUsername", canonical);
  localStorage.setItem(legacyUsernameWalletKey(normalized), normalized);
}

export function clearArcIdentityWalletCache(wallet?: string | null) {
  if (typeof window === "undefined") return;
  const normalized = normalizeWallet(wallet);
  if (normalized) {
    for (const key of allArcKeysForWallet(normalized)) localStorage.removeItem(key);
  }
  localStorage.removeItem("arcIdentityUsername");
}

export function clearAllArcIdentityStorage(wallet?: string | null) {
  if (typeof window === "undefined") return;
  const normalized = normalizeWallet(wallet);
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (!key) continue;
      const keyIncludesWallet = normalized ? key.toLowerCase().includes(normalized) : true;
      if ((key.startsWith("arcIdentity") || key.startsWith("arc-identity")) && keyIncludesWallet) {
        storage.removeItem(key);
      }
    }
  }
  window.dispatchEvent(new Event("arc-identity-wallet-changed"));
}

function stateFromCache(wallet: string): ArcIdentityState {
  const normalized = normalizeWallet(wallet);
  if (!normalized) return { ...emptyState, status: "disconnected" };
  const cached = readCachedArcIdentity(normalized);
  if (cached.username || cached.claimed) {
    const username = cached.username;
    return {
      wallet,
      normalizedWallet: normalized,
      status: "claimed",
      username,
      profileUrl: username ? profileRouteFor(username) : "/profile/me",
      source: "optimistic_cache",
      error: null,
      checkedAt: null
    };
  }
  return {
    wallet,
    normalizedWallet: normalized,
    status: "checking",
    username: null,
    profileUrl: null,
    source: "none",
    error: null,
    checkedAt: null
  };
}

declare global {
  interface Window {
    arcIdentityDebugClear?: (wallet?: string | null) => void;
  }
}

export function useArcIdentity() {
  const requestIdRef = useRef(0);
  const stateRef = useRef<ArcIdentityState>(emptyState);
  const [state, setState] = useState<ArcIdentityState>(emptyState);

  const transition = useCallback((next: ArcIdentityState, details: Record<string, unknown> = {}) => {
    stateRef.current = next;
    setState((previous) => {
      console.log("[arc-identity] identity_state_transition", {
        from: previous.status,
        to: next.status,
        wallet: next.normalizedWallet,
        source: next.source,
        ...details
      });
      return next;
    });
  }, []);

  const resolve = useCallback(async (walletInput?: string | null) => {
    const rawWallet = walletInput ?? (typeof window !== "undefined" ? localStorage.getItem("arcIdentityWallet") : "") ?? "";
    const normalizedWallet = normalizeWallet(rawWallet);
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!normalizedWallet) {
      transition({ ...emptyState, status: "disconnected", wallet: null, normalizedWallet: null, checkedAt: Date.now() }, { requestId });
      return;
    }

    // Stale-while-revalidate: once this hook has a resolved answer for this
    // wallet (claimed or unclaimed), background re-checks (focus, storage,
    // wallet-changed events) must not downgrade the UI to "checking" — that
    // unmounts entire gated pages and causes visible flicker loops.
    const previous = stateRef.current;
    const previouslyResolved =
      previous.normalizedWallet === normalizedWallet &&
      (previous.status === "claimed" || previous.status === "unclaimed");

    const cachedState = stateFromCache(normalizedWallet);
    if (!previouslyResolved) {
      transition(cachedState.status === "claimed" ? cachedState : { ...cachedState, status: "checking" }, { requestId, source: cachedState.source });
    }

    const timeout = timeoutSignal(5000);
    try {
      console.log("[arc-identity] identity_lookup_started", { wallet: normalizedWallet, requestId });
      const response = await fetch(`/api/profile/by-wallet/${encodeURIComponent(normalizedWallet)}?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
        signal: timeout.signal
      }).finally(timeout.clear);
      if (requestIdRef.current !== requestId) {
        console.log("[arc-identity] stale_identity_response_ignored", { wallet: normalizedWallet, requestId, latestRequestId: requestIdRef.current });
        return;
      }
      if (response.status === 404) {
        clearArcIdentityWalletCache(normalizedWallet);
        transition({
          wallet: normalizedWallet,
          normalizedWallet,
          status: "unclaimed",
          username: null,
          profileUrl: null,
          source: "server",
          error: null,
          checkedAt: Date.now()
        }, { requestId });
        console.log("[arc-identity] identity_lookup_404", { wallet: normalizedWallet, requestId });
        return;
      }
      const data = await response.json().catch(() => null) as ProfileByWalletResponse | { error?: string } | null;
      if (requestIdRef.current !== requestId) {
        console.log("[arc-identity] stale_identity_response_ignored", { wallet: normalizedWallet, requestId, latestRequestId: requestIdRef.current, stage: "json" });
        return;
      }
      if (!response.ok) throw new Error(data && "error" in data && data.error ? data.error : `Profile lookup failed with ${response.status}`);
      const username = maybeArcUsername((data as ProfileByWalletResponse)?.profile?.username ?? (data as ProfileByWalletResponse)?.username);
      if (!username) {
        clearArcIdentityWalletCache(normalizedWallet);
        transition({
          wallet: normalizedWallet,
          normalizedWallet,
          status: "unclaimed",
          username: null,
          profileUrl: null,
          source: "server",
          error: null,
          checkedAt: Date.now()
        }, { requestId, reason: "missing_username" });
        return;
      }
      storeArcIdentityCache(normalizedWallet, username);
      transition({
        wallet: normalizedWallet,
        normalizedWallet,
        status: "claimed",
        username,
        profileUrl: profileRouteFor(username),
        source: "server",
        error: null,
        checkedAt: Date.now()
      }, { requestId });
      console.log("[arc-identity] identity_lookup_success", { wallet: normalizedWallet, username, requestId });
    } catch (error) {
      timeout.clear();
      if (requestIdRef.current !== requestId) {
        console.log("[arc-identity] stale_identity_response_ignored", { wallet: normalizedWallet, requestId, latestRequestId: requestIdRef.current, stage: "catch" });
        return;
      }
      const cached = stateFromCache(normalizedWallet);
      // Transient lookup failures must not hide a page that was already
      // resolved: fall back to the cache first, then the previous in-memory
      // resolution, and only surface "error" when we never had an answer.
      const fallbackStatus = cached.status === "claimed"
        ? "claimed"
        : previouslyResolved
          ? previous.status
          : "error";
      const fallbackUsername = cached.username ?? (previouslyResolved ? previous.username : null);
      transition({
        ...cached,
        wallet: normalizedWallet,
        normalizedWallet,
        status: fallbackStatus,
        username: fallbackStatus === "claimed" ? fallbackUsername : null,
        profileUrl: fallbackStatus === "claimed" ? (fallbackUsername ? profileRouteFor(fallbackUsername) : "/profile/me") : null,
        error: error instanceof Error ? error.message : "Unable to verify identity",
        checkedAt: Date.now()
      }, { requestId, reason: "lookup_failed" });
      console.warn("[arc-identity] identity_lookup_failed", { wallet: normalizedWallet, requestId, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }, [transition]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.arcIdentityDebugClear = clearAllArcIdentityStorage;
    function sync() {
      void resolve();
    }
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("arc-identity-wallet-changed", sync);
    return () => {
      requestIdRef.current += 1;
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("arc-identity-wallet-changed", sync);
    };
  }, [resolve]);

  return {
    identity: state,
    refreshIdentity: resolve,
    clearIdentityCache: clearAllArcIdentityStorage
  };
}
