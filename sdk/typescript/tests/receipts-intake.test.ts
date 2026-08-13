import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroApiError } from "../src/index";
import { WALLET, errJson, headerOf, mockFetch, okJson } from "./helpers";

test("receipts.create posts a wallet body", async () => {
  const { fetch, calls } = mockFetch(
    okJson({ receipt: { id: "rcp_Zt3kQ9wXb2LmNpQr" }, url: "/check/r/rcp_Zt3kQ9wXb2LmNpQr", deduped: false }),
  );
  const result = await new Kyro({ fetch }).receipts.create({ wallet: `  ${WALLET}  `, useCase: "escrow" });
  assert.equal(calls[0]!.url, "https://www.thekyro.co/api/v1/decision-receipts");
  assert.equal(calls[0]!.init.method, "POST");
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { wallet: WALLET, useCase: "escrow" });
  assert.equal(result.deduped, false);
});

test("receipts.create posts a username body", async () => {
  const { fetch, calls } = mockFetch(
    okJson({ receipt: { id: "rcp_Zt3kQ9wXb2LmNpQr" }, url: "/check/r/rcp_Zt3kQ9wXb2LmNpQr", deduped: true }),
  );
  await new Kyro({ fetch }).receipts.create({ username: "amara.kyro" });
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { username: "amara.kyro" });
});

test("receipts.create requires exactly one of wallet or username", async () => {
  const { fetch, calls } = mockFetch();
  const kyro = new Kyro({ fetch });
  // @ts-expect-error runtime guard: both provided
  await assert.rejects(kyro.receipts.create({ wallet: WALLET, username: "amara.kyro" }), TypeError);
  // @ts-expect-error runtime guard: neither provided
  await assert.rejects(kyro.receipts.create({}), TypeError);
  await assert.rejects(kyro.receipts.create({ wallet: "   " }), TypeError);
  assert.equal(calls.length, 0);
});

test("receipts.get reads by id with encoding", async () => {
  const { fetch, calls } = mockFetch(okJson({ receipt: { id: "rcp_Zt3kQ9wXb2LmNpQr" } }));
  const result = await new Kyro({ fetch }).receipts.get("rcp_Zt3kQ9wXb2LmNpQr");
  assert.equal(calls[0]!.url, "https://www.thekyro.co/api/v1/decision-receipts/rcp_Zt3kQ9wXb2LmNpQr");
  assert.equal(calls[0]!.init.method, "GET");
  assert.equal(result.receipt.id, "rcp_Zt3kQ9wXb2LmNpQr");
});

test("intake.start parses all three outcomes", async () => {
  const already = mockFetch(
    okJson({ wallet: WALLET, status: "already_indexed", lastIndexedAt: "2026-08-11T13:36:05.979Z" }),
  );
  const alreadyResult = await new Kyro({ fetch: already.fetch }).intake.start(WALLET);
  assert.equal(alreadyResult.status, "already_indexed");
  assert.equal(already.calls[0]!.init.method, "POST");
  assert.equal(already.calls[0]!.url, `https://www.thekyro.co/api/v1/intake/${WALLET}`);
  assert.equal(headerOf(already.calls[0]!.init, "content-type"), null);

  const started = mockFetch(okJson({ wallet: WALLET, status: "started" }, { status: 202 }));
  const startedResult = await new Kyro({ fetch: started.fetch }).intake.start(WALLET);
  assert.equal(startedResult.status, "started");

  const indexing = mockFetch(
    okJson({ wallet: WALLET, status: "indexing", startedAt: null }, { status: 202 }),
  );
  const indexingResult = await new Kyro({ fetch: indexing.fetch }).intake.start(WALLET);
  assert.equal(indexingResult.status, "indexing");
});

test("an intake cooldown 429 surfaces retryAfterSeconds", async () => {
  const { fetch } = mockFetch(
    errJson(
      "RATE_LIMITED",
      "This wallet already had an indexing attempt in the last 10 minutes and it did not commit. Retry in 493s.",
      { status: 429, headers: { "Retry-After": "493" } },
    ),
  );
  await assert.rejects(
    new Kyro({ fetch }).intake.start(WALLET),
    (error: unknown) =>
      error instanceof KyroApiError &&
      error.code === "RATE_LIMITED" &&
      error.retryAfterSeconds === 493,
  );
});
