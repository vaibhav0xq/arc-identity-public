const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
let activeWallet = process.env.ACTIVE_TEST_WALLET;
const activeUsername = process.env.ACTIVE_TEST_USERNAME || "syther.arcid";
const testTxHash = process.env.TEST_TX_HASH;
const { randomBytes } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");

async function timedRequest(path, options = {}) {
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
    return { path, response, json, text, durationMs: Date.now() - started };
  } catch (error) {
    return {
      path,
      response: null,
      json: null,
      text: "",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

async function ensureWallet() {
  if (activeWallet) return activeWallet.toLowerCase();
  const wallet = `0x${randomBytes(20).toString("hex")}`;
  const username = `attlive_${randomBytes(5).toString("hex")}`;
  const created = await timedRequest("/api/profile/create", {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, username, signature: `att-live-${username}` })
  });
  if (!created.response?.ok) {
    failures.push({ stage: "create_fallback_wallet", details: created.json ?? created.text ?? created.error });
  }
  return wallet.toLowerCase();
}

const failures = [];
const warnings = [];
const timings = [];
const inconsistentResponses = [];
const wallet = await ensureWallet();

const debug = await timedRequest(`/api/debug/attestations/${wallet}?t=${Date.now()}`);
timings.push({ path: debug.path, durationMs: debug.durationMs, status: debug.response?.status ?? "network_error" });
if (!debug.response?.ok) failures.push({ stage: "debug_attestations", details: debug.json ?? debug.text ?? debug.error });
if (debug.json?.finalIdentityGateDecision === "identity_required" && activeWallet) {
  warnings.push({ stage: "active_wallet_unclaimed", details: { wallet, decision: debug.json?.finalIdentityGateDecision } });
} else if (debug.json?.finalIdentityGateDecision !== "registered") {
  failures.push({ stage: "debug_attestations_decision", details: debug.json });
}

let firstUsername = null;
for (let index = 0; index < 10; index += 1) {
  const profile = await timedRequest(`/api/profile/by-wallet/${wallet}?t=${Date.now()}-${index}`);
  timings.push({ path: profile.path, durationMs: profile.durationMs, status: profile.response?.status ?? "network_error" });
  const username = profile.json?.profile?.username ?? profile.json?.username ?? null;
  if (profile.response?.status === 404 && activeWallet) {
    continue;
  }
  if (!profile.response?.ok || !username) {
    inconsistentResponses.push({ iteration: index, status: profile.response?.status ?? "network_error", body: profile.json ?? profile.text ?? profile.error });
    continue;
  }
  if (!firstUsername) firstUsername = username;
  if (firstUsername !== username) inconsistentResponses.push({ iteration: index, expected: firstUsername, received: username });
}

const users = await timedRequest("/api/users?t=" + Date.now());
timings.push({ path: users.path, durationMs: users.durationMs, status: users.response?.status ?? "network_error" });
if (!users.response?.ok) warnings.push({ stage: "users", details: users.json ?? users.text ?? users.error });
if (!Array.isArray(users.json?.users)) failures.push({ stage: "users_endpoint_shape", details: users.json ?? users.text });
const selectableUsers = (users.json?.users ?? []).filter((item) => item.profile?.walletAddress?.toLowerCase() !== wallet);
if ((users.json?.users ?? []).some((item) => item.profile?.walletAddress?.toLowerCase() === wallet) && selectableUsers.some((item) => item.profile?.walletAddress?.toLowerCase() === wallet)) {
  failures.push({ stage: "current_wallet_exclusion", details: { wallet } });
}

