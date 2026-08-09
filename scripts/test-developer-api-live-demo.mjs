import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/DeveloperApiDemo.tsx", import.meta.url), "utf8");
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

const timeoutMatch = source.match(/DEMO_REQUEST_TIMEOUT_MS\s*=\s*([0-9_]+)/);
const timeoutMs = timeoutMatch ? Number(timeoutMatch[1].replace(/_/g, "")) : 0;

expect(timeoutMs >= 12000, "live demo timeout should be at least as long as dashboard score fetches");
expect(source.includes("walletPattern = /^0x[a-fA-F0-9]{40}$/"), "demo should detect mixed-case and lowercase EVM wallet input");
expect(source.includes("normalizeWalletLookup(input)") && source.includes(".toLowerCase()"), "wallet input should be normalized before API lookup");
expect(source.includes("/api/score/${encodeURIComponent(normalizeWalletLookup(input))}"), "valid wallet input should call /api/score/:wallet");
expect(source.includes("normalizeUsernameLookup(input)") && source.includes("/api/profile/${encodeURIComponent(username)}"), "username input should call /api/profile/:username");
expect(source.includes("username.endsWith(\".arcid\")") || source.includes("normalized.endsWith(\".arcid\")"), "username lookup should support username and username.kyro inputs");
expect(source.includes("encodeURIComponent"), "demo API paths should encode user input safely");
expect(source.includes("Invalid input") && source.includes("valid EVM wallet address or Kyro username"), "invalid input should get a clean validation error");
expect(source.includes("Request timeout") && source.includes("The API request took longer than expected. Please retry."), "timeout should be distinct from profile-not-found");
expect(source.includes("typeof data?.error === \"string\"") && source.includes("typeof data?.message === \"string\""), "demo should preserve structured public API errors");
expect(!source.includes("This profile could not be found, or the request took longer than expected."), "demo should not use misleading combined profile/timeout error");

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "Developer API live demo routes wallet and username lookups with clean timeout/error handling"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
