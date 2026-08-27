export const INTERACTION_GRAPH_DEFAULT_LIMIT = 25;
export const INTERACTION_GRAPH_MAX_LIMIT = 50;

/* C1b: per-counterparty counts, direction and recency are read from the
   persisted C1a counterparty stats and exposed per node. Native value is
   tracked in storage but stays withheld (stored wei never serializes) and
   asset details remain unsupported — both flags stay literal false until
   their own approved release. */
export const INTERACTION_GRAPH_CAPABILITIES = {
  perCounterpartyTransactionCount: true,
  direction: true,
  firstInteractionAt: true,
  lastInteractionAt: true,
  value: false,
  assetDetails: false
} as const;

/* Persisted entry shape written by C1a (lib/counterparty-stats.ts):
   {a,tx,in,out,first,last,vin,vout,capped}. vin/vout ride along in
   storage but MUST never reach a public payload in C1b. */
export type StoredCounterpartyStatsEntry = {
  a: string;
  tx: number;
  in: number;
  out: number;
  first: string | null;
  last: string | null;
  vin: string;
  vout: string;
  capped: boolean;
};

/* Public per-node metrics: the ONLY per-counterparty evidence C1b exposes.
   The serialized key set is contract-frozen by the ig-metrics gate. */
export type CounterpartyNodeMetrics = {
  transactionCount: { total: number; in: number; out: number };
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  lowerBound: boolean;
  basis: { counted: number; pending: number; unavailable: number };
};

type MetricsContribution = {
  chain: string;
  captured: boolean;
  entry: StoredCounterpartyStatsEntry | null;
};

type CounterpartyChainInput = {
  chain: string;
  chainId: number;
  counterpartyAddresses: string[];
  /* C1b: null/undefined = stats not captured on that chain's latest
     snapshot; [] = scanned and empty; array = captured entries. */
  counterpartyStats?: StoredCounterpartyStatsEntry[] | null;
};

type CoverageChainInput = {
  status: string;
  historyCapped?: boolean | null;
  recencyReliable?: boolean | null;
};

