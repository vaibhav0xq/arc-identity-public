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
  const contentType = response.headers.get("content-type") ?? "";
  const json = text && contentType.includes("application/json") ? JSON.parse(text) : null;
  return { response, json, text };
}

function assert(condition, message, details) {
  if (!condition) {
    console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
    process.exit(1);
  }
}

async function assertSourceContract() {
  const source = await readFile(new URL("../app/attestations/page.tsx", import.meta.url), "utf8");
  const hookSource = await readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");
  assert(source.includes("useArcIdentity"), "attestations gate must use shared identity state", null);
  assert(hookSource.includes("/api/profile/by-wallet/"), "shared identity state must use profile-by-wallet", null);
  assert(!source.includes("/api/profile/ensure"), "attestations gate must not rely on profile ensure", null);
  assert(source.includes("attestations_profile_lookup_success"), "attestations gate should log shared profile success", null);
  assert(source.includes("attestations_final_decision"), "attestations gate should log final gate state", null);
  assert(source.includes("Promise.allSettled"), "secondary attestation data loading must not downgrade identity gate", null);
  assert(source.includes("attestations_ignored_stale_response"), "stale attestation gate responses must be ignored", null);
  assert(source.includes("Checking Kyro..."), "attestations page should have a checking state", null);
  assert(source.includes("xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]"), "attestations page should use the shared responsive workflow grid", null);
}

await assertSourceContract();

const suffix = randomBytes(8).toString("hex");
const wallet = randomWallet();
const usernameBase = `attest_${suffix.slice(0, 10)}`;
const canonicalUsername = `${usernameBase}.arcid`;
const signature = `test-attestations-${suffix}`;

const created = await request("/api/profile/create", {
  method: "POST",
  body: JSON.stringify({ walletAddress: wallet, username: usernameBase, signature })
});
assert(created.response.ok, "fresh wallet claim should succeed", created.json ?? created.text);
assert(created.json.username === canonicalUsername, "fresh wallet claim should return canonical username", created.json);

const claimedByWallet = await request(`/api/profile/by-wallet/${wallet}?t=${Date.now()}`);
assert(claimedByWallet.response.ok, "claimed wallet should resolve through profile-by-wallet", claimedByWallet.json ?? claimedByWallet.text);
assert(claimedByWallet.json.profile?.username === canonicalUsername || claimedByWallet.json.username === canonicalUsername, "claimed wallet should return profile username", claimedByWallet.json);

const debug = await request(`/api/debug/attestations/${wallet}?t=${Date.now()}`);
assert(debug.response.ok, "attestations debug endpoint should resolve claimed wallet", debug.json ?? debug.text);
assert(debug.json.finalIdentityGateDecision === "registered", "attestations debug should classify claimed wallet as registered", debug.json);

const unclaimedWallet = randomWallet();
const unclaimed = await request(`/api/profile/by-wallet/${unclaimedWallet}?t=${Date.now()}`);
assert(unclaimed.response.status === 404, "unclaimed wallet should return a clear 404 from profile-by-wallet", unclaimed.json ?? unclaimed.text);

const unclaimedDebug = await request(`/api/debug/attestations/${unclaimedWallet}?t=${Date.now()}`);
assert(unclaimedDebug.response.ok, "attestations debug endpoint should handle unclaimed wallet", unclaimedDebug.json ?? unclaimedDebug.text);
assert(unclaimedDebug.json.finalIdentityGateDecision === "identity_required", "attestations debug should classify unclaimed wallet as identity_required", unclaimedDebug.json);

const page = await request("/attestations", { headers: { Accept: "text/html" } });
assert(page.response.ok, "attestations route should render", { status: page.response.status });
assert(page.text.includes("Checking Kyro"), "initial attestations HTML should render checking state, not a false identity-required flash", null);

console.log(JSON.stringify({
  ok: true,
  baseUrl,
  claimedWallet: wallet.toLowerCase(),
  username: canonicalUsername,
  unclaimedWallet: unclaimedWallet.toLowerCase()
}, null, 2));
