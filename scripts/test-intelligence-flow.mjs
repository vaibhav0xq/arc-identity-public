const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.INTELLIGENCE_TEST_WALLET || "0xbb30481982786ea53fe1856e0745eec814d83252").toLowerCase();
const expectedChains = (process.env.INTELLIGENCE_EXPECT_CHAINS || "")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

async function request(path, options = {}) {
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
  return { response, json, text };
}

function assert(condition, message, details) {
  if (!condition) {
    console.error(JSON.stringify({ failed: message, details }, null, 2));
    process.exit(1);
  }
}

function configuredProviders(debug) {
  return Object.entries(debug.envPresent ?? {}).filter(([, present]) => present).map(([name]) => name);
}

function providerFailures(debug) {
  const cached = debug.lastProviderErrors ?? [];
  const live = (debug.liveProviderDebug?.chains ?? [])
    .filter((chain) => ["error", "limited", "not_configured"].includes(chain.finalChainStatus))
    .map((chain) => ({
      chain: chain.chain,
      status: chain.finalChainStatus,
      provider: chain.finalSelectedProvider,
      error: chain.error ?? chain.primaryProviderResult?.error ?? chain.fallbackProviderResult?.error ?? null
    }));
  return { cached, live };
}

function chainDebug(debug, chainName) {
  const normalized = chainName.toLowerCase();
  return (debug.liveProviderDebug?.chains ?? []).find((chain) => chain.chain.toLowerCase() === normalized);
}

function cachedChain(debug, chainName) {
  const normalized = chainName.toLowerCase();
  return (debug.latestMultichainSnapshot?.chains ?? []).find((chain) => chain.chain.toLowerCase() === normalized);
}

function isProviderUnavailableStatus(status) {
  return ["error", "limited", "not_configured"].includes(status);
}

const before = await request(`/api/debug/intelligence/${wallet}`);
assert(before.response.ok, "debug intelligence endpoint should return ok", before.json);
const providers = configuredProviders(before.json);
assert(providers.length > 0, "at least one explorer provider API key must be configured", before.json?.envPresent);

const scoreBefore = await request(`/api/score/${wallet}`);
assert(scoreBefore.response.ok, "score endpoint should return a non-error response", scoreBefore.json);
assert(scoreBefore.json && typeof scoreBefore.json.arcIdentityScore === "number", "score endpoint should include a numeric score", scoreBefore.json);

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
if (!refresh.response.ok && refresh.response.status !== 403) {
  const failures = providerFailures(before.json);
  assert(false, "refresh endpoint should either index wallet intelligence or return explicit provider failure", {
    refresh: refresh.json,
    providerFailures: failures
  });
}
if (refresh.response.status === 403) {
  console.warn(JSON.stringify({
    warning: "refresh requires a claimed Kyro; continuing provider diagnostics without refresh",
    wallet,
    response: refresh.json
  }, null, 2));
}

const after = await request(`/api/debug/intelligence/${wallet}`);
assert(after.response.ok, "debug intelligence endpoint should return ok after refresh", after.json);
const totalTx = Number(after.json?.latestMultichainSnapshot?.totalTxCount ?? 0);
const activeChains = after.json?.activeChains ?? [];
const failures = providerFailures(after.json);
const allChainsFailedOrUnavailable = (after.json?.enabledChains ?? []).every((chain) => {
  const live = (after.json?.liveProviderDebug?.chains ?? []).find((item) => item.chain === chain.name);
  return live && ["error", "limited", "not_configured"].includes(live.finalChainStatus);
});

assert(
  totalTx > 0 || activeChains.length > 0 || !allChainsFailedOrUnavailable,
  "wallet intelligence must not silently collapse to zero when providers fail",
  { totalTx, activeChains, failures, envPresent: after.json?.envPresent }
);

for (const chainName of expectedChains) {
  const live = chainDebug(after.json, chainName);
  const cached = cachedChain(after.json, chainName);
  const liveTxCount = Number(live?.actions?.reduce((sum, action) => sum + Number(action.parsedTxCount ?? 0), 0) ?? 0);
  const cachedTxCount = Number(cached?.txCount ?? 0);
  const providerExplained = live && isProviderUnavailableStatus(live.finalChainStatus);
  assert(
    liveTxCount > 0 || cachedTxCount > 0 || providerExplained,
    `${chainName} must either index activity or explain provider unavailability`,
    { live, cached }
  );
}

const dashboard = await request("/dashboard", { headers: { Accept: "text/html" } });
assert(dashboard.response.ok, "dashboard route should render", { status: dashboard.response.status });

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  wallet,
  providers,
  totalTx,
  activeChains,
  expectedChains,
  providerFailures: failures
}, null, 2));
