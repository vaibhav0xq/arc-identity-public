import assert from "node:assert/strict";
import { Kyro, KyroApiError, KyroError, KyroRequestError } from "../../dist/index.js";

const calls = [];
const kyro = new Kyro({
  apiKey: "kyro_live_smoketest",
  fetch: async (url, init) => {
    calls.push({ url, init });
    return new Response(
      JSON.stringify({ ok: true, version: "v1", data: { wallet: "0xabc", cacheStatus: "cached" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  },
});

const score = await kyro.score.get(`0x${"ab".repeat(20)}`);
assert.equal(score.cacheStatus, "cached");
assert.ok(calls[0].url.startsWith("https://www.thekyro.co/api/v1/score/0x"));
assert.equal(new Headers(calls[0].init.headers).get("authorization"), "Bearer kyro_live_smoketest");

const apiError = new KyroApiError({
  code: "NOT_FOUND",
  message: "missing",
  status: 404,
  envelope: {},
  headers: new Headers(),
});
assert.ok(apiError instanceof KyroError);
assert.ok(new KyroRequestError("NETWORK", "boom") instanceof KyroError);

console.log("ESM dist smoke passed");
