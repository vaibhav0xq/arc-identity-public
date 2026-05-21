const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeWallet = process.env.ACTIVE_TEST_WALLET?.trim().toLowerCase() || "";
const txHash = process.env.TEST_TX_HASH || "0x1d9e63a6aac6820a261c3c3da4c101de6c508118fdbc4b7939169969ccc54215";
const failures = [];
const warnings = [];

async function request(path, options = {}) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const json = text && contentType.includes("application/json") ? JSON.parse(text) : null;
    return { response, json, text, durationMs: Date.now() - started };
  } catch (error) {
    return {
      response: null,
      json: null,
      text: "",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown request failure"
    };
  }
}

function fail(message, details) {
  failures.push({ message, details });
}

const debug = await request(`/api/debug/attestation/${encodeURIComponent(txHash)}?t=${Date.now()}`);
if (!debug.response?.ok) {
  warnings.push({
    stage: "debug_attestation_unavailable",
    status: debug.response?.status ?? "network_error",
    details: debug.json ?? debug.text?.slice(0, 180) ?? debug.error
  });
}

let record = debug.json?.record ?? null;
let [fromWallet, toWallet] = debug.json?.walletsInvolved ?? [];
let historyRows = [];

if ((!record || !fromWallet || !toWallet) && activeWallet) {
  const activeHistory = await request(`/api/interactions/history/${activeWallet}?t=${Date.now()}`);
  if (!activeHistory.response?.ok) {
    fail("History should load for ACTIVE_TEST_WALLET when debug endpoint is unavailable", activeHistory.json ?? activeHistory.text ?? activeHistory.error);
  } else {
    historyRows = activeHistory.json?.attestations ?? [];
    record = historyRows.find((row) => String(row.tx_hash).toLowerCase() === txHash.toLowerCase()) ?? null;
    if (record) {
      fromWallet = String(record.from_wallet).toLowerCase();
      toWallet = String(record.to_wallet).toLowerCase();
      warnings.push({ stage: "debug_fallback_used", source: "history", wallet: activeWallet });
    }
  }
}

if (!record) fail("TEST_TX_HASH should already exist for duplicate lifecycle test", { txHash, debug: debug.json, activeWallet });
if (!fromWallet || !toWallet) fail("Lifecycle test needs both attestation wallets", { txHash, record, debug: debug.json });

const duplicate = await request("/api/attestations/request", {
  method: "POST",
  body: JSON.stringify({ fromWallet, toWallet, txHash, interactionType: record?.type ?? "payment" })
});
if (duplicate.durationMs > 30000) fail("Duplicate submit should not hang", { durationMs: duplicate.durationMs });
if (duplicate.response?.status !== 409) fail("Duplicate submit should return 409", { status: duplicate.response?.status ?? "network_error", body: duplicate.json ?? duplicate.text ?? duplicate.error });
if (duplicate.json?.status !== "duplicate") fail("Duplicate submit should return status duplicate", duplicate.json);
if (!duplicate.json?.attestation?.txHash) fail("Duplicate response should include existing attestation record", duplicate.json);

const history = await request(`/api/interactions/history/${fromWallet}?t=${Date.now()}`);
if (!history.response?.ok) fail("History should load for attestation sender", history.json ?? history.text ?? history.error);
const rows = history.response?.ok ? (history.json?.attestations ?? []) : historyRows;
const visible = rows.some((row) => String(row.tx_hash).toLowerCase() === txHash.toLowerCase());
if (!visible) fail("History should include duplicate transaction record", { txHash, count: rows.length, newest: rows[0]?.tx_hash ?? null });
const timestamps = rows.map((row) => new Date(row.created_at).getTime()).filter((value) => !Number.isNaN(value));
const sorted = timestamps.every((value, index) => index === 0 || timestamps[index - 1] >= value);
if (!sorted) fail("History should be sorted newest first", rows.slice(0, 5).map((row) => ({ txHash: row.tx_hash, createdAt: row.created_at })));

const output = {
  ok: failures.length === 0,
  baseUrl,
  txHash,
  duplicateStatus: duplicate.json?.status ?? null,
  duplicateDurationMs: duplicate.durationMs,
  historyCount: rows.length,
  newestHistoryTxHash: rows[0]?.tx_hash ?? null,
  warnings,
  failures
};

console.log(JSON.stringify(output, null, 2));
if (failures.length) process.exitCode = 1;
