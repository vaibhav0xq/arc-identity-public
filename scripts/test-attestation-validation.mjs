import { readFile } from "node:fs/promises";

const files = {
  page: await readFile(new URL("../app/attestations/page.tsx", import.meta.url), "utf8"),
  request: await readFile(new URL("../app/api/attestations/request/route.ts", import.meta.url), "utf8"),
  legacyRequest: await readFile(new URL("../app/api/interactions/request/route.ts", import.meta.url), "utf8"),
  db: await readFile(new URL("../lib/db.ts", import.meta.url), "utf8"),
  onchain: await readFile(new URL("../lib/onchain.ts", import.meta.url), "utf8")
};

const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}

expect(files.page.includes("looksLikeTxHash") && files.page.includes("^0x[a-fA-F0-9]{64}$"), "client should validate EVM transaction hash format");
expect(files.page.includes("selectedCounterparty") && files.page.includes("Select a registered ARC Identity counterparty."), "client should require a selected registered counterparty");
expect(files.page.includes("{!selectedCounterparty ? (") && files.page.includes("Search username, username.arcid, or wallet address"), "counterparty search input should render before selection");
expect(files.page.includes("{!selectedCounterparty && open ? ("), "counterparty search results should hide after a counterparty is selected");
expect(files.page.includes("Selected identity") && files.page.includes("ARC Identity will verify this identity against the submitted transaction."), "selected counterparty state should render an intentional selected identity card");
expect(files.page.includes("onSelect(\"\")") && files.page.includes("setSearchQuery(\"\")") && files.page.includes("inputRef.current?.focus()"), "Change should clear stale counterparty/search state and restore search focus");
expect(files.page.includes("You cannot submit an attestation with your own wallet as the counterparty."), "client should block self-attestation");
expect(files.page.includes("isInteractionType(interactionType)"), "client should require a supported interaction type");
expect(files.page.includes("if (submitting) return;"), "client should guard rapid double-submit");
expect(files.page.includes("disabled={!formReady || submitting}"), "submit button should remain disabled until the form is valid");
expect(files.page.includes("formDisabledReason"), "disabled state should show a clear reason");
expect(files.page.includes("This transaction has already been submitted for this relationship."), "duplicate copy should be relationship-focused and clear");

expect(files.request.includes("validTxHashPattern") && files.request.includes("^0x[a-f0-9]{64}$"), "server should validate tx hash format before verification");
expect(files.request.includes("validWalletPattern") && files.request.includes("^0x[a-f0-9]{40}$"), "server should validate wallet address format");
expect(files.request.includes("allowedInteractionTypes") && files.request.includes("service_payment") && files.request.includes("trade_settlement"), "server should validate supported interaction types");
expect(files.request.includes("fromWallet === toWallet"), "server should reject self-attestation");
expect(files.request.includes("validateRequestBody(body)") && appearsBefore(files.request, "validateRequestBody(body)", "findAttestationByTxHash(txHash)"), "server validation should run before duplicate lookup and verification");
expect(files.request.includes("duplicate key") && files.request.includes("unique constraint"), "server should treat DB race duplicates as duplicate responses");
expect(files.request.includes("duplicateResponse(existing)"), "duplicate handling should be centralized and idempotent");
expect(files.request.includes("Transaction could not be verified right now. Try again later."), "verification provider failures should use calm public copy");
expect(files.request.includes("This transaction was not found on the supported Arc network."), "wrong-chain failures should be distinct from generic profile failures");
expect(!files.request.includes("details: {"), "attestation API should not echo raw request details on public errors");

expect(files.db.includes("normalizeInteractionType(interactionType)"), "persistence path should validate interaction type server-side");
expect(files.db.includes("if (from === to) throw new Error(\"Self-attestation is not allowed\")"), "persistence path should reject self-attestation");
expect(files.db.includes("Counterparty must have a verified claimed profile"), "persistence path should require registered counterparties");
expect(appearsBefore(files.db, "verifyArcTransaction({ txHash", ".insert(attestationPayload)"), "transaction verification should happen before attestation insert");
expect(appearsBefore(files.db, "checking_duplicate_attestation", "inserting_reputation_event"), "duplicate checks should happen before reputation side effects");
expect(appearsBefore(files.db, "inserting_attestation", "inserting_reputation_event"), "reputation side effects should only happen after attestation insert");

expect(files.onchain.includes("eth_chainId") && files.onchain.includes("Wrong chain"), "transaction verification should enforce configured Arc chain");
expect(files.onchain.includes("participants.includes(fromWallet)") && files.onchain.includes("participants.includes(counterpartyWallet)"), "transaction verification should require both selected wallets");
expect(files.onchain.includes("receipt.status") && files.onchain.includes("Transaction did not succeed"), "transaction verification should reject failed transactions");

expect(files.legacyRequest.includes("Endpoint unavailable") && !files.legacyRequest.includes("createAttestation"), "legacy interaction request endpoint should not bypass hardened attestation validation");

const publicRouteCopy = [files.request, files.legacyRequest]
  .flatMap((source) => source.match(/["'`]([^"'`]+)["'`]/g) ?? [])
  .filter((value) => !value.includes("@/"))
  .filter((value) => !value.includes("getSupabaseAdmin"))
  .join("\n");
const publicText = [files.page, publicRouteCopy].join("\n");
for (const forbidden of [/Supabase/, /schema cache/i, /service role/i, /duplicate key value/i]) {
  expect(!forbidden.test(publicText), `attestation public surfaces should not expose internal wording: ${forbidden}`);
}

const result = {
  ok: failures.length === 0,
  failures,
  scenario: "Verified Attestations validation and abuse-safety checks"
};

console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
