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
    warning: "ACTIVE_TEST_WALLET not set; skipped score source consistency checks.",
    baseUrl
  }, null, 2));
  process.exit(0);
}

async function request(path, options = {}) {
  const started = Date.now();
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
}

function failIf(condition, message, details) {
  if (condition) failures.push({ message, details });
}

function scoreValue(payload) {
  return Number(
    typeof payload?.score === "number"
      ? payload.score
      : payload?.scoreValue ?? payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0
  );
}

function directoryScore(users, expectedWallet) {
  const match = (users ?? []).find((user) => String(user?.profile?.walletAddress ?? user?.walletAddress ?? "").toLowerCase() === expectedWallet);
  return {
    match,
    score: scoreValue(match)
  };
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

function assertEqual(label, expected, actual, details) {
  failIf(Number(expected) !== Number(actual), `${label} mismatch`, { expected, actual, ...details });
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
failIf(!refresh.response.ok, "refresh must return latest score snapshot", refresh.json ?? refresh.text);
const refreshScore = scoreValue(refresh.json);

const score = await request(`/api/score/${wallet}?t=${Date.now()}`);
failIf(!score.response.ok, "score GET must return latest cached score", score.json ?? score.text);
const scoreApiScore = scoreValue(score.json);

const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
failIf(!byWallet.response.ok, "profile-by-wallet must return claimed profile", byWallet.json ?? byWallet.text);
const serverUsername = byWallet.json?.profile?.username ?? byWallet.json?.username ?? username;
const byWalletScore = scoreValue(byWallet.json);

const users = await request(`/api/users?q=${encodeURIComponent(serverUsername || username)}&t=${Date.now()}`);
failIf(!users.response.ok, "directory users endpoint must return", users.json ?? users.text);
const directory = directoryScore(users.json?.users ?? [], wallet);
failIf(!directory.match, "directory must include active wallet for username search", users.json);

const debug = await request(`/api/debug/score-sources/${wallet}?t=${Date.now()}`);
if (!debug.response.ok) {
  warnings.push({ message: "score sources debug endpoint unavailable; deploy latest build to enable diagnostics.", status: debug.response.status });
} else {
  failIf(Boolean(debug.json?.sourceMismatch), "debug score sources must not report mismatches", debug.json);
}

const compared = [
  ["refresh", refreshScore],
  ["scoreApi", scoreApiScore],
  ["profileByWallet", byWalletScore],
  ["directory", directory.score],
  ["debugScoreApi", Number(debug.json?.scoreApiScore ?? 0)],
  ["debugProfileByWallet", Number(debug.json?.profileByWalletScore ?? 0)],
  ["debugPublicProfile", Number(debug.json?.publicProfileScore ?? debug.json?.profileRouteScore ?? 0)],
  ["debugProfileRoute", Number(debug.json?.profileRouteScore ?? 0)],
  ["debugDirectory", Number(debug.json?.directoryApiScore ?? debug.json?.directoryScore ?? 0)]
].filter(([, value]) => Number(value) > 0);

const uniqueScores = Array.from(new Set(compared.map(([, value]) => value)));
failIf(uniqueScores.length > 1, "all score sources must match after refresh", { compared, uniqueScores, debug: debug.json });

const metrics = {
  refresh: { tx: totalTx(refresh.json), chains: activeChainCount(refresh.json), age: walletAge(refresh.json) },
  scoreApi: { tx: totalTx(score.json), chains: activeChainCount(score.json), age: walletAge(score.json) },
  profileByWallet: { tx: totalTx(byWallet.json), chains: activeChainCount(byWallet.json), age: walletAge(byWallet.json) },
  directory: { tx: totalTx(directory.match), chains: activeChainCount(directory.match), age: walletAge(directory.match) }
};
for (const [source, values] of Object.entries(metrics)) {
  assertEqual(`${source} total tx`, metrics.scoreApi.tx, values.tx, { metrics });
  assertEqual(`${source} active chains`, metrics.scoreApi.chains, values.chains, { metrics });
  assertEqual(`${source} wallet age`, metrics.scoreApi.age, values.age, { metrics });
}

if (serverUsername && username && serverUsername.toLowerCase() !== username.toLowerCase()) {
  warnings.push({ message: "ACTIVE_TEST_USERNAME mismatch; used server username for comparisons.", provided: username, serverUsername });
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  wallet,
  username: serverUsername || username || null,
  scores: Object.fromEntries(compared),
  metrics,
  timings,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exitCode = 1;
