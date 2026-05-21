import { readFile } from "node:fs/promises";

const files = {
  developers: await readFile(new URL("../components/DevelopersPageClient.tsx", import.meta.url), "utf8"),
  demo: await readFile(new URL("../components/DeveloperApiDemo.tsx", import.meta.url), "utf8"),
  score: await readFile(new URL("../app/api/score/[wallet]/route.ts", import.meta.url), "utf8"),
  refresh: await readFile(new URL("../app/api/score/[wallet]/refresh/route.ts", import.meta.url), "utf8"),
  profile: await readFile(new URL("../app/api/profile/[username]/route.ts", import.meta.url), "utf8"),
  byWallet: await readFile(new URL("../app/api/profile/by-wallet/[wallet]/route.ts", import.meta.url), "utf8"),
  users: await readFile(new URL("../app/api/users/route.ts", import.meta.url), "utf8"),
  contract: await readFile(new URL("../lib/api-contract.ts", import.meta.url), "utf8")
};

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const publicText = [files.developers, files.score, files.refresh, files.profile, files.byWallet, files.users].join("\n");

expect(files.contract.includes("publicApiError"), "shared public API error helper should exist");
expect(files.contract.includes("sanitizeCanonicalSnapshot"), "canonical score/profile payloads should be sanitized before public responses");
expect(files.contract.includes("sanitizeCoverageIssues"), "coverage issues should have a public-safe shape");
expect(files.score.includes("isValidWalletAddress(wallet)") && files.refresh.includes("isValidWalletAddress(wallet)") && files.byWallet.includes("isValidWalletAddress(wallet)"), "wallet routes should return clean invalid-wallet errors");
expect(files.profile.includes("Profile not found") && files.profile.includes("This ARC Identity profile could not be found."), "profile not-found response should use stable error/message fields");
expect(files.score.includes("components") && files.score.includes("explanations"), "score response should include components and explanations");
expect(files.score.includes("coverageIssues") && files.refresh.includes("coverageIssues"), "score responses should expose calm coverage issues");
expect(files.developers.includes('"score"') || files.developers.includes("score:"), "Developer API sample should include top-level score");
expect(files.developers.includes("intelligenceStatus"), "Developer API sample should include intelligenceStatus");
expect(files.developers.includes("Arc-native reputation signal"), "Developer API page should frame score as Arc-native reputation");
expect(files.demo.includes("DEMO_REQUEST_TIMEOUT_MS = 15_000"), "Developer API live demo should use a dashboard-safe timeout");
expect(files.demo.includes("/api/score/${encodeURIComponent(normalizeWalletLookup(input))}"), "wallet input should route to the wallet score endpoint");
expect(files.demo.includes("/api/profile/${encodeURIComponent(username)}"), "username input should route to the profile endpoint");
expect(files.demo.includes("Request timeout"), "live demo should distinguish timeout from profile-not-found");
expect(!files.demo.includes("This profile could not be found, or the request took longer than expected."), "live demo should not collapse timeout and not-found into one generic error");

const forbiddenPublicSnippets = [
  "Missing Supabase",
  "cache_unavailable",
  "multi_chain_explorer_indexers",
  "arcscan_rpc_indexer",
  "cached_wallet_activity_snapshot"
];
for (const snippet of forbiddenPublicSnippets) {
  expect(!publicText.includes(snippet), `public API docs/routes should not expose internal wording: ${snippet}`);
}

expect(!files.refresh.includes('providerSource: "score_refresh"'), "refresh API should not expose score_refresh provider source");
expect(!files.score.includes("return NextResponse.json({ error: error instanceof Error ? error.message"), "score API should not return raw error.message");
expect(!files.refresh.includes("error: message,\n"), "refresh API should not return raw caught error message");

if (failures.length) {
  console.error(JSON.stringify({ ok: false, failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    scenario: "Developer API public contract has stable fields, sanitized errors, and Arc-native docs"
  }, null, 2));
}
