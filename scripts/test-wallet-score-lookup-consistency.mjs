import { readFile } from "node:fs/promises";

const files = {
  demo: await readFile(new URL("../components/DeveloperApiDemo.tsx", import.meta.url), "utf8"),
  dashboard: await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8"),
  score: await readFile(new URL("../app/api/score/[wallet]/route.ts", import.meta.url), "utf8"),
  byWallet: await readFile(new URL("../app/api/profile/by-wallet/[wallet]/route.ts", import.meta.url), "utf8"),
  contract: await readFile(new URL("../lib/api-contract.ts", import.meta.url), "utf8")
};

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

expect(files.contract.includes("isValidWalletAddress") && files.contract.includes("toLowerCase"), "public wallet validation should normalize checksum/lowercase wallet input");
expect(files.score.includes("const wallet = normalizeWallet(walletParam)") && files.score.includes("isValidWalletAddress(wallet)"), "score API should normalize and validate wallets before lookup");
expect(files.score.includes("getIdentityByWallet(wallet, false)"), "score API should use the shared wallet identity/intelligence lookup path");
expect(files.score.includes("baselineResponse(wallet, false)"), "score API should return score contract baseline instead of profile-not-found for valid unclaimed wallets");
expect(files.score.includes("components") && files.score.includes("explanations") && files.score.includes("intelligenceStatus"), "score API should return stable score contract fields");
expect(files.byWallet.includes("normalizeWallet(walletParam)") && files.byWallet.includes("isValidWalletAddress(wallet)"), "profile-by-wallet should use the same wallet normalization contract");
expect(files.dashboard.includes("fetchJsonWithTimeout<ScoreLookupResponse>(`/api/score/${wallet}`") && files.dashboard.includes("12000"), "dashboard should use the same public score route with a normal score timeout");
expect(files.demo.includes("/api/score/${encodeURIComponent(normalizeWalletLookup(input))}") && files.demo.includes("DEMO_REQUEST_TIMEOUT_MS = 15_000"), "live demo wallet lookup should be consistent with the dashboard score path");
expect(!files.demo.includes("/api/score/${lookupValue}") && !files.demo.includes("/api/score/${wallet}`"), "live demo should not send raw or username input to /api/score/:wallet");

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "wallet score lookup normalization is consistent across dashboard, demo, and public APIs"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
