#!/usr/bin/env node
/* Screen several counterparties in one call: wallets and Kyro usernames mixed.

   Usage:
     node examples/batch-check.mjs 0xWALLET_ONE 0xWALLET_TWO name.kyro

   Anonymous batches take up to 10 unique rows and consume one rate unit per
   row. Keys raise the caps: see https://docs.thekyro.co */

const API_ORIGIN = (process.env.KYRO_API_ORIGIN || "https://www.thekyro.co").replace(/\/$/, "");
const inputs = process.argv.slice(2);
if (inputs.length === 0) {
  inputs.push(
    "0x1234567890abcdef1234567890abcdef12345678",
    "0x1111111111111111111111111111111111111111"
  );
}

const headers = { "content-type": "application/json", accept: "application/json" };
if (process.env.KYRO_API_KEY) headers.authorization = `Bearer ${process.env.KYRO_API_KEY}`;

const response = await fetch(`${API_ORIGIN}/api/v1/decision/batch`, {
  method: "POST",
  headers,
  body: JSON.stringify({ inputs, useCase: "payment" })
});
const payload = await response.json();

if (!payload.ok) {
  console.error(`Request failed (${response.status}): ${payload.error?.code ?? "unknown"} ${payload.error?.message ?? ""}`);
  process.exit(1);
}

const data = payload.data;
console.log(`Use case ${data.useCase} · ${data.decisionModelVersion}`);
for (const row of data.results) {
  if (row.status === "ok") {
    console.log(`  ${row.input}  ${String(row.decision).toUpperCase()} (score ${row.score ?? "n/a"})`);
  } else {
    console.log(`  ${row.input}  ${row.status}${row.note ? ` - ${row.note}` : ""}`);
  }
}
console.log("Summary:", JSON.stringify(data.summary));
