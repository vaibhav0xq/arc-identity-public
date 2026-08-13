"use client";

import { useEffect, useState } from "react";

/* Public usage stats strip — reads the same aggregate-only /api/v1/stats
   payload integrators get. Counts only; the section renders em-dashes until
   real numbers arrive and never invents values. */

type StatsData = Record<string, number | string | null>;

const numberFormat = new Intl.NumberFormat("en-US");

function formatCount(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) ? numberFormat.format(value) : "N/A";
}

function formatTimestamp(value: unknown): string {
  if (typeof value !== "string") return "N/A";
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return "N/A";
  const date = new Date(ms);
  const day = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
  return `${day} · ${time} UTC`;
}

export function StatsSection() {
  const [stats, setStats] = useState<StatsData | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v1/stats", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (!cancelled && body?.ok === true && body.data && typeof body.data === "object") setStats(body.data);
      })
      .catch(() => {
        /* Section stays in its em-dash state; stats are additive, never blocking. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const primary: Array<[string, string]> = [
    ["Chain snapshots indexed", formatCount(stats?.chainSnapshotsIndexed)],
    ["Score snapshots computed", formatCount(stats?.scoreSnapshotsComputed)],
    ["Identities indexed", formatCount(stats?.identitiesIndexed)],
    ["Verified attestations", formatCount(stats?.verifiedAttestations)]
  ];

  const secondary: Array<[string, string, string]> = [
    ["Trust edges", "Directed, transaction-backed relationships", formatCount(stats?.trustEdges)],
    ["API keys created", "Lifetime total, including revoked", formatCount(stats?.apiKeysCreated)],
    ["Indexed chains", "Distinct networks with indexed activity", formatCount(stats?.indexedChains)],
    ["Latest indexed activity", "Most recent committed snapshot", formatTimestamp(stats?.latestIndexedAt)],
    ["API lookups served", "v1 score, profile and trust reads, counted from launch", formatCount(stats?.apiLookupsServed)],
    ["Decision checks generated", "Allow / caution / block verdicts, counted from launch", formatCount(stats?.decisionChecksGenerated)]
  ];

  return (
    <section className="landing-usage landing-reveal" aria-labelledby="usage-title">
      <div className="landing-section-intro" data-cascade>
        <span className="landing-eyebrow">03 / Live usage</span>
        <h2 id="usage-title">Counted from the record.<br /><em>Nothing projected.</em></h2>
      </div>
      <div className="credential-plate mt-10 min-w-0" data-cascade>
        <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {primary.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.15em] text-quiet">{label}</p>
              <p className="mt-2 font-heading text-5xl font-semibold text-bone">{value}</p>
            </div>
          ))}
        </div>
        <div className="plate-line mt-8" aria-hidden="true" />
        <div className="mt-4 grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {secondary.map(([label, detail, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 border-b border-white/10 py-3">
              <span className="min-w-0">
                <b className="block font-medium text-bone">{label}</b>
                <small className="text-quiet">{detail}</small>
              </span>
              <span className="shrink-0 font-mono text-sm text-bone">{value}</span>
            </div>
          ))}
        </div>
        <p className="mt-5 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-quiet">
          Aggregate counts only · no wallets, keys or per-user data · GET /api/v1/stats · refreshed every 60s
        </p>
      </div>
    </section>
  );
}
