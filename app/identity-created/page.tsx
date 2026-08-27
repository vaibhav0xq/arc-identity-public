"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArcShell } from "@/components/ArcShell";
import { ScoreRing } from "@/components/ScoreRing";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { publicAppUrl } from "@/lib/links";
import { clearPostClaimRevealContext, getPostClaimRevealContext } from "@/lib/onboarding";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { maybeArcUsername, profileRouteFor } from "@/lib/username";
import { shortenAddress } from "@/lib/wallet";

type ScoreLookupResponse = {
  username?: string | null;
  usernameClaimed?: boolean;
  arcIdentityScore?: number | null;
  riskLevel?: string | null;
  globalWalletAgeDays?: number | null;
  arcWalletAgeDays?: number | null;
  totalTxCount?: number | null;
  arcTxCount?: number | null;
  activeChains?: string[] | null;
  indexedChains?: unknown[] | null;
  explanations?: {
    globalWalletAge?: string;
    crossChainActivity?: string;
    arcActivity?: string;
  } | null;
  refreshInProgress?: boolean;
};

type ProfileEnsureResponse = {
  username?: string | null;
  usernameClaimed?: boolean;
  profile?: { username?: string | null } | null;
};

type RevealState = "loading" | "ready";
type RevealAccessState = "checking" | "allowed" | "blocked";

type RevealContext = {
  access: RevealAccessState;
  username: string | null;
  wallet: string | null;
  profileUrl: string | null;
};

const revealSteps = [
  "Creating your Kyro identity...",
  "Verifying wallet signature...",
  "Scanning wallet footprints...",
  "Preparing Identity Score..."
];

function readInitialRevealContext(): RevealContext {
  if (typeof window === "undefined") {
    return { access: "checking", username: null, wallet: null, profileUrl: null };
  }

  const reveal = getPostClaimRevealContext();
  if (!reveal) {
    return { access: "checking", username: null, wallet: null, profileUrl: null };
  }
  return {
    access: "allowed",
    username: reveal.username,
    wallet: reveal.wallet,
    profileUrl: reveal.profileUrl
  };
}

function scoreFor(score: ScoreLookupResponse | null) {
  const value = Number(score?.arcIdentityScore ?? 0);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value))) : 0;
}

function indexedChainsFor(score: ScoreLookupResponse | null) {
  const active = score?.activeChains?.length ?? 0;
  const indexed = Array.isArray(score?.indexedChains)
    ? score.indexedChains.filter((chain) => {
        if (!chain || typeof chain !== "object") return false;
        const value = chain as { status?: string; txCount?: number };
        return value.status === "indexed" && Number(value.txCount ?? 0) > 0;
      }).length
    : 0;
  return Math.max(active, indexed, 0);
}

function txCountFor(score: ScoreLookupResponse | null) {
  return Math.max(0, Number(score?.totalTxCount ?? score?.arcTxCount ?? 0));
}

function ageFor(score: ScoreLookupResponse | null) {
  return Math.max(0, Number(score?.globalWalletAgeDays ?? score?.arcWalletAgeDays ?? 0));
}

