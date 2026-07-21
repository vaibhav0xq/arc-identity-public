import type { ChainSnapshot, ChainStatus, MultiChainWalletProfile } from "@/lib/types";
import { isProviderCoverageRestriction, normalizeChainStatus } from "@/lib/chain-status";
import { getWalletAnalytics } from "@/lib/onchain";
import { getSupabaseAdmin } from "@/lib/supabase";
import { timeoutSignal, withTimeout } from "@/lib/timeouts";

const etherscanV2Url = "https://api.etherscan.io/v2/api";
const historyLimit = 1000;
const recentWindowDays = 30;
const chainScanTimeoutMs = 10000;
const noTransactionsPattern = /no transactions found/i;

type ChainConfig = {
  key: string;
  name: string;
  chainId: number;
  explorerApiUrl: string;
  legacyApiUrl?: string;
  explorerBaseUrl: string;
  apiKeyEnv?: string;
  isArc?: boolean;
};

type IndexedTx = {
  hash: string;
  from: string;
  to: string | null;
  value: number;
  timestamp: string | null;
  blockNumber: number;
  isError: boolean;
  input: string;
  tokenSymbol?: string | null;
};

type ExplorerActionDebug = {
  action: string;
  requestParams: Record<string, string | number>;
  rawStatus: string | null;
  rawMessage: string | null;
  resultType: string;
  rawResultCount: number;
  firstTwoTxHashes: string[];
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  parsedTxCount: number;
  error?: string;
};

type ExplorerActionResult = ExplorerActionDebug & {
  rows: IndexedTx[];
  noActivity: boolean;
};

type ChainHistory = {
  rows: IndexedTx[];
  providerSource: string;
  errorMessage?: string | null;
  limited?: boolean;
};

type ExplorerActionName = "txlist" | "tokentx" | "tokennfttx" | "token1155tx";

export type MultiChainDebugResult = {
  walletAddress: string;
  chains: Array<{
    chain: string;
    chainId: number;
    configured: boolean;
    endpointUsed: string;
    actions: ExplorerActionDebug[];
    primaryProviderResult?: { provider: string; actions: ExplorerActionDebug[]; error?: string };
    fallbackProviderResult?: { provider: string; actions: ExplorerActionDebug[]; error?: string };
    finalSelectedProvider?: string;
    finalChainStatus?: ChainStatus;
    error?: string;
  }>;
};

export type ProviderDiagnosticsResult = {
  wallet: string;
  chains: Array<{
    chain: string;
    chainId: number;
    configured: boolean;
    providerUsed: string;
    status: ChainStatus | "provider_unavailable" | "timeout";
    txCount: number;
    activeDays: number;
    counterparties: number;
    durationMs: number;
    error: string | null;
  }>;
  totalDurationMs: number;
};

// Provider configuration audit:
// - Ethereum: Etherscan V2 account txlist/tokentx/NFT actions. Legacy fallback is only used when it has a distinct chain-specific key.
// - Base: Etherscan V2 first, Base Blockscout v2 transactions/token-transfers fallback for free-tier coverage gaps.
// - Arbitrum: Etherscan V2 chainid=42161 only. Deprecated Arbiscan V1 fallback is intentionally skipped.
// - Polygon: Etherscan V2 first, legacy Polygonscan only when a distinct POLYGONSCAN_API_KEY is configured.
// - BNB Chain: Etherscan V2 first. Free-tier/plan failures become limited_provider_required, never no_activity.
// - Arc Testnet: Arc RPC/indexer plus verified-attestation merge. Supports balance/latest block/tx count when provider is available.
export const chains: ChainConfig[] = [
  { key: "ethereum", name: "Ethereum Mainnet", chainId: 1, explorerApiUrl: etherscanV2Url, explorerBaseUrl: "https://etherscan.io", apiKeyEnv: "ETHERSCAN_API_KEY", legacyApiUrl: "https://api.etherscan.io/api" },
  { key: "base", name: "Base", chainId: 8453, explorerApiUrl: etherscanV2Url, explorerBaseUrl: "https://basescan.org", apiKeyEnv: "BASESCAN_API_KEY", legacyApiUrl: "https://api.basescan.org/api" },
  { key: "arbitrum", name: "Arbitrum", chainId: 42161, explorerApiUrl: etherscanV2Url, explorerBaseUrl: "https://arbiscan.io", apiKeyEnv: "ARBISCAN_API_KEY", legacyApiUrl: "https://api.arbiscan.io/api" },
  { key: "polygon", name: "Polygon", chainId: 137, explorerApiUrl: etherscanV2Url, explorerBaseUrl: "https://polygonscan.com", apiKeyEnv: "POLYGONSCAN_API_KEY", legacyApiUrl: "https://api.polygonscan.com/api" },
  { key: "bsc", name: "BNB Chain", chainId: 56, explorerApiUrl: etherscanV2Url, explorerBaseUrl: "https://bscscan.com", apiKeyEnv: "BSCSCAN_API_KEY", legacyApiUrl: "https://api.bscscan.com/api" },
  { key: "arcTestnet", name: "Arc Testnet", chainId: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 0), explorerApiUrl: `${(process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app").replace(/\/$/, "")}/api`, explorerBaseUrl: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app", isArc: true }
];

