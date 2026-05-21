const { readFile } = await import("node:fs/promises");

function assert(condition, message, details = null) {
  if (!condition) {
    console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
    process.exit(1);
  }
}

const profileNavSource = await readFile(new URL("../components/ProfileNavButton.tsx", import.meta.url), "utf8");
const resolverSource = await readFile(new URL("../app/profile/me/page.tsx", import.meta.url), "utf8");
const hookSource = await readFile(new URL("../hooks/useArcIdentity.ts", import.meta.url), "utf8");

assert(hookSource.includes('export type ArcIdentityStatus = "disconnected" | "checking" | "claimed" | "unclaimed" | "error"'), "Shared identity hook must define the full identity state contract.");
assert(hookSource.includes("profile/by-wallet"), "Shared identity hook must revalidate against profile-by-wallet.");
assert(hookSource.includes("stale_identity_response_ignored"), "Shared identity hook must ignore stale identity responses.");
assert(hookSource.includes("arcIdentity:<wallet>") || hookSource.includes("arcIdentity:${wallet"), "Shared identity hook must use wallet-scoped cache keys.");
assert(hookSource.includes("arcIdentityDebugClear"), "Shared identity hook must expose debug cache clearing helper.");
assert(profileNavSource.includes("useArcIdentity"), "ProfileNavButton must consume shared identity state.");
assert(!profileNavSource.includes("/api/profile/by-wallet/"), "ProfileNavButton must not duplicate profile lookup logic.");
assert(profileNavSource.includes("Checking profile..."), "ProfileNavButton must render neutral checking state before server truth.");
assert(profileNavSource.includes("identity.profileUrl || \"/profile/me\""), "ProfileNavButton must use canonical profile URL with resolver fallback.");

assert(resolverSource.includes('type ResolverState = "idle" | "resolving" | "success" | "failed"'), "Profile resolver must use explicit lifecycle states.");
assert(resolverSource.includes("resolver_started"), "Profile resolver must log resolver start.");
assert(resolverSource.includes("resolver_completed"), "Profile resolver must log resolver completion.");
assert(resolverSource.includes("resolver_timeout"), "Profile resolver must have timeout diagnostics.");
assert(resolverSource.includes("resolver_cancelled"), "Profile resolver must cancel stale route transitions.");
assert(resolverSource.includes("overlay_visibility_changed"), "Profile resolver must log overlay visibility.");
assert(resolverSource.includes("setTimeout(() =>") && resolverSource.includes("8000"), "Profile resolver must timeout safely instead of spinning forever.");
assert(resolverSource.includes('resolverState === "resolving" || resolverState === "success"'), "Opening overlay should render only while resolving or immediately redirecting.");
assert(!resolverSource.includes("Profile found. Opening public profile"), "Successful resolution should redirect without a visible success card.");
assert(!resolverSource.includes("Open public profile"), "Successful resolution should avoid duplicate public-profile actions.");

console.log(JSON.stringify({
  ok: true,
  checks: [
    "header identity state machine",
    "shared identity hook",
    "wallet-scoped optimistic claimed cache",
    "profile-by-wallet revalidation",
    "stale response protection",
    "resolver lifecycle and timeout",
    "success fallback without persistent spinner"
  ]
}, null, 2));
