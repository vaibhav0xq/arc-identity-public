const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();
const username = process.env.ACTIVE_TEST_USERNAME || "";

const failures = [];
const warnings = [];
const timings = [];

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    warning: "ACTIVE_TEST_WALLET not set; skipped canonical refresh sync checks.",
    baseUrl
  }, null, 2));
  process.exit(0);
}

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
    const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
    timings.push({ path, status: response.status, durationMs: Date.now() - started });
    return { response, json, text };
  } catch (error) {
    timings.push({ path, status: "network_error", durationMs: Date.now() - started });
    return { response: { ok: false, status: 0 }, json: null, text: "", error };
  }
}

function scoreValue(payload) {
  return Number(
    typeof payload?.score === "number"
      ? payload.score
      : payload?.scoreValue ?? payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0
  );
}

function totalTx(payload) {
  return Number(payload?.totalTxCount ?? payload?.totalTx ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function activeChainCount(payload) {
  const chains = payload?.activeChains ?? payload?.multiChain?.activeChains ?? payload?.profile?.indexedChains ?? [];
  if (Array.isArray(chains)) return chains.length;
  return Number(payload?.activeChainCount ?? payload?.profile?.activeChainCount ?? 0);
}

function walletAge(payload) {
  return Number(payload?.globalWalletAgeDays ?? payload?.multiChain?.globalWalletAgeDays ?? payload?.profile?.globalWalletAgeDays ?? 0);
}

function scoreUpdatedAt(payload) {
  return payload?.scoreUpdatedAt ?? payload?.profile?.updatedAt ?? payload?.profile?.updated_at ?? null;
}

function scoreSource(payload) {
  return payload?.scoreSource ?? payload?.dataSource ?? payload?.cacheStatus ?? null;
}

function directoryMatch(users, expectedWallet) {
  return (users ?? []).find((user) => String(user?.wallet ?? user?.walletAddress ?? user?.profile?.walletAddress ?? "").toLowerCase() === expectedWallet) ?? null;
}

function addFailure(message, details) {
  failures.push({ message, details });
}

function assertEqual(label, expected, actual, details) {
  if (Number(expected) !== Number(actual)) addFailure(`${label} mismatch`, { expected, actual, ...details });
}

function assertArcBalance(payload, label) {
  const unavailable = payload?.arcBalanceSource === "unavailable" || payload?.arcProviderStatus === "unavailable";
  const value = payload?.arcBalance ?? payload?.arcBalanceRaw ?? null;
  if (value == null && unavailable) return;
  if (value == null) addFailure(`${label} Arc balance must be present or explicitly unavailable`, payload);
  if (value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) addFailure(`${label} Arc balance must be a non-negative number`, payload);
  if (payload?.arcBalanceDecimals != null && Number(payload.arcBalanceDecimals) !== 18) warnings.push({ message: `${label} Arc balance decimals are not 18`, decimals: payload.arcBalanceDecimals });
}

async function loadAll(serverUsername, refreshPayload, refreshScore) {
  const score = await request(`/api/score/${wallet}?t=${Date.now()}`);
  if (!score.response.ok) addFailure("score API must return canonical snapshot", score.json ?? score.text ?? score.error?.message);

  const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
  if (!byWallet.response.ok) addFailure("profile-by-wallet must return canonical snapshot", byWallet.json ?? byWallet.text ?? byWallet.error?.message);

  const publicProfile = await request(`/api/profile/${encodeURIComponent(serverUsername)}?t=${Date.now()}`);
  if (!publicProfile.response.ok) addFailure("public profile API must return canonical snapshot", publicProfile.json ?? publicProfile.text ?? publicProfile.error?.message);

  const users = await request(`/api/users?q=${encodeURIComponent(serverUsername)}&limit=10&t=${Date.now()}`);
  if (!users.response.ok) addFailure("directory users endpoint must return canonical cached row", users.json ?? users.text ?? users.error?.message);
  const directory = directoryMatch(users.json?.users ?? [], wallet);
  if (!directory) addFailure("directory must include wallet for username search", users.json);

  const debug = await request(`/api/debug/score-sources/${wallet}?t=${Date.now()}`);
  if (!debug.response.ok) warnings.push({ message: "debug score sources endpoint unavailable", status: debug.response.status });

  const compared = {
    refresh: refreshScore,
    scoreApi: scoreValue(score.json),
    profileByWallet: scoreValue(byWallet.json),
    publicProfile: scoreValue(publicProfile.json),
    directory: scoreValue(directory),
    debugScoreApi: debug.response.ok ? Number(debug.json?.scoreApiScore ?? 0) : 0,
    debugDirectory: debug.response.ok ? Number(debug.json?.directoryApiScore ?? debug.json?.directoryScore ?? 0) : 0
  };
  const nonZeroScores = Object.entries(compared).filter(([, value]) => Number(value) > 0);
  for (const [source, value] of nonZeroScores) assertEqual(`${source} score`, refreshScore, value, { compared, debug: debug.json });

  const metrics = {
    refresh: { tx: totalTx(refreshPayload), chains: activeChainCount(refreshPayload), age: walletAge(refreshPayload) },
    scoreApi: { tx: totalTx(score.json), chains: activeChainCount(score.json), age: walletAge(score.json) },
    profileByWallet: { tx: totalTx(byWallet.json), chains: activeChainCount(byWallet.json), age: walletAge(byWallet.json) },
    publicProfile: { tx: totalTx(publicProfile.json), chains: activeChainCount(publicProfile.json), age: walletAge(publicProfile.json) },
    directory: { tx: totalTx(directory), chains: activeChainCount(directory), age: walletAge(directory) }
  };
  for (const [source, values] of Object.entries(metrics)) {
    assertEqual(`${source} total tx`, metrics.scoreApi.tx, values.tx, { metrics });
    assertEqual(`${source} active chains`, metrics.scoreApi.chains, values.chains, { metrics });
    assertEqual(`${source} wallet age`, metrics.scoreApi.age, values.age, { metrics });
  }
  if (metrics.scoreApi.tx > 0 || metrics.scoreApi.chains > 0) {
    if (metrics.refresh.age <= 0) addFailure("refresh response wallet age must not be zero for active indexed wallet", { metrics });
  }

  const freshness = {
    refresh: { updatedAt: scoreUpdatedAt(refreshPayload), source: scoreSource(refreshPayload) },
    scoreApi: { updatedAt: scoreUpdatedAt(score.json), source: scoreSource(score.json) },
    profileByWallet: { updatedAt: scoreUpdatedAt(byWallet.json), source: scoreSource(byWallet.json) },
    publicProfile: { updatedAt: scoreUpdatedAt(publicProfile.json), source: scoreSource(publicProfile.json) },
    directory: { updatedAt: scoreUpdatedAt(directory), source: scoreSource(directory) }
  };
  const canonicalUpdatedAt = freshness.scoreApi.updatedAt ? new Date(freshness.scoreApi.updatedAt).getTime() : 0;
  for (const [source, item] of Object.entries(freshness)) {
    if (canonicalUpdatedAt && item.updatedAt) {
      const driftMs = Math.abs(new Date(item.updatedAt).getTime() - canonicalUpdatedAt);
      if (driftMs > 10000) {
        if (source === "directory") {
          warnings.push({
            message: "directory scoreUpdatedAt drift only; visible data matches",
            freshness,
            canonical: freshness.scoreApi,
            source
          });
        } else {
          addFailure(`${source} scoreUpdatedAt drift`, { freshness, canonical: freshness.scoreApi, source });
        }
      }
    }
    if (!item.source) addFailure(`${source} score source missing`, { freshness, source });
  }

  if (debug.response.ok && debug.json?.sourceMismatch) addFailure("debug endpoint must not report source mismatches", debug.json);
  assertArcBalance(score.json, "score API");
  assertArcBalance(refreshPayload, "refresh");
  if (debug.response.ok) assertArcBalance(debug.json, "debug");

  return { score, byWallet, publicProfile, users, directory, debug, compared, metrics, freshness };
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
if (!refresh.response.ok) addFailure("refresh must return canonical latest snapshot", refresh.json ?? refresh.text ?? refresh.error?.message);
const refreshScore = scoreValue(refresh.json);
const byWalletForUsername = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
const serverUsername = byWalletForUsername.json?.profile?.username ?? byWalletForUsername.json?.username ?? username;
if (!serverUsername) addFailure("profile-by-wallet must provide username for canonical sync test", byWalletForUsername.json);
if (serverUsername && username && serverUsername.toLowerCase() !== username.toLowerCase()) warnings.push({ message: "ACTIVE_TEST_USERNAME mismatch; using server username", provided: username, serverUsername });

const first = serverUsername ? await loadAll(serverUsername, refresh.json, refreshScore) : null;

const secondRefresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
if (!secondRefresh.response.ok) addFailure("second refresh must return canonical latest snapshot", secondRefresh.json ?? secondRefresh.text ?? secondRefresh.error?.message);
const secondRefreshScore = scoreValue(secondRefresh.json);
if (refreshScore !== secondRefreshScore) {
  const beforeTx = totalTx(refresh.json);
  const afterTx = totalTx(secondRefresh.json);
  const beforeChains = activeChainCount(refresh.json);
  const afterChains = activeChainCount(secondRefresh.json);
  const explained = beforeTx !== afterTx || beforeChains !== afterChains || Boolean(secondRefresh.json?.providerErrors?.length);
  if (!explained) addFailure("second refresh score drifted without tx/chain/provider explanation", {
    firstScore: refreshScore,
    secondScore: secondRefreshScore,
    first: { tx: beforeTx, chains: beforeChains },
    second: { tx: afterTx, chains: afterChains },
    providerErrors: secondRefresh.json?.providerErrors ?? []
  });
}

const second = serverUsername ? await loadAll(serverUsername, secondRefresh.json, secondRefreshScore) : null;

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  wallet,
  username: serverUsername || username || null,
  firstScores: first?.compared ?? null,
  secondScores: second?.compared ?? null,
  firstMetrics: first?.metrics ?? null,
  secondMetrics: second?.metrics ?? null,
  firstFreshness: first?.freshness ?? null,
  secondFreshness: second?.freshness ?? null,
  timings,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
