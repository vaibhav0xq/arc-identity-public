"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ChainSnapshot, ChainStatus } from "@/lib/types";

type ChainCoverageExplorerProps = {
  chains?: ChainSnapshot[];
  title?: string;
};

function statusLabel(status: ChainStatus, errorMessage?: string | null) {
  if (errorMessage === "Provider unavailable") return "TEMPORARILY LIMITED";
  if (status === "indexed") return "INDEXED";
  if (status === "no_activity") return "NO ACTIVITY";
  if (status === "not_configured") return "LIMITED";
  if (status === "limited") return "LIMITED";
  return "ERROR";
}

function statusClass(status: ChainStatus, errorMessage?: string | null) {
  if (status === "indexed") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (status === "no_activity") return "border-white/10 bg-white/[0.06] text-slate-300";
  if (status === "limited" || status === "not_configured" || errorMessage === "Provider unavailable") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-400/10 text-rose-100";
}

function providerText(chain: ChainSnapshot) {
  if (chain.errorMessage === "Provider unavailable") return "Some chain data is temporarily unavailable.";
  if (chain.status === "limited" && chain.chain === "BNB Chain") return "BNB indexing is temporarily limited.";
  if (chain.status === "limited") return "Chain coverage is temporarily limited.";
  if (chain.status === "not_configured") return "Chain coverage is temporarily limited.";
  if (chain.errorMessage) return "Some chain data is temporarily unavailable.";
  return chain.providerSource || "Provider unknown";
}

function formatDate(value: string | null) {
  if (!value) return "No activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not enough indexed data";
  return date.toLocaleDateString();
}

function countLimitedProviderChains(chains: ChainSnapshot[]) {
  return chains.filter((chain) => chain.status === "limited" || chain.status === "not_configured" || chain.errorMessage === "Provider unavailable").length;
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
    indexed: chains.filter((chain) => chain.status === "indexed").length,
    noActivity: chains.filter((chain) => chain.status === "no_activity").length,
    limitedProvider: countLimitedProviderChains(chains)
  }), [chains]);

  const filteredChains = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return chains;
    return chains.filter((chain) => [
      chain.chain,
      chain.status,
      chain.providerSource,
      chain.errorMessage ?? ""
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [chains, query]);

  return (
    <section className="arc-surface rounded-2xl p-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="arc-section-label">{title}</p>
          <p className="mt-2.5 max-w-2xl text-[0.8125rem] leading-relaxed text-slate-400">Chain-level infrastructure intelligence is available when needed, while the main view stays focused on score, trust, and verified activity.</p>
        </div>
        <button onClick={() => setOpen(true)} className="arc-button-primary px-5 py-3 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-60" disabled={chains.length === 0}>
          View Chains
        </button>
      </div>

      <div className="mt-6 grid gap-3.5 sm:grid-cols-3">
        <div className="arc-metric-card !border-emerald-300/15 !bg-emerald-300/[0.06]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-100/70">Indexed chains</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-white">{summary.indexed}</p>
        </div>
        <div className="arc-metric-card">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">No activity chains</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-white">{summary.noActivity}</p>
        </div>
        <div className="arc-metric-card !border-amber-300/15 !bg-amber-300/[0.06]">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-amber-100/70">Limited/provider</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-white">{summary.limitedProvider}</p>
        </div>
      </div>

      {chains.length === 0 ? <p className="mt-4 text-sm text-slate-400">Some chain data is temporarily unavailable. Refresh intelligence to check again.</p> : null}

      {mounted && open ? createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/88 p-3 backdrop-blur-md sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Chain intelligence explorer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="flex h-[min(92dvh,820px)] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/[0.08] bg-[rgba(8,10,13,0.98)] shadow-[0_40px_140px_rgba(0,0,0,0.75),0_0_120px_rgba(212,175,55,0.16)] sm:h-[min(85dvh,820px)]">
            <div className="shrink-0 border-b border-white/[0.06] bg-[rgba(13,14,17,0.96)] p-5 backdrop-blur-xl sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="arc-section-label">Chain Explorer</p>
                  <h3 className="mt-2.5 text-2xl font-extrabold text-white">Full chain intelligence</h3>
                  <p className="mt-2 text-sm text-slate-400">Built to scale across many networks without crowding the identity view.</p>
                </div>
                <button onClick={() => setOpen(false)} className="arc-button-secondary shrink-0 px-3.5 py-2 text-sm font-bold" aria-label="Close chain explorer">Close</button>
              </div>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter chains by name, status, or provider"
                className="arc-input mt-5 w-full px-4 py-3 text-sm outline-none placeholder:text-slate-500"
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">
              <div className="grid gap-3.5">
                {filteredChains.length === 0 ? <p className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 text-sm text-slate-400">No chains match this filter.</p> : filteredChains.map((chain) => {
                  const content = (
                    <div className="arc-card-hover grid gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] p-4 transition duration-200 md:grid-cols-[1.2fr_0.8fr_0.6fr_0.6fr_0.8fr_1fr] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-extrabold text-white">{chain.chain}</p>
                        <p className="mt-1 text-xs text-slate-500">Chain ID {chain.chainId}</p>
                      </div>
                      <span className={`w-fit rounded-md border px-2.5 py-1 text-[0.6875rem] font-extrabold uppercase tracking-[0.12em] ${statusClass(chain.status, chain.errorMessage)}`}>{statusLabel(chain.status, chain.errorMessage)}</span>
                      <div><p className="text-xs text-slate-500">Tx count</p><p className="font-bold text-white">{chain.txCount}</p></div>
                      <div><p className="text-xs text-slate-500">Age</p><p className="font-bold text-white">{chain.walletAgeDays}d</p></div>
                      <div><p className="text-xs text-slate-500">Counterparties</p><p className="font-bold text-white">{chain.uniqueCounterparties}</p></div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Last activity</p>
                        <p className="truncate text-sm font-bold text-white">{formatDate(chain.lastSeenAt)}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{providerText(chain)}</p>
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
