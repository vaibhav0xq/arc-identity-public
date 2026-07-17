"use client";

import { useState } from "react";
import { useArcIdentity } from "@/hooks/useArcIdentity";

export function ProfileNavButton() {
  const { identity, refreshIdentity } = useArcIdentity();
  const [error, setError] = useState("");

  async function openProfile() {
    setError("");
    console.log("[arc-identity] profile_nav_click", {
      wallet: identity.normalizedWallet,
      status: identity.status,
      source: identity.source
    });

    if (identity.status === "claimed") {
      const targetUrl = identity.profileUrl || "/profile/me";
      console.log("[arc-identity] profile_nav_final_url", { wallet: identity.normalizedWallet, url: targetUrl, source: identity.source });
      window.location.href = targetUrl;
      return;
    }

    if (identity.status === "unclaimed") {
      console.log("[arc-identity] profile_nav_final_url", { wallet: identity.normalizedWallet, url: "/create", reason: identity.status });
      window.location.href = "/create";
      return;
    }

    await refreshIdentity(identity.normalizedWallet);
    const wallet = identity.normalizedWallet;
    const cached = wallet ? localStorage.getItem(`arcIdentity:${wallet}:claimed`) === "true" : false;
    if (cached) {
      window.location.href = "/profile/me";
    } else {
      setError("Still checking identity. Try again.");
    }
  }

  if (identity.status === "disconnected") return null;

  const label = identity.status === "claimed"
    ? "View Profile"
    : identity.status === "unclaimed"
      ? "Claim username"
      : "Checking profile...";

  return (
    <span className="relative inline-flex w-full flex-col lg:w-auto">
      <button
        type="button"
        onClick={openProfile}
        disabled={identity.status === "checking"}
        className="h-10 w-full whitespace-nowrap rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 text-sm font-bold text-emerald-100 transition duration-200 hover:border-emerald-300/40 hover:bg-emerald-300/15 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 lg:w-auto"
      >
        {label}
      </button>
      {error ? <span className="absolute left-0 top-[calc(100%+0.35rem)] z-50 w-44 rounded-lg border border-rose-300/20 bg-rose-950/95 px-3 py-2 text-xs font-semibold text-rose-100 shadow-xl">{error}</span> : null}
    </span>
  );
}
