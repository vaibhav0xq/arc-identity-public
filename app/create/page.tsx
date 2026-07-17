"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArcShell } from "@/components/ArcShell";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { revealRouteFor, setPostClaimRevealContext } from "@/lib/onboarding";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { normalizeUsernameInput, profileRouteFor, toArcUsername } from "@/lib/username";
import { shortenAddress } from "@/lib/wallet";

type ProfileEnsureResponse = {
  profile: {
    walletAddress?: string;
    wallet_address?: string;
    username: string | null;
  } | null;
  usernameClaimed?: boolean;
};

type ScoreLookupResponse = {
  username: string | null;
  usernameClaimed?: boolean;
};

type ProfileCreateResponse = {
  success?: boolean;
  username?: string | null;
  wallet_address?: string | null;
  verified_wallet?: boolean;
  usernameClaimed?: boolean;
  profileUrl?: string | null;
  profile?: {
    walletAddress?: string;
    wallet_address?: string;
    username?: string | null;
    verifiedWallet?: boolean;
    verified_wallet?: boolean;
  };
  error?: string;
};

type ProfileByWalletResponse = {
  username?: string | null;
  usernameClaimed?: boolean;
  walletAddress?: string | null;
  profile?: {
    walletAddress?: string;
    wallet_address?: string;
    username?: string | null;
  };
  error?: string;
};

type ExistingIdentityState = "idle" | "checking" | "likely_claimed" | "claimed" | "unclaimed" | "failed";
const identityLookupTimeoutMs = 3000;
const lookupWarningKey = "arcIdentityLookupWarning";
type AvailabilityState = "idle" | "checking" | "available" | "taken" | "error";

function cleanUsername(value?: string | null) {
  try {
    return value ? toArcUsername(value) : null;
  } catch {
    return null;
  }
}

function cleanText(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function usernameWalletKey(wallet: string) {
  return `arcIdentityUsernameWallet:${wallet.toLowerCase()}`;
}

function walletUsernameKey(wallet: string) {
  return `arcIdentityUsername:${wallet.toLowerCase()}`;
}

function dashboardCacheKey(wallet: string) {
  return `arcIdentityDashboardCache:${wallet.toLowerCase()}`;
}

function postClaimKey(wallet: string) {
  return `arcIdentityPostClaim:${wallet.toLowerCase()}`;
}

function getTrustedCachedUsername(wallet: string) {
  const scopedUsername = localStorage.getItem(walletUsernameKey(wallet)) ?? "";
  if (scopedUsername) return scopedUsername;
  const username = localStorage.getItem("arcIdentityUsername") ?? "";
  const usernameWallet = localStorage.getItem(usernameWalletKey(wallet)) ?? "";
  return username && usernameWallet.toLowerCase() === wallet.toLowerCase() ? username : "";
}

function storeUsernameForWallet(wallet: string, username: string) {
  localStorage.setItem(walletUsernameKey(wallet), username);
  localStorage.setItem("arcIdentityUsername", username);
  localStorage.setItem(usernameWalletKey(wallet), wallet.toLowerCase());
}

function isTimeoutError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|aborted|timeout|signal/i.test(message);
}

function validateUsername(value: string) {
  if (value.length < 3) return { valid: false, message: "Minimum 3 characters." };
  if (value.length > 30) return { valid: false, message: "Maximum 30 characters." };
  if (value.includes(" ")) return { valid: false, message: "No spaces allowed." };
  if (!/^[a-z0-9][a-z0-9_-]*[a-z0-9]$/.test(value)) return { valid: false, message: "Use lowercase letters, numbers, underscore, or hyphen only. Start and end with a letter or number." };
  return { valid: true, message: "Lowercase letters, numbers, underscore, or hyphen only." };
}