function defaultProviderSource(config: ChainConfig) {
  if (config.isArc) return "arcscan";
  if (config.key === "base") return "blockscout_base";
  if (config.key === "bsc") return "etherscan_v2";
  return "etherscan_v2";
}

export function providerConfigurationSummary() {
  return chains.map((chain) => ({
    key: chain.key,
    name: chain.name,
    chainId: chain.chainId,
    primaryProvider: chain.isArc ? "arc_rpc_indexer" : "etherscan_v2",
    fallbackProvider: chain.key === "base" ? "blockscout_base" : chain.key === "bsc" ? "limited_provider_required" : chain.key === "arbitrum" ? null : chain.legacyApiUrl ? "etherscan_legacy_distinct_key_only" : null,
    supportedActions: chain.isArc ? ["balance", "latestBlock", "transactionCount", "verifiedAttestationMerge"] : ["txlist", "tokentx", "tokennfttx", "token1155tx"],
    timeoutMs: chainScanTimeoutMs,
    rateLimitRisk: chain.isArc ? "medium" : "medium_high_for_explorer_free_tiers",
    nftTransfers: chain.isArc ? "verified_attestation_fallback_only" : "tokennfttx/token1155tx_when_provider_supports",
    contractInteractions: chain.isArc ? "rpc/indexer_when_available" : "txlist input parsing"
  }));
}

function emptySnapshot(config: ChainConfig, walletAddress: string, status: ChainStatus, providerSource = "unknown", errorMessage: string | null = null): ChainSnapshot {
  return {
    chain: config.name,
    chainId: config.chainId,
    status,
    txCount: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    walletAgeDays: 0,
    nativeBalance: 0,
    uniqueCounterparties: 0,
    counterpartyAddresses: [],
    contractInteractions: 0,
    activeDays: 0,
    recentActivityCount: 0,
    explorerUrl: config.explorerBaseUrl ? `${config.explorerBaseUrl.replace(/\/$/, "")}/address/${walletAddress}` : null,
    indexedAt: new Date().toISOString(),
    providerSource,
    errorMessage
  };
}

async function fetchJson<T>(url: string, timeoutMs: number): Promise<T> {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as T;
  } finally {
    clear();
  }
}

