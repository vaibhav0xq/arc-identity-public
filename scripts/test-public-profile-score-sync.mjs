const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();
const username = process.env.ACTIVE_TEST_USERNAME || "";

const failures = [];
const warnings = [];
const timings = [];

if (!/^0x[a-f0-9]{40}$/.test(wallet) || !username) {
  console.log(JSON.stringify({
    ok: true,
    skipped: true,
    warning: "Set ACTIVE_TEST_WALLET and ACTIVE_TEST_USERNAME to run public profile score sync checks.",
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
        "Cache-Control": "no-store",
        ...(options.headers ?? {})
      }
    });
    const text = await response.text();
    const contentType = response.headers.get("content-type") ?? "";
    const json = text && contentType.includes("application/json") ? JSON.parse(text) : null;
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

function updatedAt(payload) {
  return payload?.scoreUpdatedAt ?? payload?.profile?.updatedAt ?? payload?.profile?.updated_at ?? payload?.updatedAt ?? null;
}

function fail(message, details) {
  failures.push({ message, details });
}

function assertEqual(field, expected, actual, details) {
  if (Number(expected) !== Number(actual)) fail(`${field} mismatch`, { expected, actual, ...details });
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
if (!refresh.response.ok) fail("refresh must return latest canonical score", refresh.json ?? refresh.text ?? refresh.error?.message);
const refreshScore = scoreValue(refresh.json);

const scoreApi = await request(`/api/score/${wallet}?t=${Date.now()}`);
if (!scoreApi.response.ok) fail("score API must return latest canonical score", scoreApi.json ?? scoreApi.text ?? scoreApi.error?.message);

const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
if (!byWallet.response.ok) fail("profile-by-wallet must return profile", byWallet.json ?? byWallet.text ?? byWallet.error?.message);
const serverUsername = byWallet.json?.profile?.username ?? byWallet.json?.username ?? username;
if (serverUsername.toLowerCase() !== username.toLowerCase()) warnings.push({ message: "ACTIVE_TEST_USERNAME mismatch; using server username", provided: username, serverUsername });

const profileApi = await request(`/api/profile/${encodeURIComponent(serverUsername)}?t=${Date.now()}`);
if (!profileApi.response.ok) fail("public profile API must return latest canonical score", profileApi.json ?? profileApi.text ?? profileApi.error?.message);

const profileHtml = await request(`/profile/${encodeURIComponent(serverUsername)}?t=${Date.now()}`, {
  headers: { Accept: "text/html" }
});
if (!profileHtml.response.ok) fail("public profile HTML route must render", profileHtml.text?.slice(0, 300) ?? profileHtml.error?.message);
const htmlAriaScore = profileHtml.text?.match(/aria-label="ARC Score (\d+)"/)?.[1] ?? null;
if (htmlAriaScore && Number(htmlAriaScore) !== refreshScore) fail("public profile HTML score aria-label must match refresh score", { expected: refreshScore, actual: Number(htmlAriaScore) });
if (!htmlAriaScore) warnings.push({ message: "Could not parse public profile HTML score aria-label; API score checks remain authoritative." });

const debug = await request(`/api/debug/score-sources/${wallet}?t=${Date.now()}`);
if (!debug.response.ok) warnings.push({ message: "debug score sources endpoint unavailable", status: debug.response.status });

const comparedScores = {
  refresh: refreshScore,
  scoreApi: scoreValue(scoreApi.json),
  profileByWallet: scoreValue(byWallet.json),
  profileApi: scoreValue(profileApi.json),
  publicProfileDebug: Number(debug.json?.publicProfileScore ?? debug.json?.profileRouteScore ?? 0),
  scoreDebug: Number(debug.json?.scoreApiScore ?? 0)
};

for (const [source, value] of Object.entries(comparedScores).filter(([, value]) => Number(value) > 0)) {
  assertEqual(`${source} score`, refreshScore, value, { comparedScores, debug: debug.json });
}

const scoreMetrics = {
  totalTx: totalTx(scoreApi.json),
  activeChains: activeChainCount(scoreApi.json),
  globalWalletAgeDays: walletAge(scoreApi.json)
};
const profileMetrics = {
  totalTx: totalTx(profileApi.json),
  activeChains: activeChainCount(profileApi.json),
  globalWalletAgeDays: walletAge(profileApi.json)
};
assertEqual("profile totalTx", scoreMetrics.totalTx, profileMetrics.totalTx, { scoreMetrics, profileMetrics });
assertEqual("profile activeChains", scoreMetrics.activeChains, profileMetrics.activeChains, { scoreMetrics, profileMetrics });
assertEqual("profile globalWalletAgeDays", scoreMetrics.globalWalletAgeDays, profileMetrics.globalWalletAgeDays, { scoreMetrics, profileMetrics });

const scoreUpdatedAt = updatedAt(scoreApi.json);
const profileUpdatedAt = updatedAt(profileApi.json);
if (scoreUpdatedAt && profileUpdatedAt && new Date(profileUpdatedAt).getTime() < new Date(scoreUpdatedAt).getTime() - 5000) {
  fail("profile scoreUpdatedAt is older than score API updatedAt", { scoreUpdatedAt, profileUpdatedAt });
}
if (debug.response.ok && debug.json?.sourceMismatch) fail("debug endpoint reports score source mismatch", debug.json);

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  wallet,
  username: serverUsername,
  comparedScores,
  scoreMetrics,
  profileMetrics,
  scoreUpdatedAt,
  profileUpdatedAt,
  htmlAriaScore,
  timings,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
