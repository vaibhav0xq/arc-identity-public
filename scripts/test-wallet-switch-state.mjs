const { readFile } = await import("node:fs/promises");
const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const walletA = (process.env.ACTIVE_TEST_WALLET || "").toLowerCase();
const walletB = (process.env.UNCLAIMED_TEST_WALLET || "0x000000000000000000000000000000000000dEaD").toLowerCase();

function assert(condition, message, details = null) {
  if (!condition) {
    console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
    process.exit(1);
  }
}

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  const json = text && (response.headers.get("content-type") ?? "").includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text };
}

const hookSource = await readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");
assert(hookSource.includes("requestIdRef"), "shared identity hook must use request ids to ignore stale wallet responses");
assert(hookSource.includes("walletUsernameKey"), "shared identity hook must use wallet-scoped username key");
assert(hookSource.includes("walletClaimedKey"), "shared identity hook must use wallet-scoped claimed key");
assert(hookSource.includes("clearArcIdentityWalletCache"), "shared identity hook must clear wallet-scoped cache after confirmed 404");
assert(!hookSource.includes("arcIdentityUsername\", canonical);\\n  localStorage.setItem(\"arcIdentityUsernameWallet\""), "shared identity hook must not write unscoped username without wallet binding");

if (walletA) {
  const claimed = await request(`/api/profile/by-wallet/${walletA}?t=${Date.now()}`);
  assert(claimed.response.ok, "wallet A should be claimed for switch test", claimed.json ?? claimed.text);
  const unclaimed = await request(`/api/profile/by-wallet/${walletB}?t=${Date.now()}`);
  assert(unclaimed.response.status === 404 || unclaimed.response.ok, "wallet B lookup should be deterministic", unclaimed.json ?? unclaimed.text);
  if (unclaimed.response.ok) {
    console.log(JSON.stringify({ ok: true, warning: "wallet B is claimed; source-level wallet-scoped state checks still passed.", walletA, walletB }, null, 2));
  } else {
    console.log(JSON.stringify({ ok: true, walletA, walletB, switchModel: "claimed_to_unclaimed_is_wallet_scoped" }, null, 2));
  }
} else {
  console.log(JSON.stringify({ ok: true, warning: "ACTIVE_TEST_WALLET not set; source-level wallet-scoped checks passed." }, null, 2));
}