function parseTimestamp(value: unknown): string | null {
  if (value == null || value === "") return null;
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return new Date(n < 10000000000 ? n * 1000 : n).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseValue(value: unknown, decimals = 18) {
  const text = String(value ?? "0");
  if (!/^\d+$/.test(text)) return Number(text) || 0;
  return Number(BigInt(text)) / 10 ** decimals;
}

function parseBlockNumber(value: unknown) {
  if (typeof value === "number") return value;
  const text = String(value ?? "0");
  return text.startsWith("0x") ? Number.parseInt(text, 16) : Number(text || 0);
}

function normalizeWallet(wallet: string) {
  return wallet.trim().toLowerCase();
}

function getApiKey(config: ChainConfig) {
  if (config.isArc) return undefined;
  return (config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined) || process.env.ETHERSCAN_API_KEY;
}

function requestParams(config: ChainConfig, walletAddress: string, action: ExplorerActionName) {
  return {
    chainid: config.chainId,
    module: "account",
    action,
    address: walletAddress.toLowerCase(),
    startblock: 0,
    endblock: 99999999,
    sort: "asc"
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildExplorerUrl(config: ChainConfig, walletAddress: string, action: ExplorerActionName, apiKey: string, mode: "v2" | "legacy") {
  const params = new URLSearchParams();
  const publicParams = requestParams(config, walletAddress, action);
  for (const [key, value] of Object.entries(publicParams)) params.set(key, String(value));
  if (mode === "legacy") params.delete("chainid");
  params.set("apikey", apiKey);
  const endpoint = mode === "legacy" ? config.legacyApiUrl ?? config.explorerApiUrl : config.explorerApiUrl;
  return `${endpoint}?${params.toString()}`;
}

function resultType(value: unknown) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function firstTwoHashes(result: unknown) {
  return Array.isArray(result) ? result.slice(0, 2).map((row) => row.hash ?? row.transactionHash).filter(Boolean).map(String) : [];
}

function firstTimestamp(result: unknown) {
  if (!Array.isArray(result) || result.length === 0) return null;
  return parseTimestamp(result[0]?.timeStamp ?? result[0]?.timestamp);
}

function lastTimestamp(result: unknown) {
  if (!Array.isArray(result) || result.length === 0) return null;
  const row = result[result.length - 1];
  return parseTimestamp(row?.timeStamp ?? row?.timestamp);
}

function mapExplorerTx(row: any): IndexedTx | null {
  const hash = row.hash ?? row.transactionHash;
  const from = row.from;
  if (!hash || !from) return null;
  const tokenDecimal = row.tokenDecimal ? Number(row.tokenDecimal) : 18;
  return {
    hash: String(hash).toLowerCase(),
    from: String(from).toLowerCase(),
    to: row.to ? String(row.to).toLowerCase() : null,
    value: parseValue(row.value, Number.isFinite(tokenDecimal) ? tokenDecimal : 18),
    timestamp: parseTimestamp(row.timeStamp ?? row.timestamp),
    blockNumber: parseBlockNumber(row.blockNumber ?? row.block_number),
    isError: row.isError === "1" || row.txreceipt_status === "0",
    input: row.input ?? "0x",
    tokenSymbol: row.tokenSymbol ?? null
  };
}

function uniqueByHash(rows: IndexedTx[]) {
  const seen = new Map<string, IndexedTx>();
  for (const row of rows) {
    const existing = seen.get(row.hash);
    if (!existing || (existing.value === 0 && row.value > 0)) seen.set(row.hash, row);
  }
  return Array.from(seen.values()).sort((a, b) => a.blockNumber - b.blockNumber);
}

function blockscoutTimestamp(value: unknown) {
  return parseTimestamp(value ?? null);
}

function blockscoutAddress(value: unknown) {
  if (!value) return null;
  if (typeof value === "string") return value.toLowerCase();
  if (typeof value === "object" && value !== null && "hash" in value) return String((value as { hash?: unknown }).hash ?? "").toLowerCase() || null;
  return null;
}

function mapBlockscoutTx(row: any): IndexedTx | null {
  const hash = row.hash;
  const from = blockscoutAddress(row.from);
  if (!hash || !from) return null;
  const method = String(row.method ?? row.decoded_input?.method_call ?? "");
  const input = row.raw_input ?? row.input ?? (method ? "0xmethod" : "0x");
  return {
    hash: String(hash).toLowerCase(),
    from,
    to: blockscoutAddress(row.to),
    value: parseValue(row.value ?? "0", 18),
    timestamp: blockscoutTimestamp(row.timestamp),
    blockNumber: parseBlockNumber(row.block ?? row.block_number),
    isError: row.status === "error" || row.result === "error" || row.status === "failed",
    input,
    tokenSymbol: null
  };
}

function mapBlockscoutTransfer(row: any): IndexedTx | null {
  const hash = row.tx_hash ?? row.transaction_hash ?? row.transactionHash;
  const from = blockscoutAddress(row.from);
  if (!hash || !from) return null;
  const tokenDecimals = Number(row.token?.decimals ?? row.total?.decimals ?? 18);
  const rawValue = row.total?.value ?? row.value ?? "0";
  return {
    hash: String(hash).toLowerCase(),
    from,
    to: blockscoutAddress(row.to),
    value: parseValue(rawValue, Number.isFinite(tokenDecimals) ? tokenDecimals : 18),
    timestamp: blockscoutTimestamp(row.timestamp),
    blockNumber: parseBlockNumber(row.block_number ?? row.blockNumber),
    isError: false,
    input: "0x",
    tokenSymbol: row.token?.symbol ?? null
  };
}

function blockscoutDebug(action: string, endpoint: string, payload: any, rows: IndexedTx[], error?: string): ExplorerActionResult {
  const result = Array.isArray(payload?.items) ? payload.items : null;
  return {
    action,
    requestParams: { endpoint },
    rawStatus: error ? "0" : "1",
    rawMessage: error ?? "OK",
    resultType: resultType(result),
    rawResultCount: Array.isArray(result) ? result.length : 0,
    firstTwoTxHashes: rows.slice(0, 2).map((row) => row.hash),
    firstTimestamp: rows[0]?.timestamp ?? null,
    lastTimestamp: rows[rows.length - 1]?.timestamp ?? null,
    parsedTxCount: rows.length,
    rows,
    noActivity: !error && rows.length === 0
  };
}

async function fetchBaseBlockscoutHistory(walletAddress: string): Promise<{ history: ChainHistory; actions: ExplorerActionResult[] }> {
  const wallet = walletAddress.toLowerCase();
  const transactionsEndpoint = `https://base.blockscout.com/api/v2/addresses/${wallet}/transactions`;
  const transferEndpoints = [
    ["token-transfers:ERC-20", `https://base.blockscout.com/api/v2/addresses/${wallet}/token-transfers?type=ERC-20`],
    ["token-transfers:ERC-721", `https://base.blockscout.com/api/v2/addresses/${wallet}/token-transfers?type=ERC-721`],
    ["token-transfers:ERC-1155", `https://base.blockscout.com/api/v2/addresses/${wallet}/token-transfers?type=ERC-1155`]
  ] as const;
  const actions: ExplorerActionResult[] = [];
  const rows: IndexedTx[] = [];

  try {
    const txPayload = await fetchJson<any>(transactionsEndpoint, 9000);
    const txRows = Array.isArray(txPayload?.items) ? txPayload.items.slice(0, historyLimit).map(mapBlockscoutTx).filter(Boolean) as IndexedTx[] : [];
    rows.push(...txRows);
    actions.push(blockscoutDebug("transactions", transactionsEndpoint, txPayload, txRows));
  } catch (error) {
    actions.push(blockscoutDebug("transactions", transactionsEndpoint, null, [], error instanceof Error ? error.message : "Blockscout transactions request failed"));
  }

  for (const [action, endpoint] of transferEndpoints) {
    try {
      const transferPayload = await fetchJson<any>(endpoint, 9000);
      const transferRows = Array.isArray(transferPayload?.items) ? transferPayload.items.slice(0, historyLimit).map(mapBlockscoutTransfer).filter(Boolean) as IndexedTx[] : [];
      rows.push(...transferRows);
      actions.push(blockscoutDebug(action, endpoint, transferPayload, transferRows));
    } catch (error) {
      actions.push(blockscoutDebug(action, endpoint, null, [], error instanceof Error ? error.message : "Blockscout token transfer request failed"));
    }
    await sleep(220);
  }

  const parsed = uniqueByHash(rows);
  const errors = actions.filter((action) => action.error).map((action) => `${action.action}: ${action.error}`);
  if (parsed.length > 0) return { history: { rows: parsed, providerSource: "blockscout_base" }, actions };
  if (errors.length === actions.length) return { history: { rows: [], providerSource: "blockscout_base", errorMessage: errors.join("; ") }, actions };
  return { history: { rows: [], providerSource: "blockscout_base" }, actions };
}
function isNoTransactions(payload: any) {
  const message = String(payload?.message ?? "");
  const result = typeof payload?.result === "string" ? payload.result : "";
  return payload?.status === "0" && (noTransactionsPattern.test(message) || noTransactionsPattern.test(result));
}

function classifyExplorerError(payload: any) {
  if (isNoTransactions(payload)) return null;
  const status = payload?.status == null ? "missing" : String(payload.status);
  const message = payload?.message == null ? "missing message" : String(payload.message);
  const result = typeof payload?.result === "string" ? payload.result : resultType(payload?.result);
  return `Explorer API error status=${status} message=${message} result=${result}`;
}

function isRetryableExplorerError(message?: string | null) {
  return Boolean(message && /rate limit|max calls per sec|timeout|fetch failed|network/i.test(message));
}

function isPlanCoverageError(message?: string | null) {
  return isProviderCoverageRestriction(message);
}

function hasDistinctLegacyKey(config: ChainConfig, apiKey: string) {
  if (!config.apiKeyEnv) return false;
  const specificKey = process.env[config.apiKeyEnv];
  const etherscanKey = process.env.ETHERSCAN_API_KEY;
  return Boolean(specificKey && specificKey !== etherscanKey && specificKey === apiKey);
}

async function fetchExplorerAction(
  config: ChainConfig,
  walletAddress: string,
  action: ExplorerActionName,
  apiKey: string,
  mode: "v2" | "legacy" = "v2"
): Promise<ExplorerActionResult> {
  const params = requestParams(config, walletAddress, action);
  let lastResult: ExplorerActionResult | null = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const payload = await fetchJson<any>(buildExplorerUrl(config, walletAddress, action, apiKey, mode), 9000);
      const result = payload?.result;
      const rawResultCount = Array.isArray(result) ? result.length : 0;
      const rows = Array.isArray(result) ? uniqueByHash(result.slice(0, historyLimit).map(mapExplorerTx).filter(Boolean) as IndexedTx[]) : [];
      const debug: ExplorerActionResult = {
        action,
        requestParams: params,
        rawStatus: payload?.status == null ? null : String(payload.status),
        rawMessage: payload?.message == null ? null : String(payload.message),
        resultType: resultType(result),
        rawResultCount,
        firstTwoTxHashes: firstTwoHashes(result),
        firstTimestamp: firstTimestamp(result),
        lastTimestamp: lastTimestamp(result),
        parsedTxCount: rows.length,
        rows,
        noActivity: isNoTransactions(payload)
      };

      if (payload?.status === "1" && Array.isArray(result)) return debug;
      const error = classifyExplorerError(payload);
      lastResult = error ? { ...debug, error } : debug;
      if (!isRetryableExplorerError(error) || attempt === 2) return lastResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown explorer request failure";
      lastResult = {
        action,
        requestParams: params,
        rawStatus: null,
        rawMessage: null,
        resultType: "unavailable",
        rawResultCount: 0,
        firstTwoTxHashes: [],
        firstTimestamp: null,
        lastTimestamp: null,
        parsedTxCount: 0,
        rows: [],
        noActivity: false,
        error: message
      };
      if (!isRetryableExplorerError(message) || attempt === 2) return lastResult;
    }

    await sleep(1200 * (attempt + 1));
  }

  return lastResult!;
}

async function fetchExplorerHistory(config: ChainConfig, walletAddress: string, apiKey: string): Promise<ChainHistory> {
  const normal = await fetchExplorerAction(config, walletAddress, "txlist", apiKey, "v2");
  await sleep(420);
  const token = await fetchExplorerAction(config, walletAddress, "tokentx", apiKey, "v2");
  let primaryActions = [normal, token];
  let rows = uniqueByHash(primaryActions.flatMap((item) => item.rows));
  const shouldProbeNfts = rows.length === 0 && !primaryActions.some((item) => item.error && !isPlanCoverageError(item.error));
  if (shouldProbeNfts) {
    await sleep(420);
    const nft = await fetchExplorerAction(config, walletAddress, "tokennfttx", apiKey, "v2");
    await sleep(420);
    const token1155 = await fetchExplorerAction(config, walletAddress, "token1155tx", apiKey, "v2");
    primaryActions = [...primaryActions, nft, token1155];
    rows = uniqueByHash(primaryActions.flatMap((item) => item.rows));
  }
  const errors = primaryActions.filter((item) => item.error).map((item) => `${item.action}: ${item.error}`);

  if (rows.length > 0) return { rows, providerSource: "etherscan_v2" };

  if (config.key === "base") {
    const fallback = await fetchBaseBlockscoutHistory(walletAddress);
    if (fallback.history.rows.length > 0) return fallback.history;
    if (fallback.history.errorMessage) {
      const primaryState = errors.length > 0 ? `Etherscan V2 failed: ${errors.join("; ")}` : "Etherscan V2 returned zero activity";
      throw new Error(`${primaryState}; Blockscout failed: ${fallback.history.errorMessage}`);
    }
    if (!errors.length && primaryActions.every((item) => item.noActivity)) return fallback.history;
    if (errors.some(isPlanCoverageError)) return fallback.history;
  }

  if (errors.some(isPlanCoverageError)) {
    if (config.key === "bsc") {
      return {
        rows: [],
        providerSource: "limited_provider_required",
        limited: true,
        errorMessage: "BNB indexing requires paid Etherscan coverage or BSCTrace/MegaNode provider"
      };
    }
  }

  const canUseLegacyFallback = config.key !== "arbitrum" && config.legacyApiUrl && (!errors.some(isPlanCoverageError) || hasDistinctLegacyKey(config, apiKey));
  if (errors.length > 0 && config.key === "arbitrum") {
    throw new Error(`Arbitrum Etherscan V2 provider unavailable: ${errors.join("; ")}`);
  }

  if (errors.length > 0 && canUseLegacyFallback) {
    await sleep(600);
    const legacyNormal = await fetchExplorerAction(config, walletAddress, "txlist", apiKey, "legacy");
    await sleep(420);
    const legacyToken = await fetchExplorerAction(config, walletAddress, "tokentx", apiKey, "legacy");
    let legacyActions = [legacyNormal, legacyToken];
    let legacyRows = uniqueByHash(legacyActions.flatMap((item) => item.rows));
    if (legacyRows.length === 0 && !legacyActions.some((item) => item.error && !isPlanCoverageError(item.error))) {
      await sleep(420);
      const legacyNft = await fetchExplorerAction(config, walletAddress, "tokennfttx", apiKey, "legacy");
      await sleep(420);
      const legacy1155 = await fetchExplorerAction(config, walletAddress, "token1155tx", apiKey, "legacy");
      legacyActions = [...legacyActions, legacyNft, legacy1155];
      legacyRows = uniqueByHash(legacyActions.flatMap((item) => item.rows));
    }
    const legacyErrors = legacyActions.filter((item) => item.error).map((item) => `${item.action}: ${item.error}`);
    if (legacyRows.length > 0) return { rows: legacyRows, providerSource: "etherscan_legacy" };
    if (legacyActions.every((item) => item.noActivity)) return { rows: [], providerSource: "etherscan_legacy" };
    if (legacyErrors.length > 0) throw new Error(`V2 failed: ${errors.join("; ")}; legacy failed: ${legacyErrors.join("; ")}`);
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
  if (primaryActions.every((item) => item.noActivity)) return { rows: [], providerSource: "etherscan_v2" };
  throw new Error("Explorer API returned no parsable transaction array and no no-activity signal");
}

function analyzeTransactions(config: ChainConfig, walletAddress: string, rows: IndexedTx[], nativeBalance = 0, providerSource = "unknown", errorMessage: string | null = null): ChainSnapshot {
  const wallet = normalizeWallet(walletAddress);
  const successful = rows.filter((row) => !row.isError && (row.from === wallet || row.to === wallet));
  if (successful.length === 0) return { ...emptySnapshot(config, walletAddress, "no_activity", providerSource, errorMessage), nativeBalance };

  const counterparties = new Set<string>();
  const activeDays = new Set<string>();
  const timestamps: number[] = [];
  const recentCutoff = Date.now() - recentWindowDays * 86400000;
  let contractInteractions = 0;
  let recentActivityCount = 0;

  for (const row of successful) {
    const counterparty = row.from === wallet ? row.to : row.from;
    if (counterparty) counterparties.add(counterparty);
    const ts = row.timestamp ? new Date(row.timestamp).getTime() : 0;
    if (ts > 0) {
      timestamps.push(ts);
      activeDays.add(new Date(ts).toISOString().slice(0, 10));
      if (ts >= recentCutoff) recentActivityCount += 1;
    }
    if (row.input && row.input !== "0x" && row.input !== "0x0" && !row.tokenSymbol) contractInteractions += 1;
  }

  timestamps.sort((a, b) => a - b);
  const firstSeenAt = timestamps[0] ? new Date(timestamps[0]).toISOString() : null;
  const lastSeenAt = timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
  const walletAgeDays = firstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000)) : 0;
  return {
    ...emptySnapshot(config, walletAddress, "indexed", providerSource, errorMessage),
    txCount: successful.length,
    firstSeenAt,
    lastSeenAt,
    walletAgeDays,
    nativeBalance,
    uniqueCounterparties: counterparties.size,
    counterpartyAddresses: Array.from(counterparties),
    contractInteractions,
    activeDays: activeDays.size,
    recentActivityCount
  };
}