export default function CreateProfilePage() {
  const router = useRouter();
  const [walletAddress, setWalletAddress] = useState("");
  const [signature, setSignature] = useState("");
  const [signatureMessage, setSignatureMessage] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingProfile, setCheckingProfile] = useState(false);
  const [identityState, setIdentityState] = useState<ExistingIdentityState>("idle");
  const [existingUsername, setExistingUsername] = useState<string | null>(null);
  const [lookupWarning, setLookupWarning] = useState("");
  const [availability, setAvailability] = useState<AvailabilityState>("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const onboardingCompleteRef = useRef(false);
  const lastCheckedWalletRef = useRef("");
  const currentWalletRef = useRef("");

  const usernameValue = normalizeUsernameInput(username);
  const usernameValidation = validateUsername(usernameValue);
  const canClaim = Boolean(walletAddress && signature && signatureMessage && usernameValidation.valid && !loading && availability !== "taken");

  const checkExistingIdentity = useCallback(async (wallet: string, storedSignature: string, storedSignatureMessage: string, showFailureNote = false) => {
    if (onboardingCompleteRef.current) return;
    const lookupKey = wallet && storedSignature && storedSignatureMessage ? `${wallet.toLowerCase()}:${storedSignature}:${storedSignatureMessage}` : "";
    if (!wallet || !storedSignature || !storedSignatureMessage) {
      lastCheckedWalletRef.current = "";
      setExistingUsername(null);
      setSuccess("");
      setError("");
      setCheckingProfile(false);
      setIdentityState("idle");
      return;
    }
    if (!showFailureNote && lastCheckedWalletRef.current === lookupKey) return;
    lastCheckedWalletRef.current = lookupKey;

    setExistingUsername(null);
    setIdentityState("checking");
    setCheckingProfile(true);
    if (showFailureNote) setLookupWarning("");

    let ensureFailed = false;
    let scoreFailed = false;
    try {
      console.log("[arc-identity] ensure_profile_lookup_started", { wallet });
      const ensure = await fetchJsonWithTimeout<ProfileEnsureResponse>("/api/profile/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, signature: storedSignature, signatureMessage: storedSignatureMessage })
      }, identityLookupTimeoutMs);
      console.log("[arc-identity] ensure_profile_lookup_success", { wallet, username: ensure.profile?.username ?? null });
      const ensuredUsername = cleanUsername(ensure.profile?.username);
      if (ensuredUsername) {
        storeUsernameForWallet(wallet, ensuredUsername);
        localStorage.removeItem(lookupWarningKey);
        setExistingUsername(ensuredUsername);
        setIdentityState("claimed");
        setSuccess("Identity found. Opening profile...");
        console.log("[arc-identity] wallet_identity_route_decision", { wallet, route: "/profile/me", source: "profile_ensure_create_page" });
        router.replace("/profile/me");
        return;
      }
    } catch (ensureError) {
      ensureFailed = true;
      console.log(`[arc-identity] ${isTimeoutError(ensureError) ? "ensure_profile_lookup_timeout" : "ensure_profile_lookup_failed"}`, { wallet, error: ensureError instanceof Error ? ensureError.message : "Unknown error" });
    }

    try {
      console.log("[arc-identity] score_profile_fallback_started", { wallet });
      const score = await fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${wallet}`, {}, identityLookupTimeoutMs);
      console.log("[arc-identity] score_profile_fallback_success", { wallet, username: score.username ?? null });
      const scoreUsername = cleanUsername(score?.username);
      if (scoreUsername) {
        storeUsernameForWallet(wallet, scoreUsername);
        localStorage.removeItem(lookupWarningKey);
        setExistingUsername(scoreUsername);
        setIdentityState("claimed");
        setSuccess("Identity found. Opening profile...");
        console.log("[arc-identity] wallet_identity_route_decision", { wallet, route: "/profile/me", source: "score_fallback_create_page" });
        router.replace("/profile/me");
        return;
      }

      localStorage.removeItem("arcIdentityUsername");
      localStorage.removeItem(lookupWarningKey);
      setExistingUsername(null);
      setIdentityState("unclaimed");
      setSuccess("");
      console.log("[arc-identity] wallet_identity_route_decision", { wallet, route: "/create", source: "unclaimed_create_page" });
    } catch (scoreError) {
      scoreFailed = true;
      console.log(`[arc-identity] ${isTimeoutError(scoreError) ? "score_profile_fallback_timeout" : "score_profile_fallback_failed"}`, { wallet, error: scoreError instanceof Error ? scoreError.message : "Unknown error" });
      setExistingUsername(null);
      setIdentityState("unclaimed");
      if (showFailureNote) setLookupWarning("Could not verify an existing identity right now. You can still claim a username if this is a new wallet.");
      setError("");
      console.log("[arc-identity] wallet_identity_route_decision", { wallet, route: "/create", source: "lookup_failed_allow_claim" });
    } finally {
      if (ensureFailed && scoreFailed) {
        setIdentityState("unclaimed");
      }
      setCheckingProfile(false);
    }
  }, [router]);

  function retryLookup() {
    const wallet = localStorage.getItem("arcIdentityWallet") ?? walletAddress;
    const storedSignature = localStorage.getItem("arcIdentitySignature") ?? signature;
    const storedSignatureMessage = localStorage.getItem("arcIdentitySignatureMessage") ?? signatureMessage;
    lastCheckedWalletRef.current = "";
    void checkExistingIdentity(wallet, storedSignature, storedSignatureMessage, true);
  }

  function claimFormReady() {
    return Boolean(walletAddress && signature && signatureMessage && !existingUsername && identityState === "unclaimed" && !checkingProfile);
  }

  function likelyClaimed() {
    return !checkingProfile && identityState === "likely_claimed" && existingUsername;
  }

  function confirmedClaimed() {
    return !checkingProfile && identityState === "claimed" && existingUsername;
  }

  const syncWalletState = useCallback(() => {
    const wallet = localStorage.getItem("arcIdentityWallet") ?? "";
    const storedSignature = localStorage.getItem("arcIdentitySignature") ?? "";
    const storedSignatureMessage = localStorage.getItem("arcIdentitySignatureMessage") ?? "";
    const normalizedWallet = wallet.toLowerCase();
    const previousWallet = currentWalletRef.current;
    const walletChanged = Boolean(normalizedWallet && previousWallet && normalizedWallet !== previousWallet);
    if (walletChanged) {
      setUsername("");
      setExistingUsername(null);
      setSuccess("");
      setError("");
      setAvailability("idle");
      lastCheckedWalletRef.current = "";
    }
    currentWalletRef.current = normalizedWallet;
    setWalletAddress(wallet);
    setSignature(storedSignature);

      setSignatureMessage(storedSignatureMessage);
    setLookupWarning("");
    if (!wallet || !storedSignature || !storedSignatureMessage) {
      lastCheckedWalletRef.current = "";
      setExistingUsername(null);
      setIdentityState("idle");
      setCheckingProfile(false);
      return;
    }
    void checkExistingIdentity(wallet, storedSignature, storedSignatureMessage, false);
  }, [checkExistingIdentity]);

  useEffect(() => {
    syncWalletState();
  }, [syncWalletState]);

  useEffect(() => {
    if (!usernameValue || !usernameValidation.valid) {
      setAvailability("idle");
      return;
    }
    setAvailability("checking");
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/profile/${toArcUsername(usernameValue)}`, { cache: "no-store" });
        setAvailability(response.ok ? "taken" : "available");
      } catch {
        setAvailability("error");
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [usernameValue, usernameValidation.valid]);

  async function createProfile(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (loading) return;
    const storedSignature = localStorage.getItem("arcIdentitySignature") ?? signature;
    const storedSignatureMessage = localStorage.getItem("arcIdentitySignatureMessage") ?? signatureMessage;
    const wallet = localStorage.getItem("arcIdentityWallet") ?? walletAddress;
    if (!storedSignature || !storedSignatureMessage || !wallet) {
      setError("Connect and sign with your wallet before profile creation.");
      return;
    }
    if (!usernameValidation.valid) {
      setError(usernameValidation.message);
      return;
    }
    if (availability === "taken") {
      setError("Username already taken.");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("Creating your ARC Identity...");
    console.log("[arc-identity] username_claim_started", { wallet, username: usernameValue });

    try {
      const response = await fetch("/api/profile/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet, username: usernameValue, signature: storedSignature, signatureMessage: storedSignatureMessage })
      });
      const data = await response.json() as ProfileCreateResponse;
      if (!response.ok) throw new Error(data.error ?? "Unable to claim username");
      const claimedUsername = cleanUsername(data.username ?? data.profile?.username);
      const claimedWallet = cleanText(data.wallet_address ?? data.profile?.walletAddress ?? data.profile?.wallet_address);
      const verifiedWallet = Boolean(data.verified_wallet ?? data.profile?.verifiedWallet ?? data.profile?.verified_wallet);
      if (!data.success || !claimedUsername || !claimedWallet || !verifiedWallet || !data.usernameClaimed) {
        throw new Error("ARC Identity did not return a completed profile. Please retry claim.");
      }

      localStorage.setItem("arcIdentityWallet", claimedWallet);
      localStorage.setItem("arcIdentitySignature", storedSignature);
      localStorage.setItem("arcIdentitySignatureMessage", storedSignatureMessage);
      storeUsernameForWallet(claimedWallet, claimedUsername);
      localStorage.removeItem(lookupWarningKey);
      localStorage.removeItem(dashboardCacheKey(claimedWallet));
      localStorage.setItem(postClaimKey(claimedWallet), claimedUsername);
      setWalletAddress(claimedWallet);
      setSignature(storedSignature);

      setSignatureMessage(storedSignatureMessage);
      const byWalletResponse = await fetch(`/api/profile/by-wallet/${encodeURIComponent(claimedWallet)}?t=${Date.now()}`, {
        headers: { "Cache-Control": "no-store" },
        cache: "no-store"
      });
      const byWallet = await byWalletResponse.json().catch(() => null) as ProfileByWalletResponse | null;
      const byWalletUsername = cleanUsername(byWallet?.profile?.username ?? byWallet?.username);
      if (!byWalletResponse.ok || !byWallet?.usernameClaimed || byWalletUsername !== claimedUsername) {
        throw new Error("Profile was not saved. Please retry claim.");
      }
      const profileUrl = data.profileUrl ?? profileRouteFor(claimedUsername);
      const revealUrl = revealRouteFor(claimedUsername, claimedWallet);
      setPostClaimRevealContext(claimedWallet, claimedUsername, profileUrl, "claim-success");
      onboardingCompleteRef.current = true;
      setSuccess("Identity created. Opening your ARC Score...");
      console.log("[arc-identity] username_claim_success", { wallet: claimedWallet, username: claimedUsername });
      console.log("[arc-identity] username_claim_redirect_url", { wallet: claimedWallet, username: claimedUsername, profileUrl, revealUrl });
      console.log("[arc-identity] post_claim_identity_cache_updated", { wallet: claimedWallet, username: claimedUsername });
      router.replace(revealUrl);
    } catch (claimError) {
      const message = claimError instanceof Error ? claimError.message : "Unable to claim username";
      console.log("[arc-identity] username_claim_failed", { wallet, username: usernameValue, error: message });
      if (/already claimed for this wallet/i.test(message)) {
        const cachedUsername = cleanUsername(getTrustedCachedUsername(wallet));
        if (cachedUsername) {
          const revealUrl = revealRouteFor(cachedUsername, wallet);
          setPostClaimRevealContext(wallet, cachedUsername, profileRouteFor(cachedUsername), "already-claimed");
          console.log("[arc-identity] username_claim_redirect_url", { wallet, username: cachedUsername, revealUrl, source: "already_claimed" });
          router.replace(revealUrl);
        } else {
          router.replace("/create");
        }
        return;
      }
      if (/duplicate|already taken|unique/i.test(message)) {
        setAvailability("taken");
        setError("Username already taken.");
      } else {
        setError(message);
      }
      setSuccess("");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ArcShell>
      <section className="mx-auto grid w-full max-w-4xl flex-1 content-start py-6 sm:content-center sm:py-14">
        <div className="rounded border border-white/10 bg-slate-950/70 p-5 shadow-panel sm:p-8">
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-200">Create profile</p>
          <h1 className="mt-3 text-4xl font-black text-white">{existingUsername ? "Identity already claimed" : claimFormReady() ? "Create your ARC Identity" : "Claim your ARC Identity"}</h1>
          <form onSubmit={createProfile} className="mt-6 grid gap-4 sm:mt-8 sm:gap-5">
            <div className="rounded border border-emerald-300/30 bg-emerald-300/10 px-4 py-4 text-left">
              <span className="block font-bold text-emerald-100">Wallet identity</span>
              <span className="mt-1 block text-sm text-slate-400">
                {walletAddress ? `Connected ${shortenAddress(walletAddress)}` : "Connect an Arc-compatible EVM wallet before claiming a profile"}
              </span>
              <span className="mt-2 block text-sm text-slate-400">{signature ? "Signature verified" : "Signature required before profile creation"}</span>
              <span className="mt-4 block">
                <WalletConnectButton onConnect={syncWalletState} />
              </span>
            </div>
            {confirmedClaimed() || likelyClaimed() ? (
              <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-5">
                <p className="text-sm text-emerald-100/70">{identityState === "claimed" ? "This wallet already has a public ARC Identity." : "Local profile state indicates this identity is already claimed. Verification can be retried."}</p>
                <p className="mt-2 text-2xl font-black text-white">{existingUsername}</p>
                <div className="mt-4 flex flex-wrap gap-3">
                    <button type="button" onClick={() => router.push("/dashboard")} className="rounded bg-emerald-300 px-4 py-3 font-black text-slate-950 transition hover:bg-emerald-200">View Dashboard</button>
                  <button type="button" onClick={() => router.push("/profile/me")} className="rounded border border-white/10 px-4 py-3 font-bold text-white transition hover:bg-white/10">View Profile</button>
                  {identityState === "likely_claimed" ? <button type="button" onClick={retryLookup} className="rounded border border-white/10 px-4 py-3 font-bold text-white transition hover:bg-white/10">Retry</button> : null}
                </div>
              </div>
            ) : checkingProfile || identityState === "checking" ? (
              <div className="rounded border border-cyan-300/20 bg-cyan-300/[0.08] p-5">
                <p className="text-sm font-bold text-cyan-100">Checking ARC Identity profile...</p>
                <p className="mt-2 text-sm leading-6 text-slate-400">We are confirming whether this wallet already has a username before opening the claim form.</p>
              </div>
            ) : claimFormReady() ? (
              <div className="grid gap-4">
                {lookupWarning ? (
                  <div className="rounded border border-amber-300/20 bg-amber-300/10 p-4 text-sm text-amber-50">
                    <p>{lookupWarning}</p>
                    <button type="button" onClick={retryLookup} className="mt-3 rounded border border-amber-200/20 px-3 py-2 text-xs font-bold text-amber-50 transition hover:bg-amber-200/10">Retry identity check</button>
                  </div>
                ) : null}
                <label className="block">
                  <span className="text-sm font-medium text-slate-300">Username</span>
                  <div className="mt-2 flex rounded border border-white/10 bg-white/[0.04]">
                    <input
                      value={username}
                      onChange={(event) => {
                        setUsername(normalizeUsernameInput(event.target.value));
                        setError("");
                      }}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      className="min-w-0 flex-1 bg-transparent px-4 py-4 text-white outline-none"
                      placeholder="yourname"
                    />
                    <span className="border-l border-white/10 px-4 py-4 font-semibold text-emerald-200">.arcid</span>
                  </div>
                  <div className="mt-2 grid min-h-[4.75rem] content-start gap-1 text-xs leading-5 transition-none">
                    <p className={usernameValidation.valid ? "text-emerald-100/80" : "text-slate-500"}>{usernameValidation.message}</p>
                    {usernameValidation.valid && availability === "checking" ? <p className="text-cyan-100/80">Checking username...</p> : null}
                    {usernameValidation.valid && availability === "available" ? <p className="text-emerald-100/80">Username available.</p> : null}
                    {usernameValidation.valid && availability === "taken" ? <p className="text-rose-100">Username already taken.</p> : null}
                    {usernameValidation.valid && availability === "error" ? <p className="text-slate-500">Availability check unavailable. You can still try claiming.</p> : null}
                    {checkingProfile ? <p className="text-slate-500">New wallet? Claim a username to complete your ARC Identity.</p> : null}
                  </div>
                </label>
              </div>
            ) : null}
            <div className="min-h-[3.25rem]" aria-live="polite">
              {success ? <p className="rounded border border-emerald-300/20 bg-emerald-300/10 p-3 text-sm text-emerald-100">{success}</p> : null}
              {error ? <p className="rounded border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p> : null}
            </div>
            {claimFormReady() ? (
              <button type="submit" disabled={!canClaim} className="rounded bg-emerald-300 px-5 py-4 font-black text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50">
                {loading ? "Creating identity..." : "Claim username"}
              </button>
            ) : null}
          </form>
        </div>
      </section>
    </ArcShell>
  );
}
