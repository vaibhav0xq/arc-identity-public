const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || process.env.INTELLIGENCE_TEST_WALLET || "").toLowerCase();

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.error("Set ACTIVE_TEST_WALLET to a full 0x wallet address before running this active-wallet refresh test.");
  process.exit(1);
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const text = await response.text();
  const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text };
}

function assert(condition, message, details) {
  if (!condition) {
    console.error(JSON.stringify({ failed: message, details }, null, 2));
    process.exit(1);
  }
}

function providerErrors(payload) {
  return payload?.providerErrors ?? payload?.lastProviderErrors ?? [];
}

function hasExplicitProviderUnavailable(payload) {
  const errors = providerErrors(payload);
  const live = payload?.liveProviderDebug?.chains ?? [];
  return errors.length > 0 || live.some((chain) => ["error", "limited", "not_configured"].includes(chain.finalChainStatus));
}

function activeChainCount(payload) {
  return Number(payload?.activeChains?.length ?? payload?.latestMultichainSnapshot?.activeChains?.length ?? 0);
}

function totalTxCount(payload) {
  return Number(payload?.totalTxCount ?? payload?.latestMultichainSnapshot?.totalTxCount ?? 0);
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
assert(refresh.response.ok, "refresh endpoint must complete for claimed active wallet", refresh.json ?? refresh.text);

const refreshTx = totalTxCount(refresh.json);
const refreshChains = activeChainCount(refresh.json);
assert(
  refreshTx > 0 || refreshChains > 0 || hasExplicitProviderUnavailable(refresh.json),
  "refresh must update activity or return explicit provider unavailability",
  refresh.json
);

const score = await request(`/api/score/${wallet}`);
assert(score.response.ok, "score endpoint must return after refresh", score.json ?? score.text);
const scoreTx = totalTxCount(score.json);
const scoreChains = activeChainCount(score.json);
assert(
  scoreTx >= refreshTx && scoreChains >= refreshChains,
  "score endpoint should reflect the refreshed activity snapshot",
  { refresh: { refreshTx, refreshChains }, score: { scoreTx, scoreChains }, scoreResponse: score.json }
);

const debug = await request(`/api/debug/intelligence/${wallet}`);
assert(debug.response.ok, "debug intelligence endpoint must explain source", debug.json ?? debug.text);
assert(
  debug.json?.latestMultichainSnapshot || debug.json?.liveProviderDebug || debug.json?.lastProviderErrors,
  "debug intelligence must include cached, live, or provider failure details",
  debug.json
);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  wallet,
  refreshTx,
  refreshChains,
  scoreTx,
  scoreChains,
  providerErrors: providerErrors(score.json),
  dataSource: score.json?.cacheStatus ?? debug.json?.scanSource ?? "unknown"
}, null, 2));