async function indexArc(config: ChainConfig, walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  console.log("[arc-identity] arc_indexing_started", { walletAddress: wallet, chainId: config.chainId, provider: "arcscan" });
  const [arc, attestations] = await Promise.all([
    getWalletAnalytics(wallet, 5200),
    getArcVerifiedAttestationActivity(wallet)
  ]);
  if (!arc.rpcAvailable && attestations.txCount === 0) {
    console.warn("[arc-identity] arc_indexing_failed", { walletAddress: wallet, reason: "Provider unavailable" });
    return emptySnapshot(config, wallet, "error", "arcscan", "Provider unavailable");
  }
  const status: ChainStatus = arc.txCount > 0 || attestations.txCount > 0 ? "indexed" : "no_activity";
  const firstSeenAt = earliestIso([arc.firstSeenAt, attestations.firstSeenAt]);
  const lastSeenAt = latestIso([arc.lastActivityAt, attestations.lastSeenAt]);
  const activeDays = new Set(Array.from(attestations.activeDays));
  if (arc.activeDays > 0 && arc.lastActivityAt) activeDays.add(arc.lastActivityAt.slice(0, 10));
  const txCount = Math.max(arc.txCount, attestations.txCount);
  const counterpartyAddresses = Array.from(new Set([...(arc.counterpartyAddresses ?? []), ...Array.from(attestations.counterparties)]));
  const walletAgeDays = firstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000)) : 0;
  const snapshot = {
    ...emptySnapshot(config, wallet, status, attestations.txCount > 0 ? "arcscan_verified_attestations" : "arcscan"),
    txCount,
    firstSeenAt,
    lastSeenAt,
    walletAgeDays,
    nativeBalance: arc.balance,
    uniqueCounterparties: Math.max(counterpartyAddresses.length, arc.uniqueCounterparties, attestations.counterparties.size),
    counterpartyAddresses,
    contractInteractions: Math.max(arc.contractInteractionCount, attestations.txCount),
    activeDays: Math.max(arc.activeDays, activeDays.size),
    recentActivityCount: Math.max(arc.recentActivityCount, attestations.recentActivityCount)
  };
  console.log("[arc-identity] arc_indexing_result", { walletAddress: wallet, status: snapshot.status, txCount: snapshot.txCount, attestations: attestations.txCount, counterparties: snapshot.uniqueCounterparties, activeDays: snapshot.activeDays });
  return snapshot;
}

