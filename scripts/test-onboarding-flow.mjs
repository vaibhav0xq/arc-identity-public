const baseUrl = process.env.BASE_URL || process.env.ARC_IDENTITY_TEST_URL || "http://localhost:3000";
const { randomBytes } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");

async function assertCreateRedirectContract() {
  try {
    const source = await readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8");
    const navSource = await readFile(new URL("../components/ProfileNavButton.tsx", import.meta.url), "utf8");
    const resolverSource = await readFile(new URL("../app/profile/me/page.tsx", import.meta.url), "utf8");
    const identityHookSource = await readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");
    const dashboardSource = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
    const revealSource = await readFile(new URL("../app/identity-created/page.tsx", import.meta.url), "utf8");
    const onboardingSource = await readFile(new URL("../lib/onboarding.ts", import.meta.url), "utf8");
    assert(source.includes("<form onSubmit={createProfile}"), "create page should submit through the shared claim handler");
    assert(source.includes("setPostClaimRevealContext(claimedWallet, claimedUsername, profileUrl, \"claim-success\")"), "claim success should write deterministic reveal state before redirect");
    assert(onboardingSource.includes('postClaimRevealKey = "arc-identity:post-claim-reveal"'), "post-claim reveal should use the canonical session key");
    assert(source.includes("router.replace(revealUrl)"), "claim success should use SPA replace for a smooth identity reveal transition");
    assert(!source.includes("window.location.href = revealUrl"), "claim success should not hard reload before identity reveal");
    assert(source.includes("arcIdentityUsername:${wallet.toLowerCase()}") || source.includes("walletUsernameKey(wallet)"), "create page should store username in a wallet-scoped cache");
    assert(navSource.includes("useArcIdentity"), "ProfileNavButton should consume shared identity state");
    assert(identityHookSource.includes("/api/profile/by-wallet/"), "shared identity state should verify profile by wallet");
    assert(identityHookSource.includes("data as ProfileByWalletResponse"), "shared identity state should read canonical username from profile-by-wallet response");
    assert(navSource.includes("profile_nav_click"), "ProfileNavButton should resolve the route on click");
    assert(navSource.includes("profile_nav_final_url"), "ProfileNavButton should emit final URL debug logs");
    assert(!navSource.includes("<Link href={href}"), "ProfileNavButton should not navigate through a stale href");
    assert(navSource.includes("identity.profileUrl || \"/profile/me\""), "ProfileNavButton should use canonical profile URL with /profile/me fallback");
    assert(resolverSource.includes("Opening your ARC Identity"), "wallet profile resolver should show opening state");
    assert(resolverSource.includes("useArcIdentity"), "wallet profile resolver should use shared identity state");
    assert(resolverSource.includes("window.location.replace(identity.profileUrl)"), "wallet profile resolver should redirect to canonical public profile");
    const dashboardUsesResolverFallback = dashboardSource.includes('const profileHref = username ? "/profile/me" : "/create"');
    const dashboardUsesCanonicalProfile = dashboardSource.includes("`/profile/${username}`") || dashboardSource.includes("profileUrl");
    assert(dashboardUsesResolverFallback || dashboardUsesCanonicalProfile, "dashboard profile CTA should use a valid profile destination");

    assert(revealSource.includes('const publicProfileHref = resolvedProfileUrl ?? (resolvedUsername ? `/profile/${resolvedUsername}` : "/profile/me")'), "identity reveal profile CTA should use canonical public profile with /profile/me fallback");
    assert(revealSource.includes('const profileHref = resolvedWallet ? publicProfileHref : "/create"'), "identity reveal profile CTA should only point to profile destinations for connected wallets");
    assert(revealSource.includes("getPostClaimRevealContext()"), "identity reveal should read deterministic post-claim reveal payload");
    assert(revealSource.includes("Built by @vaibhav_0xq"), "identity reveal X share text should include creator attribution");
    assert(!revealSource.includes("arc-identity-nu.vercel.app"), "identity reveal profile CTA should not use stale Vercel URL");
  } catch (error) {
    assert(false, "create redirect contract should be readable", error instanceof Error ? error.message : error);
  }
}

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

