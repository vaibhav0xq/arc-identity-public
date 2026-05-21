import type { ChainSnapshot, WalletActivitySnapshot } from "@/lib/types";

export type ArcFreshness = {
  balance?: number | null;
  balanceFormatted?: string | null;
  balanceSource?: string | null;
  balanceUpdatedAt?: string | null;
  dataFreshness?: string | null;
  providerStatus?: string | null;
  latestBlock?: number | null;
};

function formatNumber(value: number | null | undefined, options?: Intl.NumberFormatOptions) {
  if (value == null || Number.isNaN(value)) return "Not available";
  return new Intl.NumberFormat("en-US", options).format(value);
}

function formatBalance(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "Not available";
  if (value === 0) return "0.000 USDC";
  return `${formatNumber(value, { maximumFractionDigits: value < 1 ? 6 : 3 })} USDC`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function freshnessLabel(live?: ArcFreshness | null, fallbackSource?: string | null) {
  if (live?.providerStatus === "live" || live?.dataFreshness === "live") return "Live from Arc RPC";
  if (live?.providerStatus === "unavailable") return "Temporarily unavailable";
  if (live?.dataFreshness === "cached_fallback") return "Using cached data";
  if (live?.dataFreshness === "verified_attestation_fallback") return "Using verified attestation data";
  if (fallbackSource?.includes("verified_attestations")) return "Using verified attestation data";
  if (fallbackSource) return "Using cached data";
  return "Not available";
}

function sourceLabel(source: string | null | undefined) {
  if (!source) return "Not available";
  if (source === "live_arc_rpc" || source === "live_arc_rpc_plus_indexer") return "Live from Arc RPC";
  if (source.includes("verified_attestations")) return "Verified attestation data";
  if (source.includes("cached")) return "Cached wallet intelligence";
  return source.replaceAll("_", " ");
}

export function OnchainActivityCard({ onchain, arcChain, liveArc }: { onchain: WalletActivitySnapshot | null; arcChain?: ChainSnapshot | null; liveArc?: ArcFreshness | null }) {
  const txCount = Math.max(onchain?.txCount ?? 0, arcChain?.txCount ?? 0);
  const counterparties = Math.max(onchain?.counterparties ?? 0, arcChain?.uniqueCounterparties ?? 0);
  const activeDays = Math.max(onchain?.activeDays ?? 0, arcChain?.activeDays ?? 0);
  const walletAgeDays = Math.max(onchain?.walletAgeDays ?? 0, arcChain?.walletAgeDays ?? 0);
  const recentActivityCount = Math.max(onchain?.recentActivityCount ?? 0, arcChain?.recentActivityCount ?? 0);
  const contractInteractionCount = Math.max(onchain?.contractInteractionCount ?? 0, arcChain?.contractInteractions ?? 0);
  const nativeBalance = liveArc?.balance ?? (arcChain?.nativeBalance && arcChain.nativeBalance > 0 ? arcChain.nativeBalance : onchain?.nativeBalance);
  const lastActivityAt = onchain?.lastActivityAt ?? arcChain?.lastSeenAt ?? null;
  const latestBlock = liveArc?.latestBlock ?? onchain?.latestBlock ?? null;
  const indexerSource = liveArc?.balanceSource ?? arcChain?.providerSource ?? onchain?.indexerSource ?? null;
  const freshness = freshnessLabel(liveArc, indexerSource);
  const updatedAt = liveArc?.balanceUpdatedAt ?? onchain?.createdAt ?? arcChain?.indexedAt ?? null;
  const providerUnavailable = liveArc?.providerStatus === "unavailable" || arcChain?.status === "error" || arcChain?.status === "limited" || arcChain?.status === "not_configured";
  const confirmedNoActivity = txCount === 0 && !providerUnavailable && (liveArc?.providerStatus === "live" || arcChain?.status === "no_activity");
  const baselineFresh = txCount === 0 && !providerUnavailable && !confirmedNoActivity;
  const metrics = [
    ["Transaction count", formatNumber(txCount)],
    ["Recent activity", formatNumber(recentActivityCount)],
    ["Unique counterparties", formatNumber(counterparties)],
    ["Active days", formatNumber(activeDays)],
    ["Wallet age", `${formatNumber(walletAgeDays)}d`],
    ["Frequency", onchain ? `${(onchain.activityFrequency ?? 0).toFixed(2)}/day` : "Not available"],
    ["Transfers", onchain ? formatNumber(onchain.transferCount) : "Not available"],
    ["Contract calls", formatNumber(contractInteractionCount)]
  ];

  return (
    <section className="arc-surface rounded-2xl p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="arc-section-label">Arc Network Footprint</p>
          <h2 className="mt-2.5 text-2xl font-extrabold text-white">
            {providerUnavailable ? "Some Arc data is temporarily unavailable" : confirmedNoActivity || baselineFresh ? "Fresh wallet detected" : "Arc Network intelligence"}
          </h2>
          <p className="mt-2 max-w-2xl text-[0.8125rem] leading-relaxed text-slate-400">
            {providerUnavailable
              ? "ARC Identity is keeping the latest safe wallet intelligence visible while live Arc data is unavailable."
              : confirmedNoActivity || baselineFresh
                ? "ARC Intelligence will update as activity appears. Empty metrics are shown as a safe initial state until indexed activity is confirmed."
                : "Derived from Arc explorer/indexer history when available, with Arc RPC verification and recent block scan support."}
          </p>
        </div>
        <div className="w-full rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] px-4 py-3 text-left sm:w-auto sm:text-right">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-emerald-100/70">Latest block</p>
          <p className="mt-1 break-words text-2xl font-extrabold tabular-nums text-emerald-100">{formatNumber(latestBlock)}</p>
          <p className="mt-1 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-emerald-100/60">{freshness}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.18em]">
        <span className="break-words text-slate-500">Source: {sourceLabel(indexerSource)}</span>
        <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-2 py-1 text-slate-400">{freshness}</span>
        {updatedAt ? <span className="text-slate-500">Updated {formatDateTime(updatedAt)}</span> : null}
      </div>
      <div className="mt-5 grid gap-3.5 sm:grid-cols-3">
        {metrics.map(([label, value]) => (
          <div key={label} className="arc-metric-card min-w-0">
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
            <p className="mt-2.5 break-words text-xl font-extrabold tabular-nums text-white">{value}</p>
          </div>
        ))}
        <div className="arc-metric-card min-w-0 sm:col-span-2">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Native USDC balance</p>
          <p className="mt-2.5 break-words text-xl font-extrabold tabular-nums text-white">{liveArc?.balanceFormatted ?? formatBalance(nativeBalance)}</p>
          <p className="mt-1.5 text-xs font-bold text-slate-500">{freshness}</p>
        </div>
        <div className="arc-metric-card min-w-0">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-slate-400">Last activity</p>
          <p className="mt-2.5 break-words text-[0.8125rem] font-bold text-white">
            {formatDateTime(lastActivityAt)}
          </p>
        </div>
      </div>
    </section>
  );
}
