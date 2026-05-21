const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const activeUsername = process.env.ACTIVE_TEST_USERNAME || "syther.arcid";
const { randomBytes } = await import("node:crypto");
const fs = await import("node:fs");
const path = await import("node:path");
const { createClient } = await import("@supabase/supabase-js");

function randomWallet() {
  return `0x${randomBytes(20).toString("hex")}`;
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
  return { response, json, text, durationMs: Date.now() - started };
}

function fail(message, details) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

function scoreValue(payload) {
  return Number(payload?.scoreValue ?? payload?.arcIdentityScore ?? payload?.score?.arcScore ?? payload?.profile?.arcScore ?? 0);
}

function totalTx(payload) {
  return Number(payload?.totalTx ?? payload?.totalTxCount ?? payload?.multiChain?.totalTxCount ?? payload?.profile?.txCount ?? 0);
}

function activeChainCount(payload) {
  const chains = payload?.activeChains ?? payload?.multiChain?.activeChains ?? payload?.profile?.indexedChains ?? [];
  if (Array.isArray(chains)) return chains.length;
  return Number(payload?.activeChainCount ?? payload?.profile?.activeChainCount ?? 0);
}

function walletAge(payload) {
  return Number(payload?.globalWalletAgeDays ?? payload?.multiChain?.globalWalletAgeDays ?? payload?.profile?.globalWalletAgeDays ?? 0);
}

const hiddenDirectoryPrefixes = ["test_", "wallet_", "launch_", "attest_", "directory_", "qauser_"];
function usernameFromDirectoryItem(item) {
  return String(item?.profile?.username ?? item?.username ?? "").trim().toLowerCase();
}

