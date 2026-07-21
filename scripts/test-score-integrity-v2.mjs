import assert from "node:assert/strict";

const baseUrl = (process.env.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const sampleLimit = Math.max(1, Math.min(50, Number(process.env.SCORE_AUDIT_LIMIT || 20)));

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10000)
  });
  const body = await response.json().catch(() => null);
  assert.ok(response.ok, `${path} returned ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const directory = await getJson(`/api/users?limit=${sampleLimit}`);
const users = Array.isArray(directory.users) ? directory.users : [];
assert.ok(users.length > 0, "the API audit needs at least one claimed profile");

for (const user of users.slice(0, sampleLimit)) {
  assert.ok(user.profile?.signature == null, "directory leaked a wallet signature");
  assert.ok(user.profile?.scoreInputs == null, "directory leaked private score inputs");
  const wallet = user.walletAddress ?? user.wallet ?? user.profile?.walletAddress;
  const username = user.username ?? user.profile?.username;
  assert.match(wallet ?? "", /^0x[a-fA-F0-9]{40}$/, "directory row must expose a valid wallet");

  const first = await getJson(`/api/score/${wallet}?refresh=false`);
  const second = await getJson(`/api/score/${wallet}?refresh=false`);
  assert.equal(first.scoreModelVersion, "arc_score_v2_2026_07", `${wallet} is not on score V2`);
  assert.equal(first.arcIdentityScore, second.arcIdentityScore, `${wallet} changed score between read-only GET requests`);
  assert.equal(first.lastIndexedAt, second.lastIndexedAt, `${wallet} changed freshness between read-only GET requests`);

  const components = Object.values(first.components ?? {});
  assert.ok(components.length > 0, `${wallet} is missing score components`);
  const total = components.reduce((sum, component) => sum + Number(component.points ?? 0), 0);
  assert.equal(first.arcIdentityScore, Math.max(0, Math.min(100, Math.round(total - Number(first.breakdown?.riskPenalty ?? 0)))), `${wallet} score and breakdown disagree`);

  const arcChain = (first.indexedChains ?? first.chainRows ?? []).find((chain) => chain.chain === "Arc Testnet");
  if (arcChain) {
    assert.equal(Number(first.onchain?.txCount ?? first.arcTxCount ?? arcChain.txCount), Number(arcChain.txCount), `${wallet} Arc transaction count uses inconsistent sources`);
  }

  if (username) {
    const profile = await getJson(`/api/profile/${encodeURIComponent(username)}`);
    assert.ok(profile.profile?.signature == null && profile.identity?.profile?.signature == null, `${username} leaked a wallet signature`);
    assert.ok(profile.profile?.scoreInputs == null && profile.identity?.profile?.scoreInputs == null, `${username} leaked private score inputs`);
  }
}

console.log(`ARC Score V2 API audit passed for ${Math.min(users.length, sampleLimit)} profile(s).`);
