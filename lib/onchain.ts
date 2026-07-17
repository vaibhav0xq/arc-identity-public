import type { WalletAnalytics } from "@/lib/types";
import { TimeoutError, timeoutSignal, withTimeout } from "@/lib/timeouts";

const fallbackRpcUrl = "https://rpc.testnet.arc.network";
const arcRpcUrl = process.env.NEXT_PUBLIC_ARC_RPC_URL || fallbackRpcUrl;
const explorerUrl = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app";
const scanDepth = 72;
const historyLimit = 1000;
const recentWindowDays = 30;

const erc20TransferTopic = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type RpcBlock = {
  number?: string;
  timestamp: string;
  transactions: { hash?: string; from?: string; to?: string | null; value?: string; input?: string }[];
};

type HistoryTx = {
  hash: string;
  from: string;
  to: string | null;
  value: number;
  timestamp: string | null;
  blockNumber: number;
  isError?: boolean;
  method?: string;
  input?: string;
  tokenSymbol?: string | null;
  tokenDecimal?: number | null;
  contractAddress?: string | null;
  source: string;
};

type HistoryResult = {
  source: string;
  transactions: HistoryTx[];
};

type ArcVerificationLogContext = {
  txHash: string;
  fromWallet: string;
  counterpartyWallet: string;
  chain: string | null;
};

export type ArcLiveWalletData = {
  walletAddress: string;
  balance: number | null;
  latestBlock: number | null;
  txCount: number | null;
  source: "live_arc_rpc" | "unavailable";
  providerStatus: "live" | "unavailable";
  updatedAt: string;
  errorMessage?: string | null;
};

function fallback(walletAddress: string): WalletAnalytics {
  return {
    walletAddress,
    txCount: 0,
    balance: 0,
    latestBlock: 0,
    firstSeenAt: null,
    lastActivityAt: null,
    activeDays: 0,
    uniqueCounterparties: 0,
    recentActivityCount: 0,
    walletAgeDays: 0,
    activityFrequency: 0,
    transferCount: 0,
    contractInteractionCount: 0,
    indexerSource: "unavailable",
    activityScore: 5,
    rpcAvailable: false
  };
}

function isAbortLike(error: unknown) {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || /aborted|abort/i.test(error.message);
}

function isUnavailableLike(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP 5\d\d/i.test(message);
}

function logArcVerification(ctx: ArcVerificationLogContext, step: string, details: Record<string, unknown> = {}) {
  console.log("[arc-identity] arc tx verification", {
    txHash: ctx.txHash,
    chain: ctx.chain,
    connectedWallet: ctx.fromWallet,
    selectedCounterparty: ctx.counterpartyWallet,
    rpcEndpoint: arcRpcUrl,
    step,
    ...details
  });
}

function normalizeArcRpcFailure(error: unknown, step: string) {
  if (error instanceof TimeoutError || isAbortLike(error)) return new Error(`Arc RPC timeout during ${step}`);
  if (isUnavailableLike(error)) return new Error(`Arc RPC unavailable during ${step}`);
  if (error instanceof Error) return error;
  return new Error(`Arc RPC unavailable during ${step}`);
}

async function retryArcRpcStep<T>(step: string, ctx: ArcVerificationLogContext, operation: () => Promise<T>) {
  try {
    logArcVerification(ctx, step);
    return await operation();
  } catch (error) {
    const normalized = normalizeArcRpcFailure(error, step);
    if (!/Arc RPC timeout|Arc RPC unavailable/i.test(normalized.message)) throw normalized;
    logArcVerification(ctx, `${step}_retry`, { reason: normalized.message });
    await new Promise((resolve) => setTimeout(resolve, 450));
    try {
      return await operation();
    } catch (retryError) {
      throw normalizeArcRpcFailure(retryError, step);
    }
  }
}

