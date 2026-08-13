#!/usr/bin/env node
/* Ask Kyro for an allow / caution / block verdict on one wallet.

   Usage:
     node examples/check-wallet.mjs 0x1234567890abcdef1234567890abcdef12345678 payment

   Use cases: payment, escrow, lending, marketplace.

   Anonymous access works on every endpoint with a lower rate budget. Set
   KYRO_API_KEY to send a key. Budgets and key setup: https://docs.thekyro.co */

const API_ORIGIN = (process.env.KYRO_API_ORIGIN || "https://www.thekyro.co").replace(/\/$/, "");
const wallet = process.argv[2] || "0x1234567890abcdef1234567890abcdef12345678";
const useCase = process.argv[3] || "payment";

const headers = { accept: "application/json" };
if (process.env.KYRO_API_KEY) headers.authorization = `Bearer ${process.env.KYRO_API_KEY}`;

const response = await fetch(`${API_ORIGIN}/api/v1/decision/${wallet}?useCase=${encodeURIComponent(useCase)}`, { headers });
const payload = await response.json();

if (!payload.ok) {
  console.error(`Request failed (${response.status}): ${payload.error?.code ?? "unknown"} ${payload.error?.message ?? ""}`);
  process.exit(1);
}

const data = payload.data;
console.log(`Wallet     ${data.wallet}${data.username ? ` (${data.username})` : ""}`);
console.log(`Use case   ${data.useCase}`);
console.log(`Verdict    ${data.decision.toUpperCase()} (score ${data.score ?? "n/a"}, risk ${data.riskLevel ?? "unknown"})`);
console.log(`Limit      ${data.recommendedLimit.amountUsdc} ${data.recommendedLimit.currency}`);
console.log(`Freshness  ${data.freshness.cacheStatus ?? "unknown"}`);
for (const reason of data.reasons ?? []) console.log(`  reason   ${reason.code}: ${reason.message}`);
for (const warning of data.warnings ?? []) console.log(`  advisory ${warning.code}: ${warning.message}`);
if (data.freshness.cacheStatus !== "cached") {
  console.log("\nNote: this verdict is a conservative baseline until Kyro has indexed the wallet.");
}