const envPath = path.join(process.cwd(), ".env.local");
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
const localEnv = Object.fromEntries(envText
  .split(/\r?\n/)
  .filter((line) => line && !line.trim().startsWith("#") && line.includes("="))
  .map((line) => {
    const index = line.indexOf("=");
    return [line.slice(0, index), line.slice(index + 1).replace(/^['"]|['"]$/g, "")];
  }));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && serviceRoleKey ? createClient(supabaseUrl, serviceRoleKey) : null;

function normalizeWallet(wallet) {
  return String(wallet ?? "").trim().toLowerCase();
}

function isMissingOptionalTableError(error) {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  return message.includes("could not find the table")
    || message.includes("schema cache")
    || message.includes("relation does not exist")
    || message.includes("does not exist")
    || message.includes("pgrst205");
}

async function optionalDeleteByWallet(table, column, wallet, select = "id") {
  if (!supabase || !wallet) return { table, deleted: 0, skipped: !supabase };
  const { data, error } = await supabase.from(table).delete().eq(column, wallet).select(select);
  if (error) {
    if (isMissingOptionalTableError(error)) return { table, deleted: 0, skipped: true, warning: error.message };
    return { table, deleted: 0, skipped: true, warning: error.message };
  }
  return { table, deleted: data?.length ?? 0 };
}

async function optionalDeleteWalletPair(table, firstColumn, secondColumn, wallet, select = "id") {
  if (!supabase || !wallet) return { table, deleted: 0, skipped: !supabase };
  const { data, error } = await supabase
    .from(table)
    .delete()
    .or(`${firstColumn}.eq.${wallet},${secondColumn}.eq.${wallet}`)
    .select(select);
  if (error) {
    if (isMissingOptionalTableError(error)) return { table, deleted: 0, skipped: true, warning: error.message };
    return { table, deleted: 0, skipped: true, warning: error.message };
  }
  return { table, deleted: data?.length ?? 0 };
}

async function cleanupCreatedBaselineIdentity(createdIdentity, warnings) {
  if (!createdIdentity?.wallet || !createdIdentity?.username) return null;
  if (!supabase) {
    throw new Error(`Could not clean up directory readiness identity ${createdIdentity.username}: missing Supabase service credentials.`);
  }

  const wallet = normalizeWallet(createdIdentity.wallet);
  const username = createdIdentity.username.toLowerCase();
  const deleted = [];
  deleted.push(await optionalDeleteWalletPair("attestations", "from_wallet", "to_wallet", wallet));
  deleted.push(await optionalDeleteWalletPair("trust_connections", "wallet_a", "wallet_b", wallet));
  deleted.push(await optionalDeleteByWallet("reputation_events", "wallet_address", wallet));
  deleted.push(await optionalDeleteByWallet("wallet_refresh_jobs", "wallet_address", wallet));
  deleted.push(await optionalDeleteByWallet("wallet_chain_snapshots", "wallet_address", wallet));
  deleted.push(await optionalDeleteByWallet("wallet_global_profiles", "wallet_address", wallet, "wallet_address"));
  deleted.push(await optionalDeleteByWallet("wallet_activity_snapshots", "wallet_address", wallet));
  let data = null;
  let error = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await supabase
      .from("profiles")
      .delete()
      .eq("wallet_address", wallet)
      .eq("username", username)
      .select("id,username,wallet_address");
    data = result.data;
    error = result.error;
    if (!error) break;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }
  if (error) throw new Error(`profiles cleanup failed: ${error.message}`);
  return {
    username,
    wallet,
    deletedProfileCount: data?.length ?? 0,
    deleted
  };
}

async function main() {
const warnings = [];
let createdBaselineIdentity = null;
let cleanupResult = null;
let resultPayload = null;
try {
const api = await request("/api/users?sort=score");
if (!api.response.ok) fail("Directory users API must return successfully", api.json ?? api.text);
if (!Array.isArray(api.json?.users)) fail("Directory users API must return users array", api.json);
const isLocalBaseUrl = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/i.test(baseUrl);
const idealLimitMs = isLocalBaseUrl ? 5000 : 2000;
const hardLimitMs = isLocalBaseUrl ? 8000 : 8000;
if (api.durationMs > hardLimitMs) fail("Directory users API should stay below hard timeout threshold", { durationMs: api.durationMs, hardLimitMs });
if (api.durationMs > idealLimitMs) {
  warnings.push({
    message: "Directory API slower than ideal, likely cold start",
    durationMs: api.durationMs,
    idealLimitMs,
    hardLimitMs
  });
}
if (api.json.users.length > 250) fail("Directory default response should be paginated/limited", { count: api.json.users.length });
const hiddenDefaultUsers = api.json.users
  .map(usernameFromDirectoryItem)
  .filter((username) => hiddenDirectoryPrefixes.some((prefix) => username.replace(/\.arcid$/i, "").startsWith(prefix)));
if (hiddenDefaultUsers.length > 0) fail("Directory default response should hide generated QA usernames", { hiddenDefaultUsers });
const firstUser = api.json.users[0];
if (firstUser && !firstUser.profileUrl?.startsWith("/profile/")) fail("Directory users should include direct public profileUrl", firstUser);
if (firstUser?.trustGraph || firstUser?.multiChain?.chains?.length) fail("Directory users response should not include heavy enrichment", firstUser);

for (const prefix of hiddenDirectoryPrefixes) {
  const hiddenSearch = await request(`/api/users?q=${encodeURIComponent(prefix)}&limit=10&t=${Date.now()}`);
  if (!hiddenSearch.response.ok) fail("Directory hidden-prefix search API must return successfully", { prefix, response: hiddenSearch.json ?? hiddenSearch.text });
  const leakedUsers = (hiddenSearch.json?.users ?? [])
    .map(usernameFromDirectoryItem)
    .filter((username) => username.replace(/\.arcid$/i, "").startsWith(prefix));
  if (leakedUsers.length > 0) fail("Directory search should hide generated QA username prefixes", { prefix, leakedUsers });
}

const search = await request(`/api/users?q=${encodeURIComponent(activeUsername)}&limit=10`);
if (!search.response.ok) fail("Directory users search API must return successfully", search.json ?? search.text);
const expected = activeUsername.toLowerCase().endsWith(".arcid") ? activeUsername.toLowerCase() : `${activeUsername.toLowerCase()}.arcid`;
let searchedUsername = expected;
let match = (search.json?.users ?? []).find((item) => item.profile?.username?.toLowerCase() === expected);
if (!match) {
  warnings.push({ message: "ACTIVE_TEST_USERNAME was not present in /api/users search results; using first returned directory user for normalization checks.", activeUsername });
  const fallbackUsername = firstUser?.profile?.username;
  if (!fallbackUsername) fail("Directory search should find active username or have at least one fallback user", { activeUsername, users: search.json?.users?.map((item) => item.profile?.username) });
  searchedUsername = fallbackUsername.toLowerCase();
  const fallbackSearch = await request(`/api/users?q=${encodeURIComponent(searchedUsername)}&limit=10`);
  if (!fallbackSearch.response.ok) fail("Directory fallback search API must return successfully", fallbackSearch.json ?? fallbackSearch.text);
  match = (fallbackSearch.json?.users ?? []).find((item) => item.profile?.username?.toLowerCase() === searchedUsername);
}
if (!match) fail("Directory search should find a registered username", { activeUsername, searchedUsername });
if (match.profileUrl !== `/profile/${searchedUsername}`) fail("Directory search profileUrl should be direct canonical public route", match);

const baselineSuffix = randomBytes(6).toString("hex");
const baselineWallet = randomWallet();
const baselineBase = `cleanuser_${baselineSuffix}`;
const baselineUsername = `${baselineBase}.arcid`;
if (hiddenDirectoryPrefixes.some((prefix) => baselineBase.startsWith(prefix))) {
  fail("Directory baseline fixture prefix must not be hidden by public Directory filters", { baselineBase, hiddenDirectoryPrefixes });
}
const created = await request("/api/profile/create", {
  method: "POST",
  body: JSON.stringify({
    walletAddress: baselineWallet,
    username: baselineBase,
    signature: `directory-readiness-${baselineSuffix}`
  })
});
if (!created.response.ok) fail("Directory baseline profile create should succeed", created.json ?? created.text);
if (created.json?.username !== baselineUsername) fail("Directory baseline profile should return canonical username", created.json);
createdBaselineIdentity = {
  username: baselineUsername,
  wallet: normalizeWallet(baselineWallet)
};

for (const query of [baselineBase, baselineUsername, baselineUsername.toUpperCase(), `  ${baselineBase}  `]) {
  const result = await request(`/api/users?q=${encodeURIComponent(query)}&limit=10&t=${Date.now()}`);
  if (!result.response.ok) fail("Directory baseline search should return successfully", { query, response: result.json ?? result.text });
  const baselineMatch = (result.json?.users ?? []).find((item) => item.profile?.username?.toLowerCase() === baselineUsername);
  if (!baselineMatch) fail("Directory search should include newly claimed baseline identity", { query, users: result.json?.users?.map((item) => item.profile?.username) });
  if (scoreValue(baselineMatch) <= 0) fail("Directory baseline identity should include baseline score", { query, baselineMatch });
  if (totalTx(baselineMatch) !== 0) fail("Directory baseline identity should keep zero tx visible", { query, baselineMatch });
  if (activeChainCount(baselineMatch) !== 0) fail("Directory baseline identity should keep zero active chains visible", { query, baselineMatch });
  if (walletAge(baselineMatch) !== 0) fail("Directory baseline identity should keep zero wallet age visible", { query, baselineMatch });
  const source = baselineMatch.scoreSource ?? baselineMatch.dataSource ?? baselineMatch.cacheStatus ?? null;
  if (!["baseline", "provider_unavailable", "cached", "profile", "legacy_profile", "placeholder"].includes(String(source ?? ""))) {
    fail("Directory baseline identity should expose safe score source", { query, source, baselineMatch });
  }
}

const apiAfterBaselineCreate = await request(`/api/users?sort=score&t=${Date.now()}`);
if (!apiAfterBaselineCreate.response.ok) fail("Directory users API must return successfully after baseline create", apiAfterBaselineCreate.json ?? apiAfterBaselineCreate.text);
if (!Array.isArray(apiAfterBaselineCreate.json?.users)) fail("Directory users API must return users array after baseline create", apiAfterBaselineCreate.json);

const page = await request("/directory", { headers: { Accept: "text/html" } });
if (!page.response.ok) fail("Directory page must render", { status: page.response.status, text: page.text.slice(0, 400) });
if (!page.text.includes("Checking wallet connection")) fail("Directory page should be wallet-gated on direct disconnected access", page.text.slice(0, 1000));
if (page.text.includes("Registered Arc identities")) fail("Directory page should not server-render the full user list when disconnected", page.text.slice(0, 1000));

resultPayload = {
  ok: true,
  baseUrl,
  userCount: api.json.users.length,
  apiDurationMs: api.durationMs,
  pageDurationMs: page.durationMs,
  searchedUsername,
  baselineUsername,
  warnings
};
} finally {
  cleanupResult = await cleanupCreatedBaselineIdentity(createdBaselineIdentity, warnings);
}
if (resultPayload) {
  console.log(JSON.stringify({
    ...resultPayload,
    cleanup: cleanupResult,
    warnings
  }, null, 2));
}
}

try {
  await main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    failure: error instanceof Error ? error.message : "Directory readiness test failed",
    details: error?.details ?? null
  }, null, 2));
  process.exit(1);
}
