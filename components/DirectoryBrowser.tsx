"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { IdentityRecord, RiskLevel } from "@/lib/types";
import { shortenAddress } from "@/lib/wallet";

type DirectoryBrowserProps = {
  users: IdentityRecord[];
  currentSort: SortKey;
  initialLimit?: number;
};

type SortKey = "score" | "activity" | "newest" | "risk";
type QuickFilter = "Reliable" | "New / Unproven" | "High Risk" | "Has Trust Network" | "Arc Active";

const sortLabels: Record<SortKey, string> = {
  score: "Highest score",
  activity: "Most active",
  newest: "Newest",
  risk: "Lowest risk"
};

const quickFilters: QuickFilter[] = ["Reliable", "New / Unproven", "High Risk", "Has Trust Network", "Arc Active"];
const DEFAULT_DIRECTORY_LIMIT = 250;

function riskClass(risk: RiskLevel) {
  if (risk === "Trusted") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (risk === "Reliable") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (risk === "New / Unproven") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-400/10 text-rose-100";
}

function hasTrustNetwork(item: IdentityRecord) {
  return (item.trustGraph?.snapshot?.trustedPeerCount ?? item.trustConnections?.length ?? item.uniqueCounterparties ?? 0) > 0;
}

function isArcActive(item: IdentityRecord) {
  const arcChain = item.multiChain?.chains.find((chain) => chain.chain.toLowerCase().includes("arc"));
  return (arcChain?.txCount ?? item.snapshot?.txCount ?? item.profile.txCount ?? 0) > 0;
}

function matchesQuickFilter(item: IdentityRecord, filter: QuickFilter) {
  if (filter === "Has Trust Network") return hasTrustNetwork(item);
  if (filter === "Arc Active") return isArcActive(item);
  return item.score.riskLevel === filter;
}

function activeChainCount(item: IdentityRecord) {
  return item.multiChain?.activeChains.length ?? item.profile.activeChainCount ?? 0;
}

function directoryUsernames(rows: IdentityRecord[]) {
  return rows.map((item) => item.profile.username).filter(Boolean).map((username) => String(username).toLowerCase()).sort();
}