export default function IdentityCreatedPage() {
  const router = useRouter();
  const initialContext = readInitialRevealContext();
  const [accessState, setAccessState] = useState<RevealAccessState>(initialContext.access);
  const [state, setState] = useState<RevealState>("loading");
  const [score, setScore] = useState<ScoreLookupResponse | null>(null);
  const [scoreLoadFailed, setScoreLoadFailed] = useState(false);
  const [resolvedUsername, setResolvedUsername] = useState<string | null>(initialContext.username);
  const [resolvedWallet, setResolvedWallet] = useState<string | null>(initialContext.wallet);
  const [resolvedProfileUrl, setResolvedProfileUrl] = useState<string | null>(initialContext.profileUrl);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    const stepTimer = window.setInterval(() => {
      setStepIndex((current) => Math.min(revealSteps.length - 1, current + 1));
    }, 850);
    const reveal = getPostClaimRevealContext();
    const wallet = reveal?.wallet ?? "";
    const initialUsername = reveal?.username ?? null;
    const initialProfileUrl = reveal?.profileUrl ?? (initialUsername ? profileRouteFor(initialUsername) : null);

    setResolvedUsername(initialUsername);
    setResolvedWallet(wallet || null);
    setResolvedProfileUrl(initialProfileUrl);
    if (!wallet || !initialUsername) {
      setAccessState("blocked");
      window.clearInterval(stepTimer);
      return () => undefined;
    }
    setAccessState("allowed");

    let cancelled = false;
    async function loadReveal() {
      const startedAt = Date.now();
      const minDelayMs = 2600;
      let nextUsername = initialUsername;
      let nextScore: ScoreLookupResponse | null = null;

      /* Wallet-only ensure: a pure read since F-01, no signature required. */
      const ensurePromise = wallet
        ? fetchJsonWithTimeout<ProfileEnsureResponse>("/api/profile/ensure", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ walletAddress: wallet })
          }, 3000).catch(() => null)
        : Promise.resolve(null);

      const scorePromise = wallet
        ? fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${wallet}?t=${Date.now()}`, {}, 5000).catch(() => null)
        : Promise.resolve(null);

      const [ensure, scoreResponse] = await Promise.all([ensurePromise, scorePromise]);
      if (ensure?.usernameClaimed || ensure?.profile?.username || ensure?.username) {
        nextUsername = maybeArcUsername(ensure.profile?.username ?? ensure.username) ?? nextUsername;
      }
      nextScore = scoreResponse;
      if (nextScore?.username) nextUsername = maybeArcUsername(nextScore.username) ?? nextUsername;

      const elapsed = Date.now() - startedAt;
      if (elapsed < minDelayMs) await new Promise((resolve) => window.setTimeout(resolve, minDelayMs - elapsed));
      if (cancelled) return;

      setResolvedUsername(nextUsername);
      setResolvedProfileUrl(nextUsername ? profileRouteFor(nextUsername) : initialProfileUrl);
      setScore(nextScore);
      setScoreLoadFailed(!nextScore);
      setState("ready");
    }

    void loadReveal();
    return () => {
      cancelled = true;
      window.clearInterval(stepTimer);
    };
  }, []);

  const publicProfileHref = resolvedProfileUrl ?? (resolvedUsername ? `/profile/${resolvedUsername}` : "/profile/me");
  const profileHref = resolvedWallet ? publicProfileHref : "/create";
  const dashboardHref = "/dashboard";
  const displayUsername = resolvedUsername ?? "your Kyro identity";
  const displayWallet = resolvedWallet ? shortenAddress(resolvedWallet) : "Verified wallet";
  const arcScore = scoreFor(score);
  const riskLevel = score?.riskLevel ?? "High Risk";
  const walletAge = ageFor(score);
  const txCount = txCountFor(score);
  const chainsIndexed = indexedChainsFor(score);
  const freshWallet = txCount === 0 && chainsIndexed === 0;
  const publicProfileUrl = publicAppUrl(publicProfileHref);
  const shareText = `I just claimed my Kyro: ${displayUsername}\n\nPayments are solved, trust isn't.\n\nKyro brings onchain reputation, wallet intelligence and portable trust profiles to Arc users.\n\n${publicProfileUrl}\n\nBuilt by @vaibhav_0xq`;
  const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const scoreLoading = state === "loading" && !score;

  function leaveReveal(target: string) {
    clearPostClaimRevealContext(resolvedWallet, resolvedUsername);
    window.dispatchEvent(new Event("arc-identity-wallet-changed"));
    router.push(target);
  }

  if (accessState !== "allowed") {
    const checking = accessState === "checking";
    return (
      <ArcShell>
        <section className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center py-10">
          <div className="arc-surface w-full rounded-3xl p-7 text-center shadow-panel sm:p-10">
            <p className="arc-section-label">{checking ? "Preparing reveal" : "Identity reveal unavailable"}</p>
            <h1 className="mt-4 text-3xl font-black text-white sm:text-4xl">
              {checking ? "Preparing your Kyro identity reveal..." : "Connect your wallet to view the Kyro reveal."}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-slate-400">
              {checking
                ? "Preparing your identity summary from the completed claim."
                : "The reveal page needs the wallet and username from the completed claim. Reconnect the wallet or return to the claim flow."}
            </p>
            {!checking ? (
              <div className="mx-auto mt-7 flex max-w-sm flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
                <WalletConnectButton />
                <Link href="/create" className="arc-button-secondary px-5 py-3 text-sm font-bold">Back to claim</Link>
              </div>
            ) : null}
          </div>
        </section>
      </ArcShell>
    );
  }

  return (
    <ArcShell>
      <section className="mx-auto grid min-h-[72vh] w-full max-w-5xl place-items-center py-10">
        <div className="arc-surface relative w-full overflow-hidden rounded-3xl p-7 shadow-[0_32px_120px_rgba(16,185,129,0.12)] sm:p-10">
          <div className="pointer-events-none absolute -left-24 top-8 h-64 w-64 rounded-full bg-emerald-300/15 blur-3xl" />
          <div className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-cyan-300/10 blur-3xl" />
          <div className="relative grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <p className="arc-section-label">Kyro created</p>
              <h1 className="mt-4 text-4xl font-black tracking-tight text-white sm:text-5xl">
                {state === "loading" ? revealSteps[stepIndex].replace("...", "") : "Your Kyro is live"}
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
                {state === "loading"
                  ? "We are preparing your wallet intelligence without blocking your new identity."
                  : "Your identity is ready now. Wallet intelligence will keep enriching in the background as more verified activity is indexed."}
              </p>

              {state === "loading" ? (
                <div className="mt-8 grid gap-4">
                  {revealSteps.map((label, index) => (
                    <div key={label} className={index <= stepIndex ? "rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.055] p-4 transition-all duration-500" : "rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 opacity-55 transition-all duration-500"}>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-bold text-slate-200">{label}</span>
                        <span className={index <= stepIndex ? "h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_18px_rgba(110,231,183,0.8)]" : "h-2 w-2 rounded-full bg-white/20"} />
                      </div>
                      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 transition-all duration-700" style={{ width: index < stepIndex ? "100%" : index === stepIndex ? `${45 + index * 14}%` : "0%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-8 flex flex-wrap gap-3">
                <button type="button" onClick={() => leaveReveal(dashboardHref)} className="arc-button-primary px-5 py-3 text-sm font-extrabold">Continue to Dashboard</button>
                <button type="button" onClick={() => leaveReveal(profileHref)} className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-extrabold text-white transition hover:bg-white/[0.08]">View Public Profile</button>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] px-5 py-3 text-sm font-extrabold text-cyan-100 transition hover:bg-cyan-300/[0.1]">Share on X</a>
              </div>
            </div>

            <div className="rounded-3xl border border-white/[0.08] bg-slate-950/55 p-6 shadow-panel backdrop-blur">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-emerald-200">Public identity</p>
                  <h2 className="mt-2 break-all text-2xl font-black text-white">{displayUsername}</h2>
                  <p className="mt-1 text-sm text-slate-400">{displayWallet}</p>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-100">Verified</span>
              </div>

              <div className="mt-8 grid gap-4 sm:grid-cols-[0.9fr_1.1fr]">
                <div className="grid min-h-52 place-items-center">
                  {scoreLoading ? (
                    <div className="grid h-44 w-44 place-items-center rounded-full border border-emerald-300/20 bg-emerald-300/[0.055] text-center shadow-[0_0_60px_rgba(16,185,129,0.12)]">
                      <span className="px-5 text-sm font-black leading-6 text-emerald-100">Preparing your Identity Score...</span>
                    </div>
                  ) : (
                    <ScoreRing score={arcScore} />
                  )}
                </div>
                <div className="grid gap-3">
                  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Risk tier</p>
                    <p className="mt-2 text-lg font-black text-white">{scoreLoading ? "Preparing" : riskLevel}</p>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
                      <p className="text-xs text-slate-500">Age</p>
                      <p className="mt-1 font-black text-white">{walletAge}d</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
                      <p className="text-xs text-slate-500">Tx</p>
                      <p className="mt-1 font-black text-white">{txCount}</p>
                    </div>
                    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3">
                      <p className="text-xs text-slate-500">Chains</p>
                      <p className="mt-1 font-black text-white">{chainsIndexed}</p>
                    </div>
                  </div>
                </div>
              </div>

              <p className="mt-6 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-sm leading-6 text-cyan-50/80">
                {scoreLoading
                  ? "Preparing your Identity Score. Your identity is live and wallet intelligence will appear as indexing completes."
                  : scoreLoadFailed
                    ? "Score will appear once wallet intelligence finishes indexing."
                    : freshWallet
                  ? "No wallet footprints found yet. ARC Intelligence will update as this wallet becomes active."
                  : "Your Identity Score prioritizes Arc ecosystem activity, verified attestations, trusted counterparties and trust graph strength. Global wallet history supports maturity confidence."}
              </p>
              {score?.refreshInProgress ? <p className="mt-3 text-xs font-semibold text-slate-500">Wallet intelligence is still indexing. You can continue using Kyro.</p> : null}
            </div>
          </div>
        </div>
      </section>
    </ArcShell>
  );
}

