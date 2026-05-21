import { readFile } from "node:fs/promises";

const create = await readFile(new URL("../app/create/page.tsx", import.meta.url), "utf8");
const reveal = await readFile(new URL("../app/identity-created/page.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(create.includes("useCallback"), "create page should memoize wallet/profile callbacks");
expect(create.includes("const lastCheckedWalletRef = useRef(\"\")"), "create page should track the last wallet ownership lookup");
expect(create.includes("const currentWalletRef = useRef(\"\")"), "create page should track wallet changes separately from username typing");
expect(create.includes("if (!showFailureNote && lastCheckedWalletRef.current === lookupKey) return;"), "same-wallet profile lookup should not rerun while user types");
expect(create.includes("lastCheckedWalletRef.current = lookupKey;"), "profile lookup should be marked in-flight/checked by wallet signature");
expect(create.includes("const syncWalletState = useCallback"), "wallet sync callback should be stable across username input renders");
expect(create.includes("<WalletConnectButton onConnect={syncWalletState} />"), "wallet button should receive stable onConnect callback, not an inline function");
expect(create.includes("useEffect(() => {\n    syncWalletState();\n  }, [syncWalletState]);"), "initial wallet sync should depend only on the stable wallet sync callback");
expect(create.includes("identityState === \"unclaimed\" && !checkingProfile"), "claim form should remain visible once wallet is confirmed unclaimed");
expect(create.includes("setAvailability(\"checking\")") && create.includes("}, [usernameValue, usernameValidation.valid]);"), "username availability should be separate from wallet ownership lookup");
expect(!create.includes("setIdentityState(\"checking\")") || create.indexOf("setIdentityState(\"checking\")") < create.indexOf("useEffect(() => {\n    if (!usernameValue"), "username availability effect should not set profile ownership back to checking");
expect(create.includes("setAvailability(\"idle\");\n      lastCheckedWalletRef.current = \"\";"), "wallet changes should reset availability and profile lookup state");
expect(create.includes("setPostClaimRevealContext(claimedWallet, claimedUsername, profileUrl, \"claim-success\")"), "claim success should preserve post-claim reveal context");
expect(create.includes("router.replace(revealUrl)") && !create.includes("window.location.href = revealUrl"), "claim success should use SPA replace without hard reload");
expect(reveal.includes("getPostClaimRevealContext()") && reveal.includes("clearPostClaimRevealContext(resolvedWallet, resolvedUsername)"), "post-claim reveal contract should remain intact");

for (const forbidden of ["Supabase", "service role", "schema cache", "arc-identity-nu.vercel.app"]) {
  expect(!create.includes(forbidden), `create page should not expose internal/stale wording: ${forbidden}`);
}

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "create profile page keeps claim form stable while typing"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