function earliestIso(values: Array<string | null>) {
  const times = values.map((value) => value ? new Date(value).getTime() : 0).filter(Boolean);
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

function latestIso(values: Array<string | null>) {
  const times = values.map((value) => value ? new Date(value).getTime() : 0).filter(Boolean);
  return times.length ? new Date(Math.max(...times)).toISOString() : null;
}

async function getArcVerifiedAttestationActivity(walletAddress: string) {
  const wallet = normalizeWallet(walletAddress);
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("attestations")
    .select("tx_hash,tx_timestamp,created_at,from_wallet,to_wallet,tx_block_number,verified_transaction")
    .or(`from_wallet.eq.${wallet},to_wallet.eq.${wallet}`)
    .not("tx_hash", "is", null);
  if (error) {
    console.warn("[arc-identity] arc_indexing_failed", { walletAddress: wallet, reason: error.message });
    return { txCount: 0, firstSeenAt: null as string | null, lastSeenAt: null as string | null, activeDays: new Set<string>(), counterparties: new Set<string>(), recentActivityCount: 0 };
  }
  const hashes = new Set<string>();
  const activeDays = new Set<string>();
  const counterparties = new Set<string>();
  const timestamps: number[] = [];
  const recentCutoff = Date.now() - recentWindowDays * 86400000;
  let recentActivityCount = 0;
  for (const row of data ?? []) {
    const hash = String(row.tx_hash ?? "").toLowerCase();
    if (!hash || hashes.has(hash)) continue;
    hashes.add(hash);
    const from = normalizeWallet(row.from_wallet ?? "");
    const to = normalizeWallet(row.to_wallet ?? "");
    const counterparty = from === wallet ? to : from;
    if (counterparty && counterparty !== wallet) counterparties.add(counterparty);
    const timestamp = parseTimestamp(row.tx_timestamp ?? row.created_at);
    if (timestamp) {
      const time = new Date(timestamp).getTime();
      timestamps.push(time);
      activeDays.add(timestamp.slice(0, 10));
      if (time >= recentCutoff) recentActivityCount += 1;
    }
  }
  timestamps.sort((a, b) => a - b);
  return {
    txCount: hashes.size,
    firstSeenAt: timestamps[0] ? new Date(timestamps[0]).toISOString() : null,
    lastSeenAt: timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null,
    activeDays,
    counterparties,
    recentActivityCount
  };
}

async function indexChain(config: ChainConfig, walletAddress: string): Promise<ChainSnapshot> {
  try {
    if (config.isArc) return await indexArc(config, walletAddress);
    const apiKey = getApiKey(config);
    if (!apiKey) return emptySnapshot(config, walletAddress, "not_configured", "not_configured");
    const history = await fetchExplorerHistory(config, walletAddress, apiKey);
    if (history.limited) return emptySnapshot(config, walletAddress, normalizeChainStatus({ status: "limited", providerSource: history.providerSource, errorMessage: history.errorMessage }), history.providerSource, history.errorMessage ?? null);
    const snapshot = analyzeTransactions(config, walletAddress, history.rows, 0, history.providerSource, history.errorMessage ?? null);
    console.log("[arc-identity] multichain chain indexed", { walletAddress, chain: config.name, status: snapshot.status, txCount: snapshot.txCount, firstSeenAt: snapshot.firstSeenAt, counterparties: snapshot.uniqueCounterparties });
    return snapshot;
  } catch (error) {
    console.warn("[arc-identity] multichain chain failure", { walletAddress, chain: config.name, message: error instanceof Error ? error.message : "unknown" });
    const message = error instanceof Error ? error.message : "unknown";
    return emptySnapshot(config, walletAddress, normalizeChainStatus({ status: "error", errorMessage: message, providerSource: defaultProviderSource(config) }), defaultProviderSource(config), message);
  }
}

async function indexChainWithTimeout(config: ChainConfig, walletAddress: string): Promise<ChainSnapshot> {
  try {
    return await withTimeout(indexChain(config, walletAddress), chainScanTimeoutMs, `${config.name} provider scan`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "provider scan timed out";
    const status = normalizeChainStatus({ status: "error", errorMessage: message, providerSource: defaultProviderSource(config), chainName: config.name });
    console.warn("[arc-identity] multichain chain timeout_or_failure", { walletAddress, chain: config.name, status, message });
    return emptySnapshot(config, walletAddress, status, defaultProviderSource(config), message);
  }
}

export async function getMultiChainWalletProfile(walletAddress: string): Promise<MultiChainWalletProfile> {
  const wallet = normalizeWallet(walletAddress);
  return withTimeout((async () => {
    const chainSnapshots = await Promise.all(chains.map((chain) => indexChainWithTimeout(chain, wallet)));
    const active = chainSnapshots.filter((chain) => chain.status === "indexed" && chain.txCount > 0);
    const firstSeenTimes = active.map((chain) => chain.firstSeenAt ? new Date(chain.firstSeenAt).getTime() : 0).filter(Boolean);
    const globalFirstSeenAt = firstSeenTimes.length ? new Date(Math.min(...firstSeenTimes)).toISOString() : null;
    const globalWalletAgeDays = Math.max(
      globalFirstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(globalFirstSeenAt).getTime()) / 86400000)) : 0,
      active.reduce((max, chain) => Math.max(max, chain.walletAgeDays), 0)
    );

    const uniqueCounterparties = new Set(active.flatMap((chain) => chain.counterpartyAddresses ?? []));
    const profile = {
      walletAddress: wallet,
      globalFirstSeenAt,
      globalWalletAgeDays,
      totalTxCount: active.reduce((sum, chain) => sum + chain.txCount, 0),
      activeChains: active.map((chain) => chain.chain),
      uniqueCounterparties: Math.max(uniqueCounterparties.size, active.filter((chain) => (chain.counterpartyAddresses?.length ?? 0) === 0).reduce((max, chain) => Math.max(max, chain.uniqueCounterparties), 0)),
      totalContractInteractions: active.reduce((sum, chain) => sum + chain.contractInteractions, 0),
      chains: chainSnapshots
    };
    console.log("[arc-identity] intelligence_aggregation_input_chains", { wallet, chains: chainSnapshots.map((chain) => ({ chain: chain.chain, status: chain.status, txCount: chain.txCount, walletAgeDays: chain.walletAgeDays, firstSeenAt: chain.firstSeenAt })) });
    console.log("[arc-identity] intelligence_aggregation_output_summary", { wallet, globalFirstSeenAt, globalWalletAgeDays, totalTxCount: profile.totalTxCount, activeChains: profile.activeChains });
    if (active.some((chain) => chain.walletAgeDays > 0) && globalWalletAgeDays <= 0) console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "chain_age_without_global_age" });
    if (active.reduce((sum, chain) => sum + chain.txCount, 0) > 0 && profile.totalTxCount <= 0) console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "chain_tx_without_total_tx" });
    if (active.length > 0 && profile.activeChains.length <= 0) console.warn("[arc-identity] aggregation_invariant_violation", { wallet, invariant: "indexed_chains_without_active_chains" });
    console.log("[arc-identity] multichain profile", { wallet, globalFirstSeenAt, globalWalletAgeDays, totalTxCount: profile.totalTxCount, activeChains: profile.activeChains });
    return profile;
  })(), 45000, "multi-chain wallet profile");
}