async function runCase(index) {
  const suffix = randomBytes(8).toString("hex");
  const wallet = randomWallet();
  const duplicateWalletAddress = randomWallet();
  const username = `test_${index}_${suffix.slice(0, 10)}`;
  const canonicalUsername = `${username}.arcid`;
  const signature = `test-signature-${suffix}`;

  const before = await request("/api/profile/ensure", {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, signature })
  });
  assert(before.response.ok, "ensure before claim should return ok", before.json);
  assert(before.json.usernameClaimed === false, "ensure before claim should be unclaimed", before.json);

  const created = await request("/api/profile/create", {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, username, signature })
  });
  assert(created.response.ok, "create username should return ok", created.json);
  assert(created.json.success === true, "create username should return success true", created.json);
  assert(created.json.username === canonicalUsername, "create username should return canonical claimed username", created.json);
  assert(created.json.usernameBase === username, "create username should return usernameBase", created.json);
  assert(created.json.wallet_address === wallet.toLowerCase(), "create username should return wallet_address", created.json);
  assert(created.json.verified_wallet === true, "create username should verify wallet", created.json);
  assert(created.json.usernameClaimed === true, "create username should mark usernameClaimed", created.json);
  assert(created.json.profileUrl === `/profile/${canonicalUsername}`, "create username should return profileUrl", created.json);

  const profileByBase = await request(`/api/profile/${username}`);
  assert(profileByBase.response.ok, "profile lookup by base username should return ok", profileByBase.json);
  assert(profileByBase.json.profile?.username === canonicalUsername, "profile lookup by base username should return canonical username", profileByBase.json);

  const profileByCanonical = await request(`/api/profile/${canonicalUsername}`);
  assert(profileByCanonical.response.ok, "profile lookup by canonical username should return ok", profileByCanonical.json);
  assert(profileByCanonical.json.profile?.username === canonicalUsername, "profile lookup by canonical username should return canonical username", profileByCanonical.json);

  for (const route of [`/profile/${username}`, `/profile/${canonicalUsername}`, created.json.profileUrl]) {
    const profileRoute = await request(route, { headers: { Accept: "text/html" } });
    assert(profileRoute.response.ok, "public profile route should return ok", { route, status: profileRoute.response.status });
    assert(profileRoute.text.includes(canonicalUsername), "public profile route should render claimed username", { route });
    assert(!profileRoute.text.includes("ARC Identity initializing"), "public profile route should not render initializing fallback for claimed username", { route });
  }

  const revealRoute = await request(`/identity-created?username=${encodeURIComponent(canonicalUsername)}&wallet=${encodeURIComponent(wallet)}`, { headers: { Accept: "text/html" } });
  assert(revealRoute.response.ok, "identity reveal route should return ok", { status: revealRoute.response.status });
  assert(
    revealRoute.text.includes("ARC Identity created")
      || revealRoute.text.includes("Your ARC Identity is live")
      || revealRoute.text.includes("/_next/static/chunks/app/identity-created/page"),
    "identity reveal route should serve the branded reveal experience",
    { status: revealRoute.response.status }
  );

  const after = await request(`/api/profile/ensure?t=${Date.now()}`, {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, signature })
  });
  assert(after.response.ok, "ensure after claim should return ok", after.json);
  assert(after.json.usernameClaimed === true, "ensure after claim should be claimed", after.json);
  assert(after.json.profile?.username === canonicalUsername, "ensure after claim should return canonical profile username", after.json);
  assert(after.json.username === canonicalUsername, "ensure after claim should return canonical top-level username", after.json);
  assert(after.json.profileUrl === `/profile/${canonicalUsername}`, "ensure after claim should return profileUrl", after.json);
  const byWallet = await request(`/api/profile/by-wallet/${wallet}`);
  assert(byWallet.response.ok, "profile by wallet should return ok", byWallet.json);
  assert(byWallet.json.usernameClaimed === true, "profile by wallet should mark username claimed", byWallet.json);
  assert(byWallet.json.username === canonicalUsername, "profile by wallet should return canonical username", byWallet.json);
  assert(byWallet.json.profile?.walletAddress === wallet.toLowerCase(), "profile by wallet should return normalized wallet", byWallet.json);
  assertBaselineIdentity(byWallet.json, "profile by wallet fresh identity");
  const resolverTarget = `/profile/${after.json.username}`;
  assert(resolverTarget === `/profile/${canonicalUsername}`, "profile resolver should use canonical ensure username", { resolverTarget, ensure: after.json });
  assert(!["/profile/undefined", "/profile/null", `/profile/${wallet}`].includes(resolverTarget), "profile resolver must not use undefined, null, or wallet address", { resolverTarget, wallet });

  const score = await request(`/api/score/${wallet}`);
  assert(score.response.ok, "score endpoint should return ok for fresh claimed wallet", score.json);
  assert(score.json.username === canonicalUsername, "score endpoint should return canonical username", score.json);
  assert(score.json.usernameClaimed === true, "score endpoint should mark username claimed", score.json);
  assertBaselineIdentity(score.json, "score endpoint fresh identity");
  assert(score.json.riskLevel === "High Risk", "fresh zero-evidence wallet should receive the high-risk tier", score.json);

  const duplicateUsername = await request("/api/profile/create", {
    method: "POST",
    body: JSON.stringify({ walletAddress: duplicateWalletAddress, username, signature: `${signature}-duplicate` })
  });
  assert(duplicateUsername.response.status === 409, "duplicate username should return 409", duplicateUsername.json);
  assert(/already taken/i.test(duplicateUsername.json.error ?? ""), "duplicate username should return clear error", duplicateUsername.json);

  const duplicateWalletResult = await request("/api/profile/create", {
    method: "POST",
    body: JSON.stringify({ walletAddress: wallet, username: `${username}_again`, signature })
  });
  assert(duplicateWalletResult.response.ok, "duplicate wallet should return existing profile", duplicateWalletResult.json);
  assert(duplicateWalletResult.json.username === canonicalUsername, "duplicate wallet should preserve existing username", duplicateWalletResult.json);
  assert(duplicateWalletResult.json.profileUrl === `/profile/${canonicalUsername}`, "duplicate wallet should preserve profileUrl", duplicateWalletResult.json);

  const debug = await request(`/api/debug/onboarding/${wallet}`);
  assert(debug.response.ok, "debug endpoint should return ok", debug.json);
  assert(debug.json.profileExists === true, "debug profileExists should be true", debug.json);
  assert(debug.json.username === canonicalUsername, "debug username should be canonical", debug.json);
  assert(debug.json.usernameClaimed === true, "debug usernameClaimed should be true", debug.json);
  assert(debug.json.verified_wallet === true, "debug verified_wallet should be true", debug.json);
  assert(debug.json.duplicateProfileCount === 0, "debug duplicateProfileCount should be zero", debug.json);

  const dashboard = await request("/dashboard", { headers: { Accept: "text/html" } });
  assert(dashboard.response.ok, "dashboard route should return ok", { status: dashboard.response.status });

  const refresh = await request(`/api/score/${wallet}/refresh`, { method: "POST" });
  assert(refresh.response.ok, "refresh intelligence should complete or return explicit result", refresh.json);
  assert(refresh.json.username === canonicalUsername, "refresh should preserve canonical username", refresh.json);
  assert(refresh.json.refreshInProgress === false, "refresh should not rely on serverless background work", refresh.json);
  assert(["committed", "failed", null].includes(refresh.json.refreshStatus ?? null), "refresh should return explicit status", refresh.json);

  return { wallet, username: canonicalUsername, profileUrl: `/profile/${canonicalUsername}` };
}

const results = [];
await assertCreateRedirectContract();
for (let index = 1; index <= 3; index += 1) {
  results.push(await runCase(index));
}

console.log(JSON.stringify({ ok: true, baseUrl, cases: results }, null, 2));
