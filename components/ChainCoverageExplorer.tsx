"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ChainSnapshot } from "@/lib/types";

type ChainCoverageExplorerProps = {
  chains?: ChainSnapshot[];
  title?: string;
};

type DisplayChainStatus = "indexed" | "no_activity" | "limited" | "pending" | "error";

const providerIssuePattern = /provider|timeout|timed out|api|rate limit|429|missing key|api key|not configured|unavailable|failed to fetch|network|fetch failed|econn|etherscan|blockscout|arcscan|rpc|coverage|free tier|paid plan|requires paid/i;
const internalFailurePattern = /internal application|application failure|invariant|database|supabase|schema|constraint|serialization|unexpected app/i;

function displayStatus(chain: ChainSnapshot): DisplayChainStatus {
  if (chain.status === "indexed") return "indexed";
  if (chain.status === "no_activity") return "no_activity";
  if (chain.status === "limited" || chain.status === "not_configured") return "limited";
  if (!chain.indexedAt && !chain.errorMessage) return "pending";
  if (chain.status === "error") {
    const message = `${chain.errorMessage ?? ""} ${chain.providerSource ?? ""}`;
    return internalFailurePattern.test(message) && !providerIssuePattern.test(message) ? "error" : "limited";
  }
  return "pending";
}

function statusLabel(chain: ChainSnapshot) {
  const status = displayStatus(chain);
  if (status === "indexed") return "INDEXED";
  if (status === "no_activity") return "NO ACTIVITY";
  if (status === "limited") return "LIMITED";
  if (status === "pending") return "PENDING";
  return "ERROR";
}

function statusClass(chain: ChainSnapshot) {
  const status = displayStatus(chain);
  if (status === "indexed") return "border-verified/50 bg-verified-bg text-verified";
  if (status === "no_activity" || status === "pending") return "border-linec bg-paper-deep text-mutedc";
  if (status === "limited") return "border-limited/50 bg-limited-bg text-limited";
  return "border-risk/50 bg-risk-bg text-risk";
}

function providerText(chain: ChainSnapshot) {
  const status = displayStatus(chain);
  if (status === "limited") return "External provider temporarily unavailable.";
  if (status === "pending") return "Indexing pending.";
  if (status === "error") return "Internal application issue detected.";
  return chain.providerSource || "Provider unknown";
}

function formatDate(value: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not enough indexed data";
  return date.toLocaleDateString();
}

function countLimitedProviderChains(chains: ChainSnapshot[]) {
  return chains.filter((chain) => displayStatus(chain) === "limited").length;
}

export function ChainCoverageExplorer({ chains = [], title = "Chain Coverage" }: ChainCoverageExplorerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const summary = useMemo(() => ({
    indexed: chains.filter((chain) => displayStatus(chain) === "indexed").length,
    noActivity: chains.filter((chain) => displayStatus(chain) === "no_activity").length,
    limitedProvider: countLimitedProviderChains(chains)
  }), [chains]);

  const filteredChains = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return chains;
    return chains.filter((chain) => [
      chain.chain,
      displayStatus(chain),
      statusLabel(chain),
      chain.providerSource,
      chain.errorMessage ?? ""
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [chains, query]);

  return (
    <section className="r4-panel">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="arc-section-label">{title}</p>
          <p className="mt-2.5 max-w-2xl text-[0.8125rem] leading-relaxed text-mutedc">Chain-level infrastructure intelligence is available when needed, while the main view stays focused on score, trust and verified activity.</p>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-[2px] border border-linec px-2.5 py-[5px] font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-gold hover:bg-gold/10 disabled:cursor-not-allowed disabled:opacity-60" disabled={chains.length === 0}>
          View chains
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true"><path d="M1.5 8.5L8.5 1.5M8.5 1.5H3.5M8.5 1.5V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>
        </button>
      </div>

      <div className="mt-6 grid gap-x-5 sm:grid-cols-3 sm:divide-x sm:divide-linec">
        <div className="flex flex-col sm:pr-5">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-verified">Indexed chains</p>
          <p className={`mt-auto pt-2 text-2xl font-extrabold tabular-nums ${summary.indexed > 0 ? "text-verified" : "text-mutedc"}`}>{summary.indexed}</p>
        </div>
        <div className="flex flex-col sm:px-5">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-mutedc">No activity chains</p>
          <p className="mt-auto pt-2 text-2xl font-extrabold tabular-nums text-ink">{summary.noActivity}</p>
        </div>
        <div className="flex flex-col sm:pl-5">
          <p className="font-mono text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-limited">Limited/provider</p>
          <p className={`mt-auto pt-2 text-2xl font-extrabold tabular-nums ${summary.limitedProvider > 0 ? "text-limited" : "text-mutedc"}`}>{summary.limitedProvider}</p>
        </div>
      </div>

      {chains.length === 0 ? <p className="mt-4 text-sm text-mutedc">Indexing limited by provider availability. Refresh intelligence to check again.</p> : null}

      {mounted && open ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink/70 p-3 sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Chain intelligence explorer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-[min(92dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-[2px] border border-line-dark bg-bone shadow-panel sm:h-[min(85dvh,820px)]">
            <div className="shrink-0 border-b border-linec bg-paper-deep p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="arc-section-label">Chain Explorer</p>
                  <h3 className="mt-2.5 text-2xl font-extrabold text-ink">Full chain intelligence</h3>
                  <p className="mt-2 text-sm text-mutedc">Built to scale across many networks without crowding the identity view.</p>
                </div>
                <button onClick={() => setOpen(false)} className="arc-button-secondary shrink-0 px-3.5 py-2 text-sm font-bold" aria-label="Close chain explorer">Close</button>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter chains by name, status or provider"
                className="arc-input mt-5 w-full px-4 py-3 text-sm outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="grid gap-3.5">
                {filteredChains.length === 0 ? <p className="border-t border-linec p-4 text-sm text-mutedc">No chains match this filter.</p> : filteredChains.map((chain) => {
                  const content = (
                      <div className="grid gap-4 border-t border-linec py-4 md:grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.8fr_1fr] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-ink">{chain.chain}</p>
                        <p className="mt-1 font-mono text-xs text-mutedc">Chain ID {chain.chainId}</p>
                      </div>
                      <span className={`w-fit rounded-[2px] border px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] ${statusClass(chain)}`}>{statusLabel(chain)}</span>
                      <div><p className="arc-section-label">Tx count</p><p className="mt-1 font-mono font-bold text-ink">{chain.txCount}</p></div>
                      <div><p className="arc-section-label">Age</p><p className="mt-1 font-mono font-bold text-ink">{chain.walletAgeDays}d</p></div>
                      <div><p className="arc-section-label">Counterparties</p><p className="mt-1 font-mono font-bold text-ink">{chain.uniqueCounterparties}</p></div>
                      <div className="min-w-0">
                        <p className="arc-section-label">Last activity</p>
                        <p className="mt-1 truncate text-sm font-bold text-ink">{formatDate(chain.lastSeenAt)}</p>
                        <p className="mt-1 truncate text-xs text-mutedc">{providerText(chain)}</p>
                      </div>
                    </div>
                  );
                  return chain.explorerUrl ? (
                    <a key={`${chain.chain}-${chain.chainId}`} href={chain.explorerUrl} target="_blank" rel="noreferrer" className="block">{content}</a>
                  ) : (
                    <div key={`${chain.chain}-${chain.chainId}`}>{content}</div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </section>
  );
}