export function DirectoryBrowser({ users, currentSort, initialLimit = DEFAULT_DIRECTORY_LIMIT }: DirectoryBrowserProps) {
  const [serverUsers, setServerUsers] = useState(users);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<QuickFilter[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(users.length === 0);
  const [hasLoaded, setHasLoaded] = useState(users.length > 0);
  const [reloadNonce, setReloadNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const normalizedQuery = query.trim();
    async function loadLatestDirectory() {
      setLoadError("");
      setLoading(true);
      console.log("[arc-identity] directory_fetch_started", { source: "client", sort: currentSort, hasSearch: Boolean(normalizedQuery) });
      try {
        const params = new URLSearchParams({
          sort: currentSort,
          limit: String(initialLimit),
          t: String(Date.now())
        });
        if (normalizedQuery) params.set("q", normalizedQuery);
        const response = await fetch(`/api/users?${params.toString()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-store" }
        });
        const data = await response.json().catch(() => null) as { users?: IdentityRecord[]; error?: string } | null;
        if (cancelled) return;
        if (!response.ok) throw new Error(data?.error ?? "Unable to load directory");
        const fetchedUsers = data?.users ?? [];
        if (process.env.NODE_ENV !== "production" && !normalizedQuery) {
          const initialNames = new Set(directoryUsernames(users));
          const fetchedNames = new Set(directoryUsernames(fetchedUsers));
          const onlyInInitial = Array.from(initialNames).filter((username) => !fetchedNames.has(username));
          const onlyInFetched = Array.from(fetchedNames).filter((username) => !initialNames.has(username));
          if (onlyInInitial.length || onlyInFetched.length) {
            console.warn("[arc-identity] directory_initial_fetch_mismatch", {
              initialCount: users.length,
              fetchedCount: fetchedUsers.length,
              onlyInInitial,
              onlyInFetched
            });
          }
        }
        setServerUsers(fetchedUsers);
        setHasLoaded(true);
        console.log("[arc-identity] directory_fetch_success", { source: "client", count: fetchedUsers.length });
      } catch (error) {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Unable to refresh directory");
        setHasLoaded(true);
        console.warn("[arc-identity] directory_fetch_failed", { source: "client", error: error instanceof Error ? error.message : "Unknown error" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    const timer = window.setTimeout(() => {
      void loadLatestDirectory();
    }, normalizedQuery ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [currentSort, initialLimit, query, users, reloadNonce]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return serverUsers.filter((item) => {
      const username = item.profile.username ?? "";
      const wallet = item.profile.walletAddress;
      const shortened = shortenAddress(wallet);
      const matchesSearch = !normalizedQuery || [username, wallet, shortened].some((value) => value.toLowerCase().includes(normalizedQuery));
      const matchesFilters = activeFilters.length === 0 || activeFilters.every((filter) => matchesQuickFilter(item, filter));
      return matchesSearch && matchesFilters;
    });
  }, [activeFilters, query, serverUsers]);

  function toggleFilter(filter: QuickFilter) {
    setActiveFilters((current) => current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]);
  }

  return (
    <div className="grid gap-5">
      <div className="arc-surface rounded-2xl p-5">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto] xl:items-end">
          <label className="block">
            <span className="arc-section-label">Search identities</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search username or wallet address"
              className="arc-input mt-3 w-full px-4 py-3 text-sm outline-none placeholder:text-slate-500"
            />
          </label>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between xl:justify-end">
            <div className="pb-3 text-sm text-slate-400 sm:pb-0 xl:pb-3">
              {loading ? (
                <span className="font-bold text-slate-300">Loading registered identities...</span>
              ) : (
                <><span className="font-black text-white">{filteredUsers.length}</span> of <span className="font-bold text-white">{serverUsers.length}</span> identities</>
              )}
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-3 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
              <details className="group relative min-w-0">
                <summary className="flex w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition duration-200 hover:border-white/[0.12] hover:bg-white/[0.07] sm:w-auto">
                  Sort: <span className="text-emerald-200">{sortLabels[currentSort]}</span>
                </summary>
                <div className="absolute left-0 z-[70] mt-2 w-full min-w-52 overflow-hidden rounded-xl border border-white/[0.08] bg-[rgba(8,16,22,0.98)] shadow-panel backdrop-blur-xl sm:left-auto sm:right-0 sm:w-52">
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <Link key={key} href={`/directory?sort=${key}`} className={key === currentSort ? "block bg-emerald-300 px-4 py-3 text-sm font-extrabold text-slate-950" : "block px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"}>
                      {sortLabels[key]}
                    </Link>
                  ))}
                </div>
              </details>
              <details className="group relative min-w-0">
                <summary className="flex w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition duration-200 hover:border-white/[0.12] hover:bg-white/[0.07] sm:w-auto">
                  Filters{activeFilters.length ? <span className="rounded bg-emerald-300 px-2 py-0.5 text-xs font-black text-slate-950">({activeFilters.length})</span> : null}
                </summary>
                <div className="absolute left-0 z-[70] mt-2 w-full min-w-60 overflow-hidden rounded-xl border border-white/[0.08] bg-[rgba(8,16,22,0.98)] p-2 shadow-panel backdrop-blur-xl sm:left-auto sm:right-0 sm:w-60">
                  {quickFilters.map((filter) => {
                    const active = activeFilters.includes(filter);
                    return (
                      <button key={filter} onClick={() => toggleFilter(filter)} className={active ? "block w-full rounded-lg bg-emerald-300 px-3.5 py-2.5 text-left text-sm font-extrabold text-slate-950" : "block w-full rounded-lg px-3.5 py-2.5 text-left text-sm font-bold text-slate-300 transition hover:bg-white/[0.07] hover:text-white"}>
                        {filter}
                      </button>
                    );
                  })}
                  <button onClick={() => setActiveFilters([])} className="mt-1 block w-full rounded-lg border border-white/[0.08] px-3.5 py-2.5 text-left text-sm font-bold text-slate-400 transition hover:bg-white/[0.07] hover:text-white">
                    Clear filters
                  </button>
                </div>
              </details>
            </div>
          </div>
        </div>
        {activeFilters.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {activeFilters.map((filter) => (
              <button key={filter} onClick={() => toggleFilter(filter)} className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-xs font-bold text-emerald-100 transition hover:bg-emerald-300/15">
                {filter} &times;
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-300/20 bg-rose-400/10 p-3.5 text-sm text-rose-100">
          <span>Directory refresh failed. {serverUsers.length ? "Current results remain visible." : "Retry loading registered identities."}</span>
          <button type="button" onClick={() => setReloadNonce((current) => current + 1)} className="rounded border border-rose-200/20 px-3 py-2 text-xs font-bold text-rose-50 transition hover:bg-rose-200/10">Retry</button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/65 shadow-panel">
        <div className="hidden grid-cols-[1.2fr_0.45fr_0.55fr_0.55fr_0.6fr_0.7fr_0.55fr] gap-3 border-b border-white/[0.08] bg-white/[0.025] px-5 py-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400 lg:grid">
          <span>Identity</span><span>Score</span><span>Global Age</span><span>Arc Age</span><span>Chains</span><span>Risk</span><span>Profile</span>
        </div>
        {loading ? (
          <p className="p-5 text-slate-400">Loading registered identities...</p>
        ) : hasLoaded && serverUsers.length === 0 ? (
          <p className="p-5 text-slate-400">No ARC Identity profiles registered yet.</p>
        ) : filteredUsers.length === 0 ? (
          <p className="p-5 text-slate-400">No matching identities found.</p>
        ) : filteredUsers.map((item) => {
          const username = item.profile.username;
          const profileHref = item.profileUrl ?? (username ? `/profile/${username}` : undefined);
          const row = (
            <div className="grid gap-4 border-b border-white/[0.05] px-5 py-4 text-sm transition duration-200 hover:bg-white/[0.04] lg:grid-cols-[1.2fr_0.45fr_0.55fr_0.55fr_0.6fr_0.7fr_0.55fr] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-base font-extrabold text-white">{username}</p>
                <p className="mt-1 truncate text-xs text-slate-400">{shortenAddress(item.profile.walletAddress)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500 lg:hidden">Score</p>
                <p className="text-xl font-extrabold tabular-nums text-emerald-200">{item.score.arcScore}</p>
              </div>
              <div><p className="text-xs text-slate-500 lg:hidden">Global Age</p><p className="font-bold text-slate-300">{item.multiChain?.globalWalletAgeDays ?? item.profile.globalWalletAgeDays}d</p></div>
              <div><p className="text-xs text-slate-500 lg:hidden">Arc Age</p><p className="font-bold text-slate-300">{item.snapshot?.walletAgeDays ?? item.profile.arcWalletAgeDays}d</p></div>
              <div>
                <p className="text-xs text-slate-500 lg:hidden">Active Chains</p>
                <span className="inline-flex rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-black text-cyan-100">{activeChainCount(item)} chains</span>
              </div>
              <div>
                <p className="text-xs text-slate-500 lg:hidden">Risk</p>
                <span className={`inline-flex rounded border px-2 py-1 text-xs font-black ${riskClass(item.score.riskLevel)}`}>{item.score.riskLevel}</span>
              </div>
              <div>
                {profileHref ? <span className="inline-flex rounded border border-white/10 px-3 py-2 text-xs font-bold text-white transition group-hover:border-emerald-300/30 group-hover:bg-white/[0.07]">View profile</span> : null}
              </div>
            </div>
          );
          return profileHref ? <Link key={item.profile.id} href={profileHref} className="group block">{row}</Link> : <div key={item.profile.id}>{row}</div>;
        })}
      </div>
    </div>
  );
}
