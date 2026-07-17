"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { WalletGate } from "@/components/WalletGate";
import { useArcIdentity } from "@/hooks/useArcIdentity";

type ResolverState = "idle" | "resolving" | "success" | "failed";

export default function MyProfileResolverPage() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { identity, refreshIdentity } = useArcIdentity();
  const [resolverState, setResolverState] = useState<ResolverState>("idle");
  const [message, setMessage] = useState("Opening your ARC Identity...");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const wallet = identity.normalizedWallet;

    function transition(next: ResolverState, details: Record<string, unknown> = {}) {
      setResolverState(next);
      console.log("[arc-identity] identity_state_transition", { component: "ProfileMeResolver", to: next, wallet, ...details });
      console.log("[arc-identity] overlay_visibility_changed", { visible: next === "resolving", state: next, wallet, ...details });
    }

    async function resolveProfile() {
      transition("resolving");
      setMessage("Opening your ARC Identity...");
      console.log("[arc-identity] resolver_started", { wallet, status: identity.status, source: identity.source });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        console.warn("[arc-identity] resolver_timeout", { wallet });
        setMessage("Could not open your ARC Identity. Retry.");
        transition("failed", { reason: "timeout" });
      }, 8000);

      if (identity.status === "disconnected") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        transition("failed", { reason: "disconnected" });
        setMessage("Connect your wallet to open your ARC Identity.");
        return;
      }

      if (identity.status === "unclaimed") {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        console.log("[arc-identity] resolver_completed", { wallet, target: "/create", reason: identity.status });
        window.location.replace("/create");
        return;
      }

      if (identity.status === "error" && wallet) {
        await refreshIdentity(wallet);
        return;
      }

      if (identity.status === "claimed" && identity.profileUrl) {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        transition("success", { target: identity.profileUrl });
        console.log("[arc-identity] resolver_completed", { wallet, target: identity.profileUrl, username: identity.username });
        window.location.replace(identity.profileUrl);
        setTimeout(() => {
          if (!cancelled && window.location.pathname === "/profile/me") window.location.href = identity.profileUrl!;
        }, 450);
        return;
      }
    }

    void resolveProfile();
    return () => {
      cancelled = true;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      console.log("[arc-identity] resolver_cancelled", { route: "/profile/me", wallet });
    };
  }, [identity.normalizedWallet, identity.profileUrl, identity.source, identity.status, identity.username, refreshIdentity, retryKey]);

  return (
    <ArcShell>
      <WalletGate
        sectionLabel="Public profile"
        title="Connect your wallet to open your ARC Identity."
        description="Connect your wallet to open your public ARC Identity profile."
      >
      <section className="mx-auto flex min-h-[64vh] max-w-2xl items-center py-10">
        <div className="arc-surface w-full rounded-3xl p-7 text-center sm:p-10">
          <p className="arc-section-label">ARC Identity</p>
          <h1 className="mt-4 text-3xl font-black text-white">{message}</h1>
          <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-slate-400">
            Resolving your connected wallet to the canonical public ARC Identity profile.
          </p>
          {resolverState === "resolving" || resolverState === "success" ? (
            <div className="mx-auto mt-8 h-1.5 max-w-sm overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full w-2/3 animate-pulse rounded-full bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300" />
            </div>
          ) : resolverState === "failed" ? (
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <button onClick={() => setRetryKey((value) => value + 1)} className="arc-button-primary px-5 py-3 text-sm font-extrabold">
                Retry
              </button>
              <Link href="/create" className="arc-button-secondary px-5 py-3 text-sm font-bold">
                Claim username
              </Link>
            </div>
          ) : null}
        </div>
      </section>
      </WalletGate>
    </ArcShell>
  );
}