async function rpc<T>(method: string, params: unknown[], timeoutMs: number, context?: { step?: string }): Promise<T> {
  const { signal, clear } = timeoutSignal(timeoutMs);
  try {
    const response = await fetch(arcRpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal,
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`Arc RPC HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error.message ?? "Arc RPC error");
    return data.result as T;
  } catch (error) {
    throw normalizeArcRpcFailure(error, context?.step ?? method);
  } finally {
    clear();
  }
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

export function scoreOnchainActivity(txCount: number, recentActivityCount = 0, activeDays = 0) {
  const base = txCount === 0 ? 0 : txCount <= 2 ? 20 : txCount <= 8 ? 45 : txCount <= 25 ? 70 : 90;
  return Math.max(0, Math.min(100, Math.round(base + Math.min(recentActivityCount, 10) * 2 + Math.min(activeDays, 14))));
}

function parseNativeBalance(balanceHex: string) {
  const raw = BigInt(balanceHex);
  return Number(raw) / 1e18;
}

function blockTimestampToIso(timestamp: string) {
  return new Date(Number.parseInt(timestamp, 16) * 1000).toISOString();
}

function normalizeWalletAddress(wallet: string) {
  const clean = wallet.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(clean)) throw new Error("Valid wallet address required");
  return clean;
}

function parseTimestamp(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return new Date(value < 10000000000 ? value * 1000 : value).toISOString();
  const text = String(value);
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return new Date(numeric < 10000000000 ? numeric * 1000 : numeric).toISOString();
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseBlockNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  return value.startsWith("0x") ? Number.parseInt(value, 16) : Number(value || 0);
}

function parseValue(value: unknown, decimals = 18) {
  if (value == null) return 0;
  const text = String(value);
  if (!/^\d+$/.test(text)) return Number(text) || 0;
  return Number(BigInt(text)) / 10 ** decimals;
}

function uniqueByHash(transactions: HistoryTx[]) {
  const map = new Map<string, HistoryTx>();
  for (const tx of transactions) {
    if (!tx.hash) continue;
    const existing = map.get(tx.hash.toLowerCase());
    if (!existing || (existing.value === 0 && tx.value > 0)) map.set(tx.hash.toLowerCase(), tx);
  }
  return Array.from(map.values());
}

function mapEtherscanTx(row: any, source: string): HistoryTx | null {
  const hash = row.hash ?? row.transactionHash;
  const from = row.from;
  if (!hash || !from) return null;
  const tokenDecimal = row.tokenDecimal ? Number(row.tokenDecimal) : 18;
  return {
    hash: String(hash).toLowerCase(),
    from: String(from).toLowerCase(),
    to: row.to ? String(row.to).toLowerCase() : null,
    value: parseValue(row.value, tokenDecimal),
    timestamp: parseTimestamp(row.timeStamp ?? row.timestamp),
    blockNumber: parseBlockNumber(row.blockNumber ?? row.block_number),
    isError: row.isError === "1" || row.txreceipt_status === "0",
    method: row.functionName ?? row.methodId ?? null,
    input: row.input ?? "0x",
    tokenSymbol: row.tokenSymbol ?? null,
    tokenDecimal,
    contractAddress: row.contractAddress ? String(row.contractAddress).toLowerCase() : null,
    source
  };
}

function mapBlockscoutTx(row: any, source: string): HistoryTx | null {
  const hash = row.hash;
  const from = row.from?.hash ?? row.from;
  if (!hash || !from) return null;
  const to = row.to?.hash ?? row.to;
  return {
    hash: String(hash).toLowerCase(),
    from: String(from).toLowerCase(),
    to: to ? String(to).toLowerCase() : null,
    value: parseValue(row.value, 18),
    timestamp: parseTimestamp(row.timestamp),
    blockNumber: parseBlockNumber(row.block_number ?? row.blockNumber),
    isError: row.status === "error" || row.result === "error",
    method: row.method ?? row.decoded_input?.method_call ?? null,
    input: row.raw_input ?? row.input ?? "0x",
    tokenSymbol: null,
    tokenDecimal: null,
    contractAddress: null,
    source
  };
}

function mapBlockscoutTransfer(row: any, source: string): HistoryTx | null {
  const txHash = row.tx_hash ?? row.transaction_hash ?? row.transactionHash;
  const from = row.from?.hash ?? row.from;
  const to = row.to?.hash ?? row.to;
  if (!txHash || !from) return null;
  const token = row.token ?? {};
  const decimals = Number(token.decimals ?? row.total?.decimals ?? row.tokenDecimal ?? 18);
  const rawValue = row.total?.value ?? row.value;
  return {
    hash: String(txHash).toLowerCase(),
    from: String(from).toLowerCase(),
    to: to ? String(to).toLowerCase() : null,
    value: parseValue(rawValue, Number.isFinite(decimals) ? decimals : 18),
    timestamp: parseTimestamp(row.timestamp),
    blockNumber: parseBlockNumber(row.block_number ?? row.blockNumber),
    isError: false,
    method: "ERC20 Transfer",
    input: "0x",
    tokenSymbol: token.symbol ?? row.tokenSymbol ?? null,
    tokenDecimal: decimals,
    contractAddress: token.address ? String(token.address).toLowerCase() : row.token?.address ?? null,
    source
  };
}

async function fetchEtherscanCompatible(address: string): Promise<HistoryResult> {
  const base = explorerUrl.replace(/\/$/, "");
  const normalUrl = `${base}/api?module=account&action=txlist&address=${address}&startblock=0&endblock=999999999&sort=asc`;
  const tokenUrl = `${base}/api?module=account&action=tokentx&address=${address}&startblock=0&endblock=999999999&sort=asc`;
  const [normal, token] = await Promise.allSettled([
    fetchJson<any>(normalUrl, 2200),
    fetchJson<any>(tokenUrl, 2200)
  ]);
  const rows: HistoryTx[] = [];
  for (const result of [normal, token]) {
    if (result.status !== "fulfilled") continue;
    const payload = result.value;
    const list = Array.isArray(payload?.result) ? payload.result : Array.isArray(payload) ? payload : [];
    for (const row of list.slice(0, historyLimit)) {
      const mapped = mapEtherscanTx(row, "explorer_etherscan_api");
      if (mapped) rows.push(mapped);
    }
  }
  if (rows.length === 0) throw new Error("Explorer Etherscan-compatible API returned no transactions");
  return { source: "explorer_etherscan_api", transactions: uniqueByHash(rows) };
}

async function fetchBlockscoutV2(address: string): Promise<HistoryResult> {
  const base = explorerUrl.replace(/\/$/, "");
  const txUrl = `${base}/api/v2/addresses/${address}/transactions`;
  const transferUrl = `${base}/api/v2/addresses/${address}/token-transfers?type=ERC-20`;
  const [txs, transfers] = await Promise.allSettled([
    fetchJson<any>(txUrl, 2200),
    fetchJson<any>(transferUrl, 2200)
  ]);
  const rows: HistoryTx[] = [];
  if (txs.status === "fulfilled") {
    const list = Array.isArray(txs.value?.items) ? txs.value.items : [];
    for (const row of list.slice(0, historyLimit)) {
      const mapped = mapBlockscoutTx(row, "blockscout_v2_api");
      if (mapped) rows.push(mapped);
    }
  }
  if (transfers.status === "fulfilled") {
    const list = Array.isArray(transfers.value?.items) ? transfers.value.items : [];
    for (const row of list.slice(0, historyLimit)) {
      const mapped = mapBlockscoutTransfer(row, "blockscout_v2_api");
      if (mapped) rows.push(mapped);
    }
  }
  if (rows.length === 0) throw new Error("Blockscout v2 API returned no transactions");
  return { source: "blockscout_v2_api", transactions: uniqueByHash(rows) };
}

async function fetchRpcRecentHistory(address: string, latestBlock: number): Promise<HistoryResult> {
  const start = Math.max(0, latestBlock - scanDepth + 1);
  const blockNumbers = Array.from({ length: latestBlock - start + 1 }, (_, index) => start + index);
  const wallet = address.toLowerCase();
  const blocks = await Promise.allSettled(
    blockNumbers.map((blockNumber) => rpc<RpcBlock>("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, true], 750))
  );
  const rows: HistoryTx[] = [];
  for (const result of blocks) {
    if (result.status !== "fulfilled") continue;
    const block = result.value;
    const timestamp = blockTimestampToIso(block.timestamp);
    for (const tx of block.transactions ?? []) {
      const from = tx.from?.toLowerCase();
      const to = tx.to?.toLowerCase() ?? null;
      if (from !== wallet && to !== wallet) continue;
      rows.push({
        hash: String(tx.hash ?? `${block.number}-${rows.length}`).toLowerCase(),
        from: from ?? "",
        to,
        value: parseValue(tx.value ?? "0", 18),
        timestamp,
        blockNumber: parseBlockNumber(block.number),
        isError: false,
        input: tx.input ?? "0x",
        source: "rpc_recent_block_scan"
      });
    }
  }
  return { source: "rpc_recent_block_scan", transactions: uniqueByHash(rows) };
}

async function fetchWalletHistory(address: string, latestBlock: number) {
  const failures: string[] = [];
  for (const loader of [fetchEtherscanCompatible, fetchBlockscoutV2]) {
    try {
      const result = await loader(address);
      console.log("[arc-identity] onchain history source", { address, source: result.source, txCount: result.transactions.length });
      return { ...result, failures };
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown failure";
      failures.push(message);
      console.warn("[arc-identity] onchain indexer failure", { address, message });
    }
  }

  try {
    const result = await fetchRpcRecentHistory(address, latestBlock);
    console.log("[arc-identity] onchain history source", { address, source: result.source, txCount: result.transactions.length });
    return { ...result, failures };
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown RPC scan failure";
    failures.push(message);
    console.warn("[arc-identity] rpc recent scan failure", { address, message });
    return { source: "unavailable", transactions: [], failures };
  }
}

function analyzeHistory(walletAddress: string, transactions: HistoryTx[]) {
  const wallet = walletAddress.toLowerCase();
  const successful = transactions.filter((tx) => !tx.isError);
  const counterparties = new Set<string>();
  const activeDays = new Set<string>();
  const timestamps: number[] = [];
  const recentCutoff = Date.now() - recentWindowDays * 86400000;
  let recentActivityCount = 0;
  let transferCount = 0;
  let contractInteractionCount = 0;

  for (const tx of successful) {
    const from = tx.from?.toLowerCase();
    const to = tx.to?.toLowerCase() ?? null;
    if (from !== wallet && to !== wallet) continue;
    const timestamp = tx.timestamp ? new Date(tx.timestamp).getTime() : 0;
    if (timestamp > 0) {
      timestamps.push(timestamp);
      activeDays.add(new Date(timestamp).toISOString().slice(0, 10));
      if (timestamp >= recentCutoff) recentActivityCount += 1;
    }
    const counterparty = from === wallet ? to : from;
    if (counterparty) counterparties.add(counterparty);
    const hasInput = Boolean(tx.input && tx.input !== "0x" && tx.input !== "0x0");
    if (tx.tokenSymbol || tx.value > 0 || tx.method === "ERC20 Transfer") transferCount += 1;
    if (hasInput || (tx.to && tx.value === 0 && !tx.tokenSymbol)) contractInteractionCount += 1;
  }

  timestamps.sort((a, b) => a - b);
  const firstSeenAt = timestamps[0] ? new Date(timestamps[0]).toISOString() : null;
  const lastActivityAt = timestamps[timestamps.length - 1] ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
  const walletAgeDays = firstSeenAt ? Math.max(1, Math.floor((Date.now() - new Date(firstSeenAt).getTime()) / 86400000)) : 0;
  const activityFrequency = walletAgeDays > 0 ? successful.length / walletAgeDays : 0;

  return {
    txCount: successful.length,
    firstSeenAt,
    lastActivityAt,
    activeDays: activeDays.size,
    uniqueCounterparties: counterparties.size,
    recentActivityCount,
    walletAgeDays,
    activityFrequency,
    transferCount,
    contractInteractionCount
  };
}

async function getWalletAnalyticsInner(walletAddress: string): Promise<WalletAnalytics> {
  const wallet = normalizeWalletAddress(walletAddress);
  try {
    const [nonceHex, balanceHex, latestHex] = await Promise.all([
      rpc<string>("eth_getTransactionCount", [wallet, "latest"], 1000).catch((error) => {
        console.warn("[arc-identity] rpc nonce failure", { wallet, message: error instanceof Error ? error.message : "unknown" });
        return "0x0";
      }),
      rpc<string>("eth_getBalance", [wallet, "latest"], 1000),
      rpc<string>("eth_blockNumber", [], 1000)
    ]);

    const nonce = Number.parseInt(nonceHex, 16);
    const latestBlock = Number.parseInt(latestHex, 16);
    const history = await fetchWalletHistory(wallet, latestBlock);
    const analyzed = analyzeHistory(wallet, history.transactions);
    const txCount = Math.max(analyzed.txCount, nonce);

    console.log("[arc-identity] wallet analytics", {
      wallet,
      fetchedTxCount: txCount,
      nonce,
      historyRows: history.transactions.length,
      detectedCounterparties: analyzed.uniqueCounterparties,
      firstTxTimestamp: analyzed.firstSeenAt,
      source: history.source,
      rpcFailures: history.failures
    });

    return {
      walletAddress: wallet,
      txCount,
      balance: parseNativeBalance(balanceHex),
      latestBlock,
      firstSeenAt: analyzed.firstSeenAt,
      lastActivityAt: analyzed.lastActivityAt,
      activeDays: analyzed.activeDays,
      uniqueCounterparties: analyzed.uniqueCounterparties,
      recentActivityCount: analyzed.recentActivityCount,
      walletAgeDays: analyzed.walletAgeDays,
      activityFrequency: analyzed.activityFrequency,
      transferCount: analyzed.transferCount,
      contractInteractionCount: analyzed.contractInteractionCount,
      indexerSource: history.source,
      activityScore: scoreOnchainActivity(txCount, analyzed.recentActivityCount, analyzed.activeDays),
      rpcAvailable: true
    };
  } catch (error) {
    console.warn("[arc-identity] wallet analytics failure", { wallet, message: error instanceof Error ? error.message : "unknown" });
    return fallback(wallet);
  }
}

export async function getWalletAnalytics(walletAddress: string, timeoutMs = 5200) {
  try {
    return await withTimeout(getWalletAnalyticsInner(walletAddress), timeoutMs, "Arc wallet history analytics");
  } catch (error) {
    console.warn("[arc-identity] wallet analytics timeout", { walletAddress, message: error instanceof Error ? error.message : "unknown" });
    return fallback(walletAddress);
  }
}

async function getArcLiveWalletDataInner(walletAddress: string): Promise<ArcLiveWalletData> {
  const wallet = normalizeWalletAddress(walletAddress);
  console.log("[arc-identity] arc_live_balance_fetch_started", { wallet, rpcEndpoint: arcRpcUrl });
  console.log("[arc-identity] arc_live_activity_fetch_started", { wallet, rpcEndpoint: arcRpcUrl });
  const [balanceHex, latestHex, nonceHex] = await Promise.all([
    rpc<string>("eth_getBalance", [wallet, "latest"], 4500, { step: "arc_live_balance" }),
    rpc<string>("eth_blockNumber", [], 4500, { step: "arc_live_latest_block" }),
    rpc<string>("eth_getTransactionCount", [wallet, "latest"], 4500, { step: "arc_live_transaction_count" }).catch((error) => {
      console.warn("[arc-identity] arc_live_activity_fetch_failed", { wallet, step: "nonce", message: error instanceof Error ? error.message : "unknown" });
      return null;
    })
  ]);
  const live = {
    walletAddress: wallet,
    balance: parseNativeBalance(balanceHex),
    latestBlock: Number.parseInt(latestHex, 16),
    txCount: nonceHex ? Number.parseInt(nonceHex, 16) : null,
    source: "live_arc_rpc" as const,
    providerStatus: "live" as const,
    updatedAt: new Date().toISOString(),
    errorMessage: null
  };
  console.log("[arc-identity] arc_live_balance_fetch_success", { wallet, balance: live.balance, latestBlock: live.latestBlock });
  console.log("[arc-identity] arc_live_activity_fetch_success", { wallet, txCount: live.txCount, latestBlock: live.latestBlock });
  return live;
}

export async function getArcLiveWalletData(walletAddress: string, timeoutMs = 6000): Promise<ArcLiveWalletData> {
  const wallet = normalizeWalletAddress(walletAddress);
  try {
    return await withTimeout(getArcLiveWalletDataInner(wallet), timeoutMs, "Arc live wallet data");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown Arc RPC failure";
    console.warn("[arc-identity] arc_live_balance_fetch_failed", { wallet, message });
    console.warn("[arc-identity] arc_live_activity_fetch_failed", { wallet, message });
    return {
      walletAddress: wallet,
      balance: null,
      latestBlock: null,
      txCount: null,
      source: "unavailable",
      providerStatus: "unavailable",
      updatedAt: new Date().toISOString(),
      errorMessage: message
    };
  }
}

type RpcTransaction = {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  blockNumber: string | null;
};

type RpcReceipt = {
  status?: string;
  transactionHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
};

export type VerifiedTransaction = {
  txHash: string;
  from: string;
  to: string;
  blockNumber: number;
  timestamp: string;
  value: number;
  chainId: string;
  participants: string[];
};

const minimumTxValue = Number(process.env.ARC_MIN_ATTESTATION_VALUE ?? process.env.NEXT_PUBLIC_ARC_MIN_ATTESTATION_VALUE ?? 0.01);
const recentTxDays = Number(process.env.ARC_ATTESTATION_RECENT_DAYS ?? 30);
const minimumVerificationTimeoutMs = 15000;
const defaultVerificationTimeoutMs = Math.max(
  minimumVerificationTimeoutMs,
  Number(process.env.ARC_ATTESTATION_VERIFY_TIMEOUT_MS ?? 20000)
);

function normalizeHash(txHash: string) {
  const clean = txHash.trim().toLowerCase();
  if (!/^0x[a-f0-9]{64}$/.test(clean)) throw new Error("Invalid tx hash");
  return clean;
}

function normalizeChainId(value?: string) {
  if (!value) return null;
  const clean = value.trim().toLowerCase();
  return clean.startsWith("0x") ? clean : `0x${Number(clean).toString(16)}`;
}

export function scoreTransactionSize(value: number) {
  if (value < minimumTxValue) return 0;
  if (value < 1) return 0.8;
  if (value < 10) return 1;
  if (value < 100) return 1.25;
  return 1.5;
}

export async function verifyArcTransaction(input: {
  txHash: string;
  fromWallet: string;
  counterpartyWallet: string;
  timeoutMs?: number;
}): Promise<VerifiedTransaction> {
  const txHash = normalizeHash(input.txHash);
  const fromWallet = normalizeWalletAddress(input.fromWallet);
  const counterpartyWallet = normalizeWalletAddress(input.counterpartyWallet);
  const timeoutMs = Math.max(input.timeoutMs ?? defaultVerificationTimeoutMs, minimumVerificationTimeoutMs);
  const context: ArcVerificationLogContext = {
    txHash,
    fromWallet,
    counterpartyWallet,
    chain: normalizeChainId(process.env.NEXT_PUBLIC_ARC_CHAIN_ID)
  };

  try {
    return await withTimeout((async () => {
    logArcVerification(context, "start");

    const chainId = await rpc<string>("eth_chainId", [], 7000, { step: "chain_id_lookup" });
    const expectedChainId = normalizeChainId(process.env.NEXT_PUBLIC_ARC_CHAIN_ID);
    const observedChainId = normalizeChainId(chainId) ?? chainId;
    logArcVerification({ ...context, chain: observedChainId }, "chain_checked", { expectedChainId, observedChainId });
    if (expectedChainId && observedChainId !== expectedChainId) throw new Error("Wrong chain: transaction was not verified on the configured Arc network");

    const tx = await retryArcRpcStep("transaction_lookup", { ...context, chain: observedChainId }, () =>
      rpc<RpcTransaction | null>("eth_getTransactionByHash", [txHash], 8000, { step: "transaction_lookup" })
    );
    if (!tx) throw new Error("Transaction not found");

    const receipt = await retryArcRpcStep("transaction_receipt_lookup", { ...context, chain: observedChainId }, () =>
      rpc<RpcReceipt | null>("eth_getTransactionReceipt", [txHash], 8000, { step: "transaction_receipt_lookup" })
    );
    if (!receipt) throw new Error("Transaction receipt unavailable");
    if (receipt.status && receipt.status !== "0x1") throw new Error("Transaction did not succeed");
    if (!tx.blockNumber || !receipt.blockNumber) throw new Error("Transaction is not finalized yet");

    const from = normalizeWalletAddress(tx.from);
    const to = tx.to ? normalizeWalletAddress(tx.to) : "";
    const participants = [from, to].filter(Boolean);
    if (!participants.includes(fromWallet)) throw new Error("Wallet mismatch: connected wallet is not a direct participant in this Arc transaction");
    if (!participants.includes(counterpartyWallet)) throw new Error("Counterparty mismatch: selected counterparty is not a direct participant in this Arc transaction");

    const value = parseNativeBalance(tx.value);
    if (value < minimumTxValue) throw new Error(`Transaction value must be at least ${minimumTxValue} native USDC`);

    const blockNumber = Number.parseInt(tx.blockNumber, 16);
    const block = await retryArcRpcStep("block_lookup", { ...context, chain: observedChainId }, () =>
      rpc<RpcBlock>("eth_getBlockByNumber", [tx.blockNumber, false], 8000, { step: "block_lookup" })
    );
    const timestamp = blockTimestampToIso(block.timestamp);
    const ageMs = Date.now() - new Date(timestamp).getTime();
    if (ageMs > recentTxDays * 86400000) throw new Error(`Transaction must be within the last ${recentTxDays} days`);
    if (ageMs < -300000) throw new Error("Transaction timestamp is invalid");

    logArcVerification({ ...context, chain: observedChainId }, "verified", { blockNumber, value, timestamp });
    return { txHash, from, to, blockNumber, timestamp, value, chainId: observedChainId, participants };
    })(), timeoutMs, "Arc transaction verification");
  } catch (error) {
    const normalized = normalizeArcRpcFailure(error, "transaction_verification");
    logArcVerification(context, "failed", { error: normalized.message });
    throw normalized;
  }
}

