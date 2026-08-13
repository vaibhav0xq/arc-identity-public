import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroApiError } from "../src/index";
import { WALLET, errJson, headerOf, mockFetch, okJson } from "./helpers";

test("check builds the decision URL with useCase only when passed", async () => {
  const withCase = mockFetch(okJson({ verdict: "allow" }));
  await new Kyro({ fetch: withCase.fetch }).decisions.check(WALLET, { useCase: "escrow" });
  assert.equal(
    withCase.calls[0]!.url,
    `https://www.thekyro.co/api/v1/decision/${WALLET}?useCase=escrow`,
  );
  assert.equal(withCase.calls[0]!.init.method, "GET");

  const without = mockFetch(okJson({ verdict: "allow" }));
  await new Kyro({ fetch: without.fetch }).decisions.check(WALLET);
  assert.equal(without.calls[0]!.url, `https://www.thekyro.co/api/v1/decision/${WALLET}`);
});

test("batch posts the body verbatim", async () => {
  const { fetch, calls } = mockFetch(okJson({ summary: {}, results: [] }));
  const inputs = [WALLET, "amara.kyro", " padded.kyro "];
  await new Kyro({ fetch }).decisions.batch(inputs, { useCase: "payment" });
  assert.equal(calls[0]!.url, "https://www.thekyro.co/api/v1/decision/batch");
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(headerOf(calls[0]!.init, "content-type"), "application/json");
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), {
    inputs: [WALLET, "amara.kyro", " padded.kyro "],
    useCase: "payment",
  });
});

test("batch omits useCase from the body when not passed", async () => {
  const { fetch, calls } = mockFetch(okJson({ summary: {}, results: [] }));
  await new Kyro({ fetch }).decisions.batch([WALLET]);
  assert.deepEqual(JSON.parse(calls[0]!.init.body as string), { inputs: [WALLET] });
});

test("batch returns the summary and mixed-outcome rows untouched", async () => {
  const payload = {
    useCase: "payment",
    decisionModelVersion: "decision_v0.4.1",
    summary: { total: 3, allow: 1, caution: 0, block: 0, noScore: 1, invalid: 1, error: 0 },
    results: [
      { input: WALLET, wallet: WALLET, status: "ok", verdict: "allow" },
      { input: "0x1111111111111111111111111111111111111111", status: "no_score" },
      { input: "not-a-wallet", status: "invalid" },
    ],
  };
  const { fetch } = mockFetch(okJson(payload));
  const result = await new Kyro({ fetch }).decisions.batch([WALLET, "0x1111111111111111111111111111111111111111", "not-a-wallet"]);
  assert.deepEqual(result, payload);
});

test("a plan cap rejection passes through as KyroApiError INVALID_REQUEST", async () => {
  const message =
    "Batch is limited to 10 unique entries for anonymous callers (50 or more with an API key).";
  const { fetch } = mockFetch(errJson("INVALID_REQUEST", message, { status: 400 }));
  await assert.rejects(
    new Kyro({ fetch }).decisions.batch(Array.from({ length: 11 }, (_, i) => `wallet${i}.kyro`)),
    (error: unknown) =>
      error instanceof KyroApiError &&
      error.code === "INVALID_REQUEST" &&
      error.message === message,
  );
});

test("batch validates inputs before any network call", async () => {
  const { fetch, calls } = mockFetch();
  const kyro = new Kyro({ fetch });
  await assert.rejects(kyro.decisions.batch([]), TypeError);
  await assert.rejects(kyro.decisions.batch(["ok.kyro", "  "]), TypeError);
  // @ts-expect-error runtime guard against non-string entries
  await assert.rejects(kyro.decisions.batch([42]), TypeError);
  assert.equal(calls.length, 0);
});
