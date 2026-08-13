const assert = require("node:assert/strict");
const { Kyro, KyroApiError, KyroError, KyroRequestError } = require("../../dist/index.cjs");

(async () => {
  const calls = [];
  const kyro = new Kyro({
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(
        JSON.stringify({ ok: true, version: "v1", data: { verdict: "allow" } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });

  const decision = await kyro.decisions.check(`0x${"ab".repeat(20)}`, { useCase: "payment" });
  assert.equal(decision.verdict, "allow");
  assert.ok(calls[0].url.endsWith("?useCase=payment"));
  assert.equal(new Headers(calls[0].init.headers).get("authorization"), null);

  const apiError = new KyroApiError({
    code: "RATE_LIMITED",
    message: "slow down",
    status: 429,
    envelope: {},
    headers: new Headers(),
  });
  assert.ok(apiError instanceof KyroError);
  assert.ok(new KyroRequestError("TIMEOUT", "too slow") instanceof KyroError);

  console.log("CJS dist smoke passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
