const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.error("Set ACTIVE_TEST_WALLET to a full 0x wallet address before running API performance tests.");
  process.exit(1);
}

async function timedRequest(path, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    }
  });
  const durationMs = Date.now() - startedAt;
  const text = await response.text();
  const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text, durationMs };
}

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
  process.exit(1);
}

function assert(condition, message, details) {
  if (!condition) fail(message, details);
}

function indexedTx(payload) {
  return Number(payload?.indexedTx ?? payload?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.latestMultichainSnapshot?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function activeChains(payload) {
  return Number(payload?.activeChains?.length ?? payload?.multiChain?.activeChains?.length ?? payload?.latestMultichainSnapshot?.activeChains?.length ?? payload?.profile?.activeChainCount ?? 0);
}

function providerUnavailable(payload) {
  const errors = payload?.providerErrors ?? payload?.lastProviderErrors ?? [];
  const diagnostics = payload?.chainResults ?? [];
  return errors.length > 0 || diagnostics.some((chain) => ["provider_unavailable", "limited", "timeout", "not_configured"].includes(chain.status));
}

const profile = await timedRequest(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
assert(profile.response.ok, "profile by wallet must return 200", { status: profile.response.status, body: profile.json ?? profile.text });
assert(profile.durationMs < 3000, "profile by wallet should respond under 3s", { durationMs: profile.durationMs });

const score = await timedRequest(`/api/score/${wallet}?t=${Date.now()}`);
assert(score.response.ok, "score GET must return 200", { status: score.response.status, body: score.json ?? score.text });
assert(score.durationMs < 3000, "score GET should respond under 3s", { durationMs: score.durationMs });

const refresh = await timedRequest(`/api/score/${wallet}/refresh`, { method: "POST" });
assert(refresh.response.ok, "manual refresh must return 200", { status: refresh.response.status, body: refresh.json ?? refresh.text });
assert(refresh.durationMs < 45000, "manual refresh should finish under 45s", { durationMs: refresh.durationMs });
assert(
  indexedTx(refresh.json) > 0 || activeChains(refresh.json) > 0 || providerUnavailable(refresh.json),
  "manual refresh must return indexed data or explicit provider warning",
  refresh.json
);

const providers = await timedRequest(`/api/debug/providers/${wallet}?t=${Date.now()}`);
assert(providers.response.ok, "provider diagnostics must return 200", { status: providers.response.status, body: providers.json ?? providers.text });
assert(providers.durationMs < 45000, "provider diagnostics should finish under 45s", { durationMs: providers.durationMs });

const afterScore = await timedRequest(`/api/score/${wallet}?t=${Date.now()}-after`);
assert(afterScore.response.ok, "score GET after refresh must return 200", { status: afterScore.response.status, body: afterScore.json ?? afterScore.text });
assert(indexedTx(afterScore.json) > 0 || activeChains(afterScore.json) > 0 || providerUnavailable(afterScore.json), "score after refresh must not silently fall back to fake zero", afterScore.json);

const failures = (providers.json?.chainResults ?? []).filter((chain) => ["provider_unavailable", "timeout"].includes(chain.status));
const warnings = [
  ...((providers.json?.chainResults ?? []).filter((chain) => ["limited", "not_configured"].includes(chain.status)).map((chain) => `${chain.chain}: ${chain.status}`)),
  ...(failures.map((chain) => `${chain.chain}: ${chain.error ?? chain.status}`))
];

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  wallet,
  timings: {
    profileByWalletMs: profile.durationMs,
    scoreGetMs: score.durationMs,
    refreshMs: refresh.durationMs,
    providersMs: providers.durationMs,
    scoreAfterRefreshMs: afterScore.durationMs
  },
  indexedTx: indexedTx(afterScore.json),
  activeChains: activeChains(afterScore.json),
  providerStatuses: Object.fromEntries((providers.json?.chainResults ?? []).map((chain) => [chain.chain, chain.status])),
  warnings,
  failures: []
}, null, 2));