export async function debugMultiChainWallet(walletAddress: string): Promise<MultiChainDebugResult> {
  const wallet = normalizeWallet(walletAddress);
  const results: MultiChainDebugResult["chains"] = [];
  const explorerActions: ExplorerActionName[] = ["txlist", "tokentx", "tokennfttx", "token1155tx"];

  for (const config of chains) {
    const configured = config.isArc ? true : Boolean(getApiKey(config));
    const endpointUsed = config.isArc ? config.explorerApiUrl : etherscanV2Url;

    if (!configured) {
      const actions = explorerActions.map((action) => ({
        action,
        requestParams: requestParams(config, wallet, action),
        rawStatus: null,
        rawMessage: null,
        resultType: "not_configured",
        rawResultCount: 0,
        firstTwoTxHashes: [],
        firstTimestamp: null,
        lastTimestamp: null,
        parsedTxCount: 0,
        error: `${config.apiKeyEnv ?? "ETHERSCAN_API_KEY"} is missing`
      }));
      results.push({
        chain: config.name,
        chainId: config.chainId,
        configured,
        endpointUsed,
        actions,
        primaryProviderResult: { provider: "etherscan_v2", actions, error: actions[0]?.error },
        finalSelectedProvider: "not_configured",
        finalChainStatus: "not_configured"
      });
      continue;
    }

    if (config.isArc) {
      const arc = await getWalletAnalytics(wallet, 5200);
      const actions = explorerActions.map((action) => ({
        action,
        requestParams: requestParams(config, wallet, action),
        rawStatus: arc.rpcAvailable ? "1" : "0",
        rawMessage: arc.rpcAvailable ? "OK via Arc indexer" : "Arc RPC/indexer unavailable",
        resultType: "arc_analytics",
        rawResultCount: action === "txlist" ? arc.txCount : action === "tokentx" ? arc.transferCount : 0,
        firstTwoTxHashes: [],
        firstTimestamp: arc.firstSeenAt,
        lastTimestamp: arc.lastActivityAt,
        parsedTxCount: action === "txlist" ? arc.txCount : action === "tokentx" ? arc.transferCount : 0
      }));
      results.push({
        chain: config.name,
        chainId: config.chainId,
        configured,
        endpointUsed,
        actions,
        primaryProviderResult: { provider: "arcscan", actions },
        finalSelectedProvider: "arcscan",
        finalChainStatus: arc.txCount > 0 ? "indexed" : "no_activity"
      });
      continue;
    }

    const apiKey = getApiKey(config)!;
    const primaryResults: ExplorerActionResult[] = [];
    for (const action of explorerActions) {
      primaryResults.push(await fetchExplorerAction(config, wallet, action, apiKey, "v2"));
      await sleep(420);
    }
    const primaryActions = primaryResults.map(({ rows: _rows, noActivity: _noActivity, ...debug }) => debug);
    const primaryErrors = primaryResults.filter((action) => action.error).map((action) => `${action.action}: ${action.error}`);
    const primaryRows = uniqueByHash(primaryResults.flatMap((action) => action.rows));

    let fallbackProviderResult: MultiChainDebugResult["chains"][number]["fallbackProviderResult"];
    let finalSelectedProvider = "etherscan_v2";
    let finalChainStatus: ChainStatus = normalizeChainStatus({ txCount: primaryRows.length, noActivity: primaryResults.every((item) => item.noActivity), errorMessage: primaryErrors.join("; "), providerSource: "etherscan_v2" });
    let error = primaryActions.find((action) => action.error)?.error;
    const isLimited = primaryErrors.some(isPlanCoverageError);

    if (primaryRows.length === 0 && config.key === "base") {
      const fallback = await fetchBaseBlockscoutHistory(wallet);
      const fallbackActions = fallback.actions.map(({ rows: _rows, noActivity: _noActivity, ...debug }) => debug);
      fallbackProviderResult = {
        provider: "blockscout_base",
        actions: fallbackActions,
        error: fallback.history.errorMessage ?? fallbackActions.find((action) => action.error)?.error
      };
      finalSelectedProvider = "blockscout_base";
      finalChainStatus = normalizeChainStatus({ txCount: fallback.history.rows.length, noActivity: !fallback.history.errorMessage, errorMessage: fallback.history.errorMessage, providerSource: "blockscout_base" });
      error = fallback.history.errorMessage ?? undefined;
    } else if (primaryRows.length === 0 && isLimited && config.key === "bsc") {
      finalSelectedProvider = "limited_provider_required";
      finalChainStatus = "limited";
      error = "BNB indexing requires paid Etherscan coverage or BSCTrace/MegaNode provider";
    }

    results.push({
      chain: config.name,
      chainId: config.chainId,
      configured,
      endpointUsed,
      actions: primaryActions,
      primaryProviderResult: { provider: "etherscan_v2", actions: primaryActions, error: primaryErrors.join("; ") || undefined },
      fallbackProviderResult,
      finalSelectedProvider,
      finalChainStatus,
      error
    });
    await sleep(650);
  }

  return { walletAddress: wallet, chains: results };
}

