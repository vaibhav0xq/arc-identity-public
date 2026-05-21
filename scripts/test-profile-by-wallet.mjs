const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const { randomBytes } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");

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
  const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text };
}

function assert(condition, message, details) {
  if (!condition) {
    console.error(JSON.stringify({ failed: message, details }, null, 2));
    process.exit(1);
  }
}

function scoreNumber(payload) {
  return Number(payload?.arcIdentityScore ?? payload?.scoreValue ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
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

function hasScoreDetails(payload) {
  return Boolean(payload?.components ?? payload?.scoreComponents) && Boolean(payload?.explanations ?? payload?.scoreExplanations);
}

function isBaselineLikeSource(source) {
  return ["baseline", "provider_unavailable", "partial_indexed", "partial", "cached"].includes(String(source ?? ""));
}

function assertBaselineIdentity(payload, label) {
  const score = scoreNumber(payload);
  const source = payload?.dataSource ?? payload?.scoreSource ?? payload?.cacheStatus ?? null;
  assert(Number.isFinite(score) && score >= 0 && score <= 100, `${label} should include bounded score`, payload);
  assert(totalTx(payload) === 0, `${label} should accept zero tx baseline`, payload);
  assert(activeChainCount(payload) === 0, `${label} should accept zero active chains baseline`, payload);
  assert(walletAge(payload) === 0, `${label} should accept zero wallet age baseline`, payload);
  assert(isBaselineLikeSource(source) || isBaselineLikeSource(payload?.scoreSource), `${label} should mark generated wallet as baseline or provider-limited`, payload);
  assert(hasScoreDetails(payload), `${label} should include score components and explanations`, payload);
}

const suffix = randomBytes(8).toString("hex");
const wallet = randomWallet();
const mixedCaseWallet = `0x${wallet.slice(2).split("").map((char, index) => index % 2 ? char.toUpperCase() : char).join("")}`;
const username = `wallet_${suffix.slice(0, 10)}`;
const canonicalUsername = `${username}.arcid`;
const signature = `wallet-native-test-${suffix}`;

const created = await request("/api/profile/create", {
  method: "POST",
  body: JSON.stringify({ walletAddress: mixedCaseWallet, username, signature })
});
assert(created.response.ok, "create username should return ok", created.json);
assert(created.json.username === canonicalUsername, "create should return canonical username", created.json);
assert(created.json.wallet_address === wallet, "create should persist lowercase wallet", created.json);

const byWallet = await request(`/api/profile/by-wallet/${mixedCaseWallet}`);
assert(byWallet.response.ok, "profile by wallet should return ok for mixed-case input", byWallet.json);
assert(byWallet.json.username === canonicalUsername, "profile by wallet should return canonical username", byWallet.json);
assert(byWallet.json.usernameClaimed === true, "profile by wallet should mark claimed", byWallet.json);
assert(byWallet.json.profile?.walletAddress === wallet, "profile by wallet should return normalized wallet", byWallet.json);
assertBaselineIdentity(byWallet.json, "profile by wallet fresh identity");

const debug = await request(`/api/debug/onboarding/${mixedCaseWallet}`);
assert(debug.response.ok, "debug onboarding should return ok", debug.json);
assert(debug.json.normalizedWallet === wallet, "debug should expose normalized wallet", debug.json);
assert(debug.json.profileExistsByWallet === true, "debug should confirm profile exists by wallet", debug.json);
assert(debug.json.rawMatchingRowsCount >= 1, "debug should include raw matching row count", debug.json);

const resolverRoute = await request("/profile/me", { headers: { Accept: "text/html" } });
assert(resolverRoute.response.ok, "profile me route should render", { status: resolverRoute.response.status });
const resolverSource = await readFile(new URL("../app/profile/me/page.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");
assert(resolverSource.includes("useArcIdentity"), "profile me should use shared wallet identity resolver");
assert(hookSource.includes("/api/profile/by-wallet/"), "shared wallet identity resolver should load profile by wallet");
assert(resolverSource.includes("window.location.replace(identity.profileUrl)"), "profile me should redirect to canonical public profile");

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  wallet,
  mixedCaseWallet,
  username: canonicalUsername,
  profileUrl: byWallet.json.profileUrl
}, null, 2));
