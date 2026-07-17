"use client";

import { useEffect, useMemo, useState } from "react";
import type { ExplainableReputation } from "@/lib/explainable-reputation";
import { shortenAddress } from "@/lib/wallet";

type Props = {
  wallet: string;
  arcId: string | null;
  initialReputation: ExplainableReputation;
};

function relativeTime(value: string) {
  const updatedAt = new Date(value).getTime();
  if (!Number.isFinite(updatedAt)) return "recently";
  const seconds = Math.max(0, Math.round((Date.now() - updatedAt) / 1000));
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatLabel(key: string) {
  return key.replaceAll("_", " ");
}

function shortReason(key: string, points: number) {
  if (points === 0) return "No verified signal detected for this component yet.";
  if (key === "wallet_age") return "Longer wallet history adds maturity context.";
  if (key === "activity") return "Arc activity and consistent usage strengthen reputation.";
  if (key === "attestations") return "Verified attestations add relationship-backed trust.";
  if (key === "network") return "Counterparties and coverage add network context.";
  return "Risk patterns reduce the final score.";
}

export function ExplainableReputationCard({ wallet, arcId, initialReputation }: Props) {
  const [reputation, setReputation] = useState(initialReputation);
  const [mounted, setMounted] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => Date.now());
  const relativeUpdatedAt = useMemo(() => mounted ? relativeTime(reputation.last_updated) : "recently", [mounted, reputation.last_updated, lastCheckedAt]);

  useEffect(() => {
    setReputation(initialReputation);
  }, [initialReputation]);

  useEffect(() => {
    setMounted(true);
    const tick = window.setInterval(() => setLastCheckedAt(Date.now()), 15_000);
    return () => window.clearInterval(tick);
  }, []);

  const breakdownRows = [
    ["wallet_age", reputation.breakdown.wallet_age, reputation.components.wallet_age],
    ["activity", reputation.breakdown.activity, reputation.components.activity],
    ["attestations", reputation.breakdown.attestations, reputation.components.attestations],
    ["network", reputation.breakdown.network, reputation.components.network],
    ["risk", reputation.breakdown.risk, reputation.components.risk]
  ] as const;
  const topInsights = reputation.insights.slice(0, 4);
  const attestationRows = reputation.attestations.slice(0, 6).reduce<Array<{ id: string; from: string; impact: number; reason: string; count: number }>>((rows, item) => {
    const existing = rows.find((row) => row.from.toLowerCase() === item.from.toLowerCase() && row.reason === item.reason);
    if (existing) {
      existing.impact += item.impact;
      existing.count += 1;
      return rows;
    }
    return [...rows, { ...item, count: 1 }];
  }, []);

  return (
    <section className="arc-surface rounded-2xl p-5 sm:p-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Explainable wallet reputation</p>
          <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">Reputation drivers</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
            Key signals behind this wallet&apos;s ARC Identity reputation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold uppercase tracking-[0.14em]">
            <span className="rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-1.5 text-emerald-100">{arcId ?? "Unclaimed ARC ID"}</span>
            <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-3 py-1.5 text-amber-100">{reputation.tier} reputation</span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-slate-300">{reputation.riskBadge}</span>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Score breakdown</p>
              <p className="mt-1 text-sm text-slate-400">The main signals shaping this profile.</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2.5">
            {breakdownRows.map(([key, points, component]) => (
              <div key={key} className="rounded-lg border border-white/10 bg-black/15 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold capitalize text-white">{formatLabel(key)}</p>
                  <p className={points < 0 ? "text-sm font-black tabular-nums text-rose-200" : "text-sm font-black tabular-nums text-emerald-100"}>
                    {points > 0 ? "+" : ""}{points}
                  </p>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={key === "risk" ? "h-full rounded-full bg-rose-300/70" : "h-full rounded-full bg-emerald-300/70"}
                    style={{ width: points === 0 ? "0%" : `${Math.max(4, component.normalized)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400 line-clamp-2">
                  {shortReason(key, points)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Insights</p>
            <ul className="mt-4 grid gap-2 text-sm leading-6 text-slate-300">
              {topInsights.map((insight) => (
                <li key={insight} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-300" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.035] p-4 sm:p-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Attestation impact</p>
            <div className="mt-4 grid gap-2">
              {attestationRows.length === 0 ? (
                <p className="text-sm leading-6 text-slate-400">No verified attestation impact yet. Transaction-backed attestations can increase this component.</p>
              ) : attestationRows.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-white/10 bg-black/15 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-bold text-white">{shortenAddress(item.from)}{item.count > 1 ? ` (${item.count})` : ""}</p>
                    <p className="text-sm font-black text-emerald-100">+{item.impact}</p>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-400">{item.reason}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-white/10 pt-4 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p suppressHydrationWarning>Last updated {relativeUpdatedAt}</p>
        <p>Refresh wallet intelligence from the dashboard for the latest update.</p>
      </div>
    </section>
  );
}

