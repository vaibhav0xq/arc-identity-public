"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  if (risk === "Trusted" || risk === "Reliable") return "green";
  if (risk === "New / Unproven") return "amber";
  return String(risk).toLowerCase().includes("high") ? "rose" : "amber";
}

function filterClass(filter: QuickFilter) {
  if (filter === "Reliable") return "green";
  if (filter === "High Risk") return "rose";
  return "amber";
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
  const sortMenuRef = useRef<HTMLDetailsElement>(null);
  const filtersMenuRef = useRef<HTMLDetailsElement>(null);

  // Sort and Filters are native <details> menus: keep only one open at a
  // time and close them when clicking anywhere else on the page.
  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      for (const ref of [sortMenuRef, filtersMenuRef]) {
        if (ref.current?.open && !ref.current.contains(event.target as Node)) {
          ref.current.open = false;
        }
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

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
    <div className="grid gap-8">
      <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
        <div>
          <p className="kicker">Public identity registry</p>
          <h1 className="mt-3 text-6xl leading-[0.88] tracking-[-0.065em] text-ink sm:text-7xl lg:text-[7.5rem]">Directory</h1>
          <p className="mt-5 max-w-xl text-[0.98rem] leading-7 text-mutedc">Searchable credentials with evidence behind every score.</p>
        </div>
        <div className="public-score text-left lg:min-w-[190px] lg:text-right">
          <span className="kicker">Indexed identities</span>
          <strong className="mt-3 block font-heading text-6xl leading-[0.8] tracking-[-0.07em] text-ink sm:text-7xl">{loading ? "…" : serverUsers.length.toLocaleString()}</strong>
        </div>
      </div>

      <div className="r4-panel">
        <div className="r4-panel-head flex-wrap items-end px-0">
          <label className="block min-w-0 flex-1">
            <span className="kicker">Search registry</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Username, wallet address or chain"
              className="arc-input mt-3 w-full px-4 py-3 font-mono text-sm outline-none placeholder:text-quiet"
            />
          </label>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <div className="font-mono text-xs text-mutedc sm:pb-3">
              {loading ? (
                <span>Loading registry...</span>
              ) : (
                <><span className="font-bold text-ink">{filteredUsers.length}</span> / {serverUsers.length} results</>
              )}
            </div>
            <div className="grid w-full min-w-0 grid-cols-1 gap-2 min-[390px]:grid-cols-2 sm:flex sm:w-auto sm:flex-wrap">
              <details ref={sortMenuRef} onToggle={() => { if (sortMenuRef.current?.open && filtersMenuRef.current) filtersMenuRef.current.open = false; }} className="group relative min-w-0">
                <summary className="arc-button-secondary flex w-full cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 font-mono text-xs sm:w-auto">
                  Sort <span className="text-gold">/ {sortLabels[currentSort]}</span>
                </summary>
                <div className="absolute left-0 z-[70] mt-2 w-full min-w-52 overflow-hidden rounded-[2px] border border-linec bg-bone shadow-panel sm:left-auto sm:right-0 sm:w-52">
                  {(Object.keys(sortLabels) as SortKey[]).map((key) => (
                    <Link key={key} href={`/directory?sort=${key}`} onClick={() => { if (sortMenuRef.current) sortMenuRef.current.open = false; }} className={key === currentSort ? "block bg-gold-bg px-4 py-3 text-sm font-bold text-ink" : "block px-4 py-3 text-sm font-semibold text-mutedc transition hover:bg-paper-deep hover:text-ink"}>
                      {sortLabels[key]}
                    </Link>
                  ))}
                </div>
              </details>
              <details ref={filtersMenuRef} onToggle={() => { if (filtersMenuRef.current?.open && sortMenuRef.current) sortMenuRef.current.open = false; }} className="group relative min-w-0">
                <summary className="arc-button-secondary flex w-full cursor-pointer list-none items-center justify-center gap-2 px-4 py-3 font-mono text-xs sm:w-auto">
                   Filters{activeFilters.length ? <span className="font-mono text-gold"> / {activeFilters.length}</span> : null}
                </summary>
                <div className="absolute left-0 z-[70] mt-2 w-full min-w-60 overflow-hidden rounded-[2px] border border-linec bg-bone p-2 shadow-panel sm:left-auto sm:right-0 sm:w-60">
                  {quickFilters.map((filter) => {
                    const active = activeFilters.includes(filter);
                     return (
                       <button key={filter} onClick={() => toggleFilter(filter)} className={active ? `chip ${filterClass(filter)} my-1 w-full justify-start px-3.5 py-2.5 text-left font-bold` : "block w-full px-3.5 py-2.5 text-left text-sm font-semibold text-mutedc transition hover:bg-paper-deep hover:text-ink"}>
                        {filter}
                      </button>
                    );
                  })}
                   <button onClick={() => setActiveFilters([])} className="mt-1 block w-full border-t border-linec px-3.5 py-2.5 text-left text-sm font-semibold text-mutedc transition hover:text-ink">
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
               <button key={filter} onClick={() => toggleFilter(filter)} className={`chip ${filterClass(filter)} font-mono font-bold transition`}>
                {filter} &times;
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {loadError ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-limited bg-limited-bg p-3.5 text-sm text-limited">
          <span>Directory refresh failed. {serverUsers.length ? "Current results remain visible." : "Retry loading registered identities."}</span>
          <button type="button" onClick={() => setReloadNonce((current) => current + 1)} className="arc-button-secondary px-3 py-2 text-xs font-bold">Retry</button>
        </div>
      ) : null}

      <div className="r4-panel overflow-x-auto">
        <div className="min-w-[780px]">
        <div className="registry-row head bg-paper-deep">
          <span>Identity</span><span>Score</span><span>Risk</span><span>Credential age</span><span>Coverage</span><span>Action</span>
        </div>
        {loading ? (
          <p className="shimmer p-5 font-mono text-sm text-mutedc">Loading registered identities...</p>
        ) : hasLoaded && serverUsers.length === 0 ? (
          <p className="p-8 font-mono text-sm text-mutedc">No Arc Identity profiles registered yet.</p>
        ) : filteredUsers.length === 0 ? (
          <p className="p-8 font-mono text-sm text-mutedc">No matching identities found.</p>
        ) : filteredUsers.map((item) => {
          const username = item.profile.username;
          const profileHref = item.profileUrl ?? (username ? `/profile/${username}` : undefined);
          const row = (
            <div className="registry-row group transition-colors duration-150 hover:bg-paper-deep">
              <div className="identity-name min-w-0">
                <p className="truncate text-[0.95rem] font-bold text-ink">{username}</p>
                <p className="mt-1 truncate font-mono text-xs text-mutedc">{shortenAddress(item.profile.walletAddress)}</p>
              </div>
              <div>
                <p className="font-heading text-4xl leading-none tabular-nums text-ink">{item.score.arcScore}</p>
              </div>
              <div>
                <span className={`chip ${riskClass(item.score.riskLevel)}`}><span className="dot" />{item.score.riskLevel}</span>
              </div>
              <div className="font-mono text-sm text-mutedc">{Math.round((item.multiChain?.globalWalletAgeDays ?? item.profile.globalWalletAgeDays ?? 0) / 365 * 10) / 10}y</div>
              <div className="font-mono text-sm text-mutedc">{activeChainCount(item)} chains</div>
              <div>{profileHref ? <span className="font-mono text-xs font-bold text-gold">View profile →</span> : null}</div>
            </div>
          );
          return profileHref ? <Link key={item.profile.id} href={profileHref} className="group block">{row}</Link> : <div key={item.profile.id}>{row}</div>;
        })}
        </div>
      </div>
    </div>
  );
}
