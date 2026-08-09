import { readFile } from "node:fs/promises";

const files = {
  create: await readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8"),
  reveal: await readFile(new URL("../app/identity-created/page.tsx", import.meta.url), "utf8"),
  walletConnect: await readFile(new URL("../components/WalletConnectButton.tsx", import.meta.url), "utf8"),
  onboarding: await readFile(new URL("../lib/onboarding.ts", import.meta.url), "utf8"),
  emptyStates: await readFile(new URL("../scripts/test-launch-empty-states.mjs", import.meta.url), "utf8").catch(() => "")
};

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(files.onboarding.includes('export const postClaimRevealKey = "arc-identity:post-claim-reveal"'), "onboarding should use one canonical post-claim reveal key");
expect(files.onboarding.includes("export function setPostClaimRevealContext") && files.onboarding.includes("export function getPostClaimRevealContext"), "onboarding should have shared reveal context helpers");
expect(files.onboarding.includes('source: "claim-success"') && files.onboarding.includes("sessionStorage.setItem(postClaimRevealKey, payload)"), "first-time reveal state should be written to canonical sessionStorage before redirect");
expect(files.onboarding.includes("export function isIdentityCreatedRevealActive"), "onboarding should expose a single reveal-active guard for redirect suppression");
expect(files.onboarding.includes("export function clearPostClaimRevealContext"), "onboarding should clear reveal context only from explicit exits");
expect(files.create.includes("setPostClaimRevealContext(claimedWallet, claimedUsername, profileUrl, \"claim-success\")"), "claim success should write shared reveal context");
expect(files.create.indexOf("setPostClaimRevealContext(claimedWallet, claimedUsername, profileUrl, \"claim-success\")") < files.create.indexOf("router.replace(revealUrl)"), "reveal state must be written before navigating to identity-created");
expect(files.create.includes("router.replace(revealUrl)") && !files.create.includes("window.location.href = revealUrl"), "claim success should use router.replace instead of a full reload");
expect(!files.create.includes("window.dispatchEvent(new Event(\"arc-identity-wallet-changed\"))"), "claim flow should not broadcast identity changes before the reveal route owns the session");
expect(!files.create.includes("source: \"trusted_cache_create_page\""), "create page should not use stale local cache to skip server-confirmed profile lookup");
expect(files.create.includes("identityState === \"unclaimed\" && !checkingProfile"), "create page should show claim form only after lookup confirms no profile");
expect(files.create.includes("Checking Kyro profile..."), "create page should show a checking state while profile lookup is pending");

expect(files.reveal.includes("type RevealAccessState = \"checking\" | \"allowed\" | \"blocked\""), "identity-created should own a stable reveal access state");
expect(files.reveal.includes("getPostClaimRevealContext()") && files.reveal.includes("readInitialRevealContext()"), "identity-created should read shared deterministic query/session reveal context");
expect(!files.reveal.includes("<WalletGate"), "identity-created should not use the generic wallet gate that can flash during post-claim reveal");
expect(files.reveal.includes("Preparing your identity summary from the completed claim."), "identity-created should have a calm mobile-safe loading state");
expect(files.reveal.includes("Preparing your ARC Reputation Score..."), "summary card should show score loading copy instead of hiding the card");
expect(files.reveal.includes("Score will appear once wallet intelligence finishes indexing."), "summary card should remain visible if score/profile loading fails");
expect(files.reveal.includes("const scoreLoading = state === \"loading\" && !score;"), "score loading should be represented inside the card");
expect(files.reveal.indexOf("Share on X") > files.reveal.indexOf("{state === \"loading\" ?") && files.reveal.includes(") : null}\n              <div className=\"mt-8 flex flex-wrap gap-3\">"), "Post on X actions should render even while score is loading");
expect(files.reveal.includes("Share on X") && files.reveal.includes("Built by @vaibhav_0xq"), "identity-created should keep Post on X share copy with creator attribution");
expect(files.reveal.includes("encodeURIComponent(shareText)"), "X share URL should keep safe encoding");
expect(files.reveal.includes("const publicProfileHref = resolvedProfileUrl ?? (resolvedUsername ? `/profile/${resolvedUsername}` : \"/profile/me\")"), "profile CTA should preserve canonical profile destination fallback");
expect(!files.reveal.includes("Checking wallet connection..."), "identity-created should not flash generic wallet checking copy during reveal");
expect(!files.reveal.includes("router.replace"), "identity-created should not auto-replace after a valid reveal is allowed");
expect(files.reveal.includes("function leaveReveal(target: string)") && files.reveal.includes("clearPostClaimRevealContext(resolvedWallet, resolvedUsername)") && files.reveal.includes("router.push(target)"), "identity-created should clear reveal state and navigate only from explicit CTA handler");
expect(files.reveal.includes("onClick={() => leaveReveal(dashboardHref)}") && files.reveal.includes("onClick={() => leaveReveal(profileHref)}"), "dashboard/profile exits should be explicit user-controlled CTAs");
expect(!files.reveal.includes("sessionStorage.removeItem"), "identity-created should not directly clear reveal context on mount");

expect(files.walletConnect.includes("isIdentityCreatedRevealActive(window.location.pathname, connected)"), "wallet connector should use shared reveal-active guard");
expect(files.walletConnect.includes("function routeAfterWalletLookup"), "wallet connector auto-routes should go through a reveal-aware guard");
expect(files.walletConnect.includes("wallet_identity_route_suppressed_for_reveal"), "wallet connector should log suppressed auto-routes during reveal");
expect(files.walletConnect.includes("routeAfterWalletLookup(\"/dashboard\", connected, \"profile_ensure\")"), "profile ensure dashboard redirect should be reveal-guarded");
expect(files.walletConnect.includes("routeAfterWalletLookup(\"/dashboard\", connected, \"score_fallback\")"), "score fallback dashboard redirect should be reveal-guarded");
expect(files.walletConnect.includes("routeAfterWalletLookup(\"/create\", connected, \"unclaimed\")"), "unclaimed create redirect should be reveal-guarded");
expect(!files.walletConnect.includes("trustedCachedUsername"), "wallet connect should not use stale local cache to skip profile lookup/create routing");

for (const forbidden of ["Supabase", "schema cache", "service role", "arc-identity-nu.vercel.app"]) {
  expect(!files.reveal.includes(forbidden), `identity-created should not expose internal/stale wording: ${forbidden}`);
}

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "post-claim identity reveal flow is deterministic and avoids redirect flashing"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