export function isInteractionWallet(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/* Arc snapshots persist counterparty stats as NULL permanently (the Arc
   source is aggregate-only), so an uncaptured Arc contribution reads as
   "unavailable" — promising a re-index there would be a standing lie. */
export function isArcInteractionChain(chain: string): boolean {
  return /^arc(\s|$)/i.test(chain.trim());
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/* Writer tolerance vs corruption: the C1a writer legitimately persists
   null first/last when no transaction timestamp parsed, so null (or an
   absent key) passes through. A PRESENT unparsable value is corruption —
   the caller drops the whole entry so the chain falls back to pending,
   never publishing counted metrics with fabricated recency. */
function readStoredIso(value: unknown): { ok: true; iso: string | null } | { ok: false } {
  if (value === null || value === undefined) return { ok: true, iso: null };
  if (typeof value === "string" && Number.isFinite(Date.parse(value))) return { ok: true, iso: value };
  return { ok: false };
}

/* Tolerant jsonb reader for the persisted stats column. A malformed WHOLE
   value reads as "not captured" (null); a malformed or law-breaking ENTRY
   is dropped so its address falls back to the pending state — absence must
   never fabricate zeros. Entry validity: EVM-shaped address, non-negative
   integer counts with in + out === tx, and timestamps that are each null
   or parsable with first <= last. */
export function asCounterpartyStats(value: unknown): StoredCounterpartyStatsEntry[] | null {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? (() => {
          try {
            return JSON.parse(value);
          } catch {
            return null;
          }
        })()
      : null;
  if (!Array.isArray(raw)) return null;
  const entries: StoredCounterpartyStatsEntry[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.a !== "string" || !isInteractionWallet(entry.a.trim())) continue;
    if (!isNonNegativeInt(entry.tx) || !isNonNegativeInt(entry.in) || !isNonNegativeInt(entry.out)) continue;
    if (entry.in + entry.out !== entry.tx) continue; // accumulator law: in + out === tx
    const first = readStoredIso(entry.first);
    const last = readStoredIso(entry.last);
    if (!first.ok || !last.ok) continue; // present-but-corrupt timestamp: drop to pending
    if (first.iso !== null && last.iso !== null && Date.parse(first.iso) > Date.parse(last.iso)) {
      continue; // reversed bounds are corruption, never a countable entry
    }
    entries.push({
      a: entry.a,
      tx: entry.tx,
      in: entry.in,
      out: entry.out,
      first: first.iso,
      last: last.iso,
      vin: typeof entry.vin === "string" ? entry.vin : "0",
      vout: typeof entry.vout === "string" ? entry.vout : "0",
      capped: entry.capped === true
    });
  }
  return entries;
}

/* Node-level merge across a counterparty's contributing chains:
   counts sum, first = earliest, last = latest, capped ORs into
   lowerBound. counted === 0 yields null — the node has no countable
   evidence yet (UI distinguishes pending vs Arc-only unavailable). */
export function mergeCounterpartyMetrics(contributions: MetricsContribution[]): CounterpartyNodeMetrics | null {
  let counted = 0;
  let pending = 0;
  let unavailable = 0;
  let total = 0;
  let inbound = 0;
  let outbound = 0;
  let capped = false;
  let first: string | null = null;
  let last: string | null = null;
  for (const contribution of contributions) {
    if (contribution.captured && contribution.entry) {
      counted += 1;
      total += contribution.entry.tx;
      inbound += contribution.entry.in;
      outbound += contribution.entry.out;
      capped = capped || contribution.entry.capped;
      if (contribution.entry.first && (!first || Date.parse(contribution.entry.first) < Date.parse(first))) {
        first = contribution.entry.first;
      }
      if (contribution.entry.last && (!last || Date.parse(contribution.entry.last) > Date.parse(last))) {
        last = contribution.entry.last;
      }
    } else if (!contribution.captured && isArcInteractionChain(contribution.chain)) {
      unavailable += 1;
    } else {
      /* Uncaptured on an EVM chain — or captured with a missing entry,
         which by construction should not happen: both read as pending
         so absence never fabricates zeros. */
      pending += 1;
    }
  }
  if (counted === 0) return null;
  return {
    transactionCount: { total, in: inbound, out: outbound },
    firstInteractionAt: first,
    lastInteractionAt: last,
    lowerBound: capped || pending > 0 || unavailable > 0,
    basis: { counted, pending, unavailable }
  };
}

export function normalizeInteractionLimit(value?: string | number | null) {
  const parsed = typeof value === "number" ? value : Number(value ?? INTERACTION_GRAPH_DEFAULT_LIMIT);
  return Math.max(
    1,
    Math.min(Number.isFinite(parsed) ? Math.floor(parsed) : INTERACTION_GRAPH_DEFAULT_LIMIT, INTERACTION_GRAPH_MAX_LIMIT)
  );
}

export function encodeInteractionCursor(wallet: string) {
  return Buffer.from(JSON.stringify({ wallet: wallet.trim().toLowerCase() }), "utf8").toString("base64url");
}

export function decodeInteractionCursor(value?: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as { wallet?: unknown };
    return typeof decoded.wallet === "string" && isInteractionWallet(decoded.wallet)
      ? decoded.wallet.trim().toLowerCase()
      : null;
  } catch {
    return null;
  }
}

export function interactionCursorOffset(wallets: string[], cursor?: string | null) {
  const decoded = decodeInteractionCursor(cursor);
  if (!decoded) return 0;
  const nextIndex = wallets.findIndex((wallet) => wallet > decoded);
  return nextIndex === -1 ? wallets.length : nextIndex;
}

export function mergeInteractionCounterparties(walletAddress: string, chains: CounterpartyChainInput[]) {
  const owner = walletAddress.trim().toLowerCase();
  const merged = new Map<string, { chains: Array<{ chain: string; chainId: number }>; contributions: MetricsContribution[] }>();
  /* One normalized-address lookup per chain input; entry addresses are
     stored as the provider returned them, so matching must normalize. */
  const entryLookups = chains.map((chain) => {
    if (!Array.isArray(chain.counterpartyStats)) return null;
    const lookup = new Map<string, StoredCounterpartyStatsEntry>();
    for (const entry of chain.counterpartyStats) {
      const key = entry.a.trim().toLowerCase();
      if (!lookup.has(key)) lookup.set(key, entry);
    }
    return lookup;
  });
  chains.forEach((chain, index) => {
    for (const raw of chain.counterpartyAddresses) {
      const wallet = raw.trim().toLowerCase();
      if (!isInteractionWallet(wallet) || wallet === owner) continue;
      const existing = merged.get(wallet) ?? { chains: [], contributions: [] };
      if (!existing.chains.some((item) => item.chainId === chain.chainId)) {
        existing.chains.push({ chain: chain.chain, chainId: chain.chainId });
        /* Contributions stay 1:1 with the deduped display chains so the
           metrics basis always describes the chains the node shows. */
        const lookup = entryLookups[index];
        existing.contributions.push({
          chain: chain.chain,
          captured: lookup !== null,
          entry: lookup?.get(wallet) ?? null
        });
      }
      merged.set(wallet, existing);
    }
  });
  return Array.from(merged, ([walletAddress, item]) => ({
    walletAddress,
    chains: item.chains.sort((a, b) => a.chain.localeCompare(b.chain)),
    metrics: mergeCounterpartyMetrics(item.contributions)
  })).sort((a, b) => a.walletAddress.localeCompare(b.walletAddress));
}