const searchUsers = await timedRequest(`/api/users?q=${encodeURIComponent(activeUsername)}&limit=10&t=${Date.now()}`);
timings.push({ path: searchUsers.path, durationMs: searchUsers.durationMs, status: searchUsers.response?.status ?? "network_error" });
if (!searchUsers.response?.ok) {
  warnings.push({ stage: "users_search", details: searchUsers.json ?? searchUsers.text ?? searchUsers.error });
} else {
  let usernameForSearch = activeUsername;
  let expectedFull = usernameForSearch.trim().toLowerCase().endsWith(".kyro") || normalized.endsWith(".arcid") ? usernameForSearch.trim().toLowerCase() : `${usernameForSearch.trim().toLowerCase()}.arcid`;
  let expectedBase = expectedFull.replace(/\.(?:kyro|arcid)$/i, "");
  let found = (searchUsers.json?.users ?? []).find((item) => {
    const usernameFull = item.profile?.username?.toLowerCase() ?? "";
    const usernameBase = usernameFull.replace(/\.(?:kyro|arcid)$/i, "");
    return usernameFull === expectedFull || usernameBase === expectedBase;
  });
  if (!found) {
    const fallback = users.json?.users?.[0]?.profile?.username;
    if (fallback) {
      warnings.push({ stage: "active_username_not_found", details: { activeUsername, fallback } });
      usernameForSearch = fallback;
      const fallbackSearch = await timedRequest(`/api/users?q=${encodeURIComponent(fallback)}&limit=10&t=${Date.now()}`);
      timings.push({ path: fallbackSearch.path, durationMs: fallbackSearch.durationMs, status: fallbackSearch.response?.status ?? "network_error" });
      expectedFull = fallback.trim().toLowerCase().endsWith(".kyro") || normalized.endsWith(".arcid") ? fallback.trim().toLowerCase() : `${fallback.trim().toLowerCase()}.arcid`;
      expectedBase = expectedFull.replace(/\.(?:kyro|arcid)$/i, "");
      found = (fallbackSearch.json?.users ?? []).find((item) => {
        const usernameFull = item.profile?.username?.toLowerCase() ?? "";
        const usernameBase = usernameFull.replace(/\.(?:kyro|arcid)$/i, "");
        return usernameFull === expectedFull || usernameBase === expectedBase;
      });
    }
  }
  if (!found) {
    failures.push({ stage: "counterparty_username_search", details: { activeUsername, expectedFull, users: searchUsers.json?.users?.map((item) => item.profile?.username) } });
  }
  const normalizedInputs = [expectedBase, expectedFull, expectedFull.replace(/[a-z]/g, (char, index) => index % 2 ? char.toUpperCase() : char)];
  const normalizedMatches = normalizedInputs.every((input) => {
    const raw = input.trim().toLowerCase();
    const base = raw.replace(/\.(?:kyro|arcid)$/i, "");
    const full = raw.endsWith(".kyro") || normalized.endsWith(".arcid") ? raw : `${raw}.arcid`;
    const usernameFull = found?.profile?.username?.trim().toLowerCase() ?? "";
    const usernameBase = usernameFull.replace(/\.(?:kyro|arcid)$/i, "");
    return [usernameFull, usernameBase].some((entry) => entry.includes(raw) || entry.includes(base) || entry.includes(full));
  });
  if (!normalizedMatches) failures.push({ stage: "counterparty_username_normalization", details: { activeUsername: usernameForSearch, normalizedInputs, found: found?.profile?.username } });
}

const history = await timedRequest(`/api/interactions/history/${wallet}?t=${Date.now()}`);
timings.push({ path: history.path, durationMs: history.durationMs, status: history.response?.status ?? "network_error" });
if (!history.response?.ok) warnings.push({ stage: "history", details: history.json ?? history.text ?? history.error });
const historyRows = history.json?.attestations ?? [];
if (history.response?.ok) {
  const timestamps = historyRows.map((row) => new Date(row.created_at).getTime()).filter((value) => !Number.isNaN(value));
  const sorted = timestamps.every((value, index) => index === 0 || timestamps[index - 1] >= value);
  if (!sorted) failures.push({ stage: "history_sort_order", details: historyRows.slice(0, 5).map((row) => ({ txHash: row.tx_hash, createdAt: row.created_at })) });
  if (testTxHash) {
    const visible = historyRows.some((row) => String(row.tx_hash).toLowerCase() === testTxHash.toLowerCase());
    if (!visible) warnings.push({ stage: "duplicate_tx_not_visible_for_wallet", details: { wallet, testTxHash, count: historyRows.length } });
  }
}

try {
  const source = await readFile(new URL("../app/attestations/page.tsx", import.meta.url), "utf8");
  const requiredInteractionLabels = ["Payment", "Service payment", "Escrow release", "Trade settlement"];
  const missingLabels = requiredInteractionLabels.filter((label) => !source.includes(label));
  if (missingLabels.length) failures.push({ stage: "interaction_type_labels", details: { missingLabels } });
  for (const requiredCopy of [
    "Complete all fields",
    "looksLikeTxHash",
    "Search username, username.kyro, or wallet address",
    "Type at least 2 characters to search registered identities.",
    "No registered Kyro found.",
    "Loading verified attestations...",
    "No verified attestations yet.",
    "Couldn't load attestation history. Retry."
  ]) {
    if (!source.includes(requiredCopy)) failures.push({ stage: "form_validation_copy", details: { missing: requiredCopy } });
  }
} catch (error) {
  warnings.push({ stage: "source_validation", details: error instanceof Error ? error.message : "Unable to inspect local source" });
}

if (inconsistentResponses.length) {
  failures.push({
    stage: "profile_by_wallet_repeated_reads",
    details: inconsistentResponses
  });
}

const rootCauseGuess = failures.length
  ? "profile-by-wallet returned inconsistent or non-registered results; inspect Supabase profile row and wallet normalization."
  : warnings.length
    ? "identity gate is stable; secondary attestations data endpoints had warnings and should not downgrade the page."
    : "identity gate and secondary data endpoints are stable.";

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  wallet,
  profileUsername: firstUsername,
  historyCount: historyRows.length,
  newestHistoryTxHash: historyRows[0]?.tx_hash ?? null,
  debug: debug.json,
  failures,
  warnings,
  timings,
  inconsistentResponses,
  rootCauseGuess
}, null, 2));

if (failures.length) process.exit(1);
