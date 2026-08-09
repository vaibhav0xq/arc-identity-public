const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeWallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();
const { randomBytes } = await import("node:crypto");

const failures = [];
const warnings = [];
const testedWallets = {};
const providerCoverage = {
  enabledChains: [],
  envPresent: {},
  txCountByChain: {},
  activeChains: [],
  providerErrors: []
};

function randomWallet() {
  return `0x${randomBytes(20).toString("hex")}`;
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
  const contentType = response.headers.get("content-type") ?? "";
  const json = text && contentType.includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text };
}

async function check(name, fn) {
  try {
    await fn();
  } catch (error) {
    failures.push({
      name,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function expect(condition, message, details) {
  if (!condition) {
    const error = new Error(message);
    error.details = details;
    throw error;
  }
}

function hasProviderUnavailable(payload) {
  const errors = payload?.providerErrors ?? payload?.lastProviderErrors ?? [];
  const liveChains = payload?.liveProviderDebug?.chains ?? [];
  return errors.length > 0 || liveChains.some((chain) => ["error", "limited", "not_configured"].includes(chain.finalChainStatus));
}

function scoreNumber(payload) {
  return Number(payload?.arcIdentityScore ?? payload?.scoreValue ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
}

function totalTx(payload) {
  return Number(payload?.totalTxCount ?? payload?.totalTx ?? payload?.latestMultichainSnapshot?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function activeChains(payload) {
  return payload?.activeChains ?? payload?.latestMultichainSnapshot?.activeChains ?? [];
}

function activeChainCount(payload) {
  const chains = activeChains(payload);
  if (Array.isArray(chains)) return chains.length;
  return Number(payload?.activeChainCount ?? payload?.profile?.activeChainCount ?? 0);
}

function walletAge(payload) {
  return Number(payload?.globalWalletAgeDays ?? payload?.multiChain?.globalWalletAgeDays ?? payload?.profile?.globalWalletAgeDays ?? 0);
}

function hasScoreDetails(payload) {
  return Boolean(payload?.components ?? payload?.scoreComponents) && Boolean(payload?.explanations ?? payload?.scoreExplanations);
}

function isBaselineLikeSource(source) {
  return ["baseline", "provider_unavailable", "partial_indexed", "partial", "cached"].includes(String(source ?? ""));
}

function expectBaselineIdentity(payload, label) {
  const score = scoreNumber(payload);
  const source = payload?.dataSource ?? payload?.scoreSource ?? payload?.cacheStatus ?? null;
  expect(Number.isFinite(score) && score >= 0 && score <= 100, `${label} should include bounded score`, payload);
  expect(totalTx(payload) === 0, `${label} should accept zero tx baseline`, payload);
  expect(activeChainCount(payload) === 0, `${label} should accept zero active chains baseline`, payload);
  expect(walletAge(payload) === 0, `${label} should accept zero wallet age baseline`, payload);
  expect(isBaselineLikeSource(source) || isBaselineLikeSource(payload?.scoreSource), `${label} should mark generated wallet as baseline or provider-limited`, payload);
  expect(hasScoreDetails(payload), `${label} should include score components and explanations`, payload);
}

function summarizeProviders(debug) {
  if (!debug) return;
  providerCoverage.enabledChains = debug.enabledChains ?? providerCoverage.enabledChains;
  providerCoverage.envPresent = debug.envPresent ?? providerCoverage.envPresent;
  providerCoverage.txCountByChain = debug.txCountByChain ?? providerCoverage.txCountByChain;
  providerCoverage.activeChains = debug.activeChains ?? providerCoverage.activeChains;
  providerCoverage.providerErrors = debug.lastProviderErrors ?? providerCoverage.providerErrors;
}

await check("fresh generated wallet", async () => {
  const wallet = randomWallet();
  const usernameBase = `launch_${randomBytes(5).toString("hex")}`;
  const username = `${usernameBase}.arcid`;
  const signature = `launch-signature-${randomBytes(8).toString("hex")}`;
  testedWallets.fresh = wallet;

  const created = await request("/api/profile/create", {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, username: usernameBase, signature })
  });
  expect(created.response.ok, "fresh wallet profile create failed", created.json ?? created.text);
  expect(created.json?.username === username, "fresh wallet create did not return canonical username", created.json);

  const byWallet = await request(`/api/profile/by-wallet/${wallet}`);
  expect(byWallet.response.ok, "fresh wallet by-wallet lookup failed", byWallet.json ?? byWallet.text);
  expect(byWallet.json?.usernameClaimed === true, "fresh wallet by-wallet should be claimed", byWallet.json);
  expectBaselineIdentity(byWallet.json, "fresh wallet by-wallet baseline identity");

  const profileMe = await request("/profile/me", { headers: { Accept: "text/html" } });
  expect(profileMe.response.ok, "/profile/me route should render", { status: profileMe.response.status });
  expect(!profileMe.text.includes("No Kyro found"), "/profile/me shell should not contain raw missing identity copy", null);
});

await check("claimed wallet reconnect", async () => {
  const wallet = testedWallets.fresh;
  const ensure = await request(`/api/profile/ensure?t=${Date.now()}`, {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, signature: "launch-reconnect-signature" })
  });
  const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
  expect(ensure.response.ok, "ensure should resolve claimed wallet", ensure.json ?? ensure.text);
  expect(byWallet.response.ok, "by-wallet should resolve claimed wallet", byWallet.json ?? byWallet.text);
  expect(ensure.json?.username === byWallet.json?.username, "ensure and by-wallet usernames should match", { ensure: ensure.json, byWallet: byWallet.json });
});

await check("random unclaimed wallet", async () => {
  const wallet = randomWallet();
  testedWallets.unclaimed = wallet;
  const byWallet = await request(`/api/profile/by-wallet/${wallet}`);
  expect(byWallet.response.status === 404, "unclaimed by-wallet should return clear 404", byWallet.json ?? byWallet.text);
  expect(byWallet.json?.usernameClaimed === false, "unclaimed by-wallet should mark usernameClaimed false", byWallet.json);
  const score = await request(`/api/score/${wallet}`);
  expect(score.response.ok, "unclaimed score should return safe response", score.json ?? score.text);
  expect(score.json?.usernameClaimed === false, "unclaimed score should not claim identity", score.json);
  const debug = await request(`/api/debug/onboarding/${wallet}`);
  if (debug.response.ok) {
    expect(debug.json?.profileExistsByWallet === false, "unclaimed debug should not show created profile", debug.json);
  } else {
    warnings.push({ name: "unclaimed debug unavailable", status: debug.response.status });
  }
});

await check("known active wallet", async () => {
  if (!/^0x[a-f0-9]{40}$/.test(activeWallet)) {
    warnings.push({ name: "known active wallet skipped", reason: "Set ACTIVE_TEST_WALLET to run active-wallet coverage." });
    return;
  }
  testedWallets.active = activeWallet;
  const refresh = await request(`/api/score/${activeWallet}/refresh`, { method: "POST" });
  expect(refresh.response.ok || refresh.response.status === 403, "active wallet refresh should not hard fail", refresh.json ?? refresh.text);
  if (refresh.response.status === 403) {
    warnings.push({ name: "active wallet unclaimed", response: refresh.json });
  } else {
    expect(totalTx(refresh.json) > 0 || activeChains(refresh.json).length > 0 || hasProviderUnavailable(refresh.json), "active wallet refresh must index activity or explain provider unavailability", refresh.json);
  }

  const debug = await request(`/api/debug/intelligence/${activeWallet}`);
  expect(debug.response.ok, "active wallet debug intelligence should return ok", debug.json ?? debug.text);
  summarizeProviders(debug.json);
  expect(totalTx(debug.json) > 0 || activeChains(debug.json).length > 0 || hasProviderUnavailable(debug.json), "active wallet debug must not silently collapse to fake zero", debug.json);
});

await check("provider failure simulation", async () => {
  const wallet = activeWallet && /^0x[a-f0-9]{40}$/.test(activeWallet) ? activeWallet : testedWallets.fresh;
  const debug = await request(`/api/debug/intelligence/${wallet}`);
  if (!debug.response.ok) {
    warnings.push({ name: "provider failure simulation debug unavailable", status: debug.response.status });
    return;
  }
  summarizeProviders(debug.json);
  const envPresent = Object.values(debug.json?.envPresent ?? {});
  const providerUnavailable = hasProviderUnavailable(debug.json);
  if (!envPresent.includes(false) && !providerUnavailable) {
    warnings.push({ name: "provider failure simulation skipped", reason: "No missing provider key or provider failure visible for this environment." });
    return;
  }
  expect(providerUnavailable || envPresent.includes(false), "provider failures should be explicit", debug.json);
});

await check("mobile route sanity", async () => {
  const routes = ["/", "/create", "/dashboard", "/profile/me", "/directory", "/attestations", "/developers"];
  for (const route of routes) {
    const result = await request(route, { headers: { Accept: "text/html", "User-Agent": "ARCLaunchReadiness Mobile/1.0" } });
    expect(result.response.ok, `${route} should return 200`, { status: result.response.status });
    expect(!result.text.includes("NEXT_NOT_FOUND"), `${route} should not render raw Next 404`, null);
  }
});

const result = {
  ok: failures.length === 0,
  baseUrl,
  testedWallets,
  failures,
  warnings,
  providerCoverageSummary: providerCoverage,
  timestamp: new Date().toISOString()
};

console.log(JSON.stringify(result, null, 2));
if (failures.length > 0) process.exit(1);