export function interactionCoverageStatus(chains: CoverageChainInput[], indexing: boolean) {
  if (indexing) return "indexing" as const;
  if (chains.length === 0) return "not_indexed" as const;
  const useful = chains.filter((chain) => chain.status === "indexed" || chain.status === "no_activity");
  if (useful.length === 0) return "unavailable" as const;
  const limited = chains.some((chain) =>
    chain.status === "error"
    || chain.status === "limited"
    || chain.status === "not_configured"
    || chain.historyCapped === true
    || chain.recencyReliable === false
  );
  return limited ? "partial" as const : "complete" as const;
}

/* ------------------------------------------------------------------ */
/* C2: opt-in observed-activity ranking (sort=activity)                 */
/*                                                                      */
/* LAW: ranking is observed activity ONLY — deterministic and           */
/* explainable in one sentence: transaction count (desc), then most     */
/* recent interaction (desc), then address (asc). Nodes without         */
/* countable metrics trail every measured node, address-ascending,      */
/* with rank null. Ranking is never endorsement, trust, or a score      */
/* input, and must never feed scoring or trust surfaces. The default    */
/* enumeration (address-asc + cursor) is a frozen contract; ranked      */
/* mode is opt-in, single-page, and never offers a cursor (rank is not  */
/* a stable pagination key across re-scans).                            */
/* ------------------------------------------------------------------ */

export const INTERACTION_GRAPH_SORT_MODES = ["activity"] as const;
export type InteractionGraphSortMode = (typeof INTERACTION_GRAPH_SORT_MODES)[number];

/* Absent/empty -> default enumeration (sort: null). Unknown values are a
   caller error the route rejects with 400 — silently falling back would
   let a typo read as a ranking. */
export function parseInteractionSort(value?: string | null):
  | { ok: true; sort: InteractionGraphSortMode | null }
  | { ok: false } {
  if (value === null || value === undefined || value === "") return { ok: true, sort: null };
  return value === "activity" ? { ok: true, sort: "activity" } : { ok: false };
}

type ActivityRankable = {
  walletAddress: string;
  metrics: { transactionCount: { total: number }; lastInteractionAt: string | null } | null;
};

function activityRecencyValue(iso: string | null): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

/* Shared by the API read layer and the client ledger so ranked order can
   never drift between surfaces. Null lastInteractionAt sorts as oldest at
   equal totals — unknown recency must not outrank known recency. */
export function compareObservedActivity(a: ActivityRankable, b: ActivityRankable): number {
  const aMeasured = a.metrics !== null;
  const bMeasured = b.metrics !== null;
  if (aMeasured !== bMeasured) return aMeasured ? -1 : 1;
  if (a.metrics && b.metrics) {
    const byTotal = b.metrics.transactionCount.total - a.metrics.transactionCount.total;
    if (byTotal !== 0) return byTotal;
    const aLast = activityRecencyValue(a.metrics.lastInteractionAt);
    const bLast = activityRecencyValue(b.metrics.lastInteractionAt);
    if (aLast !== bLast) return bLast > aLast ? 1 : -1;
  }
  return a.walletAddress.localeCompare(b.walletAddress);
}

/* Single ranked page: measured nodes carry 1-based contiguous ranks
   (they always occupy the ordered prefix), metrics-null nodes trail with
   rank null. The input array is never mutated. */
export function rankObservedActivity<T extends ActivityRankable>(
  items: readonly T[],
  limit: number
): Array<{ item: T; rank: number | null }> {
  return [...items]
    .sort(compareObservedActivity)
    .slice(0, limit)
    .map((item, index) => ({ item, rank: item.metrics !== null ? index + 1 : null }));
}
