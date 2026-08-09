const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const wallet = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();
const username = process.env.ACTIVE_TEST_USERNAME || "";

if (!/^0x[a-f0-9]{40}$/.test(wallet)) {
  console.error(JSON.stringify({ ok: false, failures: ["ACTIVE_TEST_WALLET must be a full 0x wallet address."] }, null, 2));
  process.exit(1);
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
  const contentType = response.headers.get("content-type") ?? "";
  const json = text && contentType.includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text, durationMs: Date.now() - started };
}

function activeChainCount(payload) {
  return Number(payload?.activeChains?.length ?? payload?.multiChain?.activeChains?.length ?? payload?.profile?.activeChainCount ?? payload?.latestMultichainSnapshot?.activeChains?.length ?? 0);
}

function totalTx(payload) {
  return Number(payload?.indexedTx ?? payload?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? payload?.latestMultichainSnapshot?.totalTxCount ?? 0);
}

function globalAge(payload) {
  return Number(payload?.globalWalletAgeDays ?? payload?.multiChain?.globalWalletAgeDays ?? payload?.profile?.globalWalletAgeDays ?? payload?.latestMultichainSnapshot?.globalWalletAgeDays ?? 0);
}

function chains(payload) {
  return payload?.indexedChains ?? payload?.multiChain?.chains ?? payload?.latestMultichainSnapshot?.chains ?? [];
}

function scoreValue(payload) {
  return Number(payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
}

function failIf(condition, failures, message, details) {
  if (condition) failures.push({ message, details });
}

const failures = [];
const warnings = [];
const timings = [];

const byWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
timings.push({ path: "/api/profile/by-wallet", status: byWallet.response.status, durationMs: byWallet.durationMs });
failIf(!byWallet.response.ok, failures, "profile-by-wallet must return claimed profile", byWallet.json ?? byWallet.text);
const canonicalUsername = byWallet.json?.profile?.username ?? byWallet.json?.username ?? username;
failIf(!canonicalUsername, failures, "claimed profile must include canonical username", byWallet.json);

if (canonicalUsername) {
  const debugProfile = await request(`/api/debug/profile-route/${encodeURIComponent(canonicalUsername)}?wallet=${wallet}&t=${Date.now()}`);
  timings.push({ path: "/api/debug/profile-route", status: debugProfile.response.status, durationMs: debugProfile.durationMs });
  failIf(!debugProfile.response.ok, failures, "profile route debug must return", debugProfile.json ?? debugProfile.text);
  failIf(debugProfile.json?.finalDecision === "profile_not_found", failures, "profile route debug must resolve canonical username", debugProfile.json);

  const publicProfile = await request(`/profile/${encodeURIComponent(canonicalUsername)}`, { headers: { Accept: "text/html" } });
  timings.push({ path: "/profile/:username", status: publicProfile.response.status, durationMs: publicProfile.durationMs });
  failIf(!publicProfile.response.ok, failures, "public profile route must return 200", publicProfile.text.slice(0, 400));
  failIf(publicProfile.text.includes("No Kyro found"), failures, "public profile route must not render not-found for claimed identity", publicProfile.text.slice(0, 600));
}

const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
timings.push({ path: "/api/score/:wallet/refresh", status: refresh.response.status, durationMs: refresh.durationMs });
failIf(!refresh.response.ok, failures, "refresh intelligence must complete or return explicit provider state", refresh.json ?? refresh.text);

const score = await request(`/api/score/${wallet}?t=${Date.now()}`);
timings.push({ path: "/api/score/:wallet", status: score.response.status, durationMs: score.durationMs });
failIf(!score.response.ok, failures, "score endpoint must return", score.json ?? score.text);

const debugIntel = await request(`/api/debug/intelligence/${wallet}?t=${Date.now()}`);
timings.push({ path: "/api/debug/intelligence", status: debugIntel.response.status, durationMs: debugIntel.durationMs });
failIf(!debugIntel.response.ok, failures, "debug intelligence must return", debugIntel.json ?? debugIntel.text);

const chainRows = chains(score.json).length ? chains(score.json) : chains(debugIntel.json);
const chainTxSum = chainRows.reduce((sum, chain) => sum + Number(chain.txCount ?? 0), 0);
const chainAgeMax = chainRows.reduce((max, chain) => Math.max(max, Number(chain.walletAgeDays ?? 0)), 0);
const indexedChainCount = chainRows.filter((chain) => chain.status === "indexed" && Number(chain.txCount ?? 0) > 0).length;
failIf(chainAgeMax > 0 && globalAge(score.json) <= 0, failures, "global wallet age must reflect indexed chain ages", { chainAgeMax, score: score.json });
failIf(chainTxSum > 0 && totalTx(score.json) <= 0, failures, "total tx must reflect indexed chain tx sum", { chainTxSum, score: score.json });
failIf(indexedChainCount > 0 && activeChainCount(score.json) <= 0, failures, "active chains must reflect indexed chain rows", { indexedChainCount, score: score.json });

for (let index = 0; index < 3; index += 1) {
  const repeated = await request(`/api/score/${wallet}?t=${Date.now()}-${index}`);
  timings.push({ path: `/api/score repeat ${index + 1}`, status: repeated.response.status, durationMs: repeated.durationMs });
  failIf(!repeated.response.ok, failures, `score repeat ${index + 1} must return`, repeated.json ?? repeated.text);
  failIf(chainTxSum > 0 && scoreValue(repeated.json) === 0 && totalTx(repeated.json) === 0 && activeChainCount(repeated.json) === 0, failures, `score repeat ${index + 1} must not regress to a zero-evidence baseline`, repeated.json);
}

const fs = await import("node:fs/promises");
const profileNavSource = await fs.readFile(new URL("../components/ProfileNavButton.tsx", import.meta.url), "utf8");
const identityHookSource = await fs.readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");
failIf(!profileNavSource.includes("useArcIdentity"), failures, "header profile button must consume shared identity state", null);
failIf(!identityHookSource.includes("/api/profile/by-wallet/"), failures, "shared identity state must use profile-by-wallet as source of truth", null);
failIf(identityHookSource.includes("/api/profile/ensure"), failures, "shared identity state must not use ensure-only state", null);

if (refresh.json?.providerErrors?.length) warnings.push({ message: "provider errors present during refresh", providerErrors: refresh.json.providerErrors });

console.log(JSON.stringify({
  ok: failures.length === 0,
  baseUrl,
  wallet,
  username: canonicalUsername,
  score: scoreValue(score.json),
  totalTx: totalTx(score.json),
  activeChains: activeChainCount(score.json),
  globalWalletAgeDays: globalAge(score.json),
  chainTxSum,
  chainAgeMax,
  indexedChainCount,
  timings,
  warnings,
  failures
}, null, 2));

if (failures.length) process.exit(1);
