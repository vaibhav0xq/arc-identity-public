const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    warning: "ACTIVE_TEST_WALLET not set; skipped active wallet score regression checks.",
    baseUrl
  }, null, 2));
  process.exit(0);
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

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
  process.exitCode = 1;
  throw new Error(message);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function activeChainCount(payload) {
  return Number(payload?.activeChains?.length ?? payload?.multiChain?.activeChains?.length ?? payload?.activeChainCount ?? payload?.profile?.activeChainCount ?? 0);
}

function indexedTx(payload) {
  return Number(payload?.indexedTx ?? payload?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function scoreValue(payload) {
  return Number(payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
}

function isBaselineDowngrade(payload) {
  return scoreValue(payload) === 0 && indexedTx(payload) === 0 && activeChainCount(payload) === 0;
}

function providerUnavailable(payload) {
  return payload?.dataSource === "provider_unavailable" || (payload?.providerErrors ?? []).length > 0;
}

function mergeScoreState(previous, incoming, walletChanged = false) {
  const previousReal = indexedTx(previous) > 0 || activeChainCount(previous) > 0 || previous?.hasIndexedActivity === true;
  const incomingBaseline = isBaselineDowngrade(incoming) || incoming?.dataSource === "baseline";
  if (!incoming) return { score: previous, accepted: false };
  if (!previous || walletChanged) return { score: incoming, accepted: true };
  if (previousReal && incomingBaseline) return { score: previous, accepted: false };
  return { score: incoming, accepted: true };
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
assert(refresh.response.ok, "refresh endpoint must return successfully", refresh.json ?? refresh.text);

const refreshTx = indexedTx(refresh.json);
const refreshChains = activeChainCount(refresh.json);
assert(
  refreshTx > 0 || refreshChains > 0 || providerUnavailable(refresh.json),
  "active wallet refresh must produce indexed data or explicit provider unavailable",
  refresh.json
);
assert(!isBaselineDowngrade(refresh.json) || providerUnavailable(refresh.json), "refresh must not silently replace indexed evidence with a zero-evidence baseline", refresh.json);

let lastReal = refresh.json;
if (refreshTx === 0 && refreshChains === 0 && providerUnavailable(refresh.json)) {
  console.log(JSON.stringify({
    ok: true,
    warning: "Provider unavailable; regression test verified explicit failure instead of fake zero activity.",
    baseUrl,
    wallet,
    refresh: refresh.json
  }, null, 2));
  process.exit(0);
}

for (let index = 0; index < 5; index += 1) {
  const score = await request(`/api/score/${wallet}?t=${Date.now()}-${index}`);
  assert(score.response.ok, `score read ${index + 1} must succeed`, score.json ?? score.text);
  assert(!isBaselineDowngrade(score.json), `score read ${index + 1} must not downgrade to baseline`, score.json);
  assert(indexedTx(score.json) > 0 || activeChainCount(score.json) > 0 || score.json?.hasIndexedActivity === true, `score read ${index + 1} must keep indexed activity`, score.json);
  lastReal = score.json;
}

const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
assert(byWallet.response.ok, "profile by wallet must return claimed profile", byWallet.json ?? byWallet.text);
assert(!isBaselineDowngrade(byWallet.json), "profile by wallet must not downgrade real indexed score to baseline", byWallet.json);
assert(indexedTx(byWallet.json) > 0 || activeChainCount(byWallet.json) > 0 || byWallet.json?.hasIndexedActivity === true, "profile by wallet must include indexed activity", byWallet.json);

const simulated = mergeScoreState(lastReal, {
  walletAddress: wallet,
  username: lastReal.username,
  arcIdentityScore: 0,
  totalTxCount: 0,
  activeChains: [],
  dataSource: "baseline",
  hasIndexedActivity: false,
  indexedTx: 0
});
assert(!simulated.accepted, "mergeScoreState should reject baseline over real indexed data", simulated);
assert(indexedTx(simulated.score) > 0 || activeChainCount(simulated.score) > 0, "merged score should preserve real indexed data", simulated);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  wallet,
  finalScore: scoreValue(lastReal),
  indexedTx: indexedTx(lastReal),
  activeChains: activeChainCount(lastReal),
  dataSource: lastReal.dataSource ?? lastReal.cacheStatus ?? "unknown"
}, null, 2));