function diagnosticStatus(snapshot: ChainSnapshot): ChainStatus | "provider_unavailable" | "timeout" {
  const message = snapshot.errorMessage ?? "";
  if (/timed out|timeout|aborted/i.test(message)) return "timeout";
  if (snapshot.status === "error") return "provider_unavailable";
  return snapshot.status;
}

export async function diagnoseProviders(walletAddress: string): Promise<ProviderDiagnosticsResult> {
  const wallet = normalizeWallet(walletAddress);
  const startedAt = Date.now();
  const chainResults = await Promise.all(chains.map(async (chain) => {
    const chainStartedAt = Date.now();
    const configured = chain.isArc ? true : Boolean(getApiKey(chain));
    if (!configured) {
      return {
        chain: chain.name,
        chainId: chain.chainId,
        configured,
        providerUsed: "not_configured",
        status: "not_configured" as const,
        txCount: 0,
        activeDays: 0,
        counterparties: 0,
        durationMs: Date.now() - chainStartedAt,
        error: `${chain.apiKeyEnv ?? "ETHERSCAN_API_KEY"} is missing`
      };
    }
    const snapshot = await indexChainWithTimeout(chain, wallet);
    return {
      chain: snapshot.chain,
      chainId: snapshot.chainId,
      configured,
      providerUsed: snapshot.providerSource,
      status: diagnosticStatus(snapshot),
      txCount: snapshot.txCount,
      activeDays: snapshot.activeDays,
      counterparties: snapshot.uniqueCounterparties,
      durationMs: Date.now() - chainStartedAt,
      error: snapshot.errorMessage ?? null
    };
  }));
  return {
    wallet,
    chains: chainResults,
    totalDurationMs: Date.now() - startedAt
  };
}
