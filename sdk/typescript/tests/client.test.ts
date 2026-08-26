import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroApiError, KyroError, KyroRequestError } from "../src/index";
import { WALLET, errJson, headerOf, mockFetch, okJson } from "./helpers";

test("sends the Authorization header exactly when apiKey is set", async () => {
  const keyed = mockFetch(okJson({ wallet: WALLET }));
  await new Kyro({ apiKey: "kyro_live_testkey", fetch: keyed.fetch }).score.get(WALLET);
  assert.equal(headerOf(keyed.calls[0]!.init, "authorization"), "Bearer kyro_live_testkey");

  const anonymous = mockFetch(okJson({ wallet: WALLET }));
  await new Kyro({ fetch: anonymous.fetch }).score.get(WALLET);
  assert.equal(headerOf(anonymous.calls[0]!.init, "authorization"), null);
});

test("rejects an empty apiKey instead of silently downgrading to anonymous", () => {
  assert.throws(() => new Kyro({ apiKey: "" }), TypeError);
  assert.throws(() => new Kyro({ apiKey: "   " }), TypeError);
});

test("throws KyroError when no fetch implementation exists", () => {
  const saved = globalThis.fetch;
  // @ts-expect-error simulating a runtime without fetch
  delete globalThis.fetch;
  try {
    assert.throws(() => new Kyro(), KyroError);
  } finally {
    globalThis.fetch = saved;
  }
});

test("normalizes trailing slashes in baseUrl", async () => {
  const { fetch, calls } = mockFetch(okJson({}));
  await new Kyro({ baseUrl: "https://example.test///", fetch }).score.get(WALLET);
  assert.equal(calls[0]!.url, `https://example.test/api/v1/score/${WALLET}`);
});

test("rejects an invalid baseUrl", () => {
  assert.throws(() => new Kyro({ baseUrl: "not a url" }), TypeError);
  assert.throws(() => new Kyro({ baseUrl: "ftp://example.test" }), TypeError);
});

test("encodes path segments", async () => {
  const { fetch, calls } = mockFetch(okJson({}));
  await new Kyro({ fetch }).profile.get("weird name.kyro");
  assert.equal(calls[0]!.url, "https://www.thekyro.co/api/v1/profile/weird%20name.kyro");
});

test("interaction graph resource sends pagination query parameters", async () => {
  const { fetch, calls } = mockFetch(okJson({ wallet: WALLET, interactionGraph: {} }));
  await new Kyro({ fetch }).interactionGraph.get(WALLET, { limit: 40, cursor: "next page/+==" });
  assert.equal(
    calls[0]!.url,
    `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}?limit=40&cursor=next+page%2F%2B%3D%3D`,
  );
});

test("rejects empty path segment values", async () => {
  const { fetch } = mockFetch();
  const kyro = new Kyro({ fetch });
  await assert.rejects(kyro.score.get(""), TypeError);
  await assert.rejects(kyro.profile.get("   "), TypeError);
  await assert.rejects(kyro.interactionGraph.get(""), TypeError);
});

test("unwraps the success envelope and returns data", async () => {
  const payload = { wallet: WALLET, cacheStatus: "cached", score: 61 };
  const { fetch } = mockFetch(okJson(payload));
  const data = await new Kyro({ fetch }).score.get(WALLET);
  assert.deepEqual(data, payload);
});

test("an ok:false envelope with HTTP 200 still throws KyroApiError", async () => {
  const { fetch } = mockFetch(errJson("INTERNAL", "upstream hiccup", { status: 200 }));
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroApiError && error.code === "INTERNAL" && error.status === 200,
  );
});

test("a non-JSON body throws BAD_RESPONSE with the HTTP status", async () => {
  const { fetch } = mockFetch(new Response("<html>gateway error</html>", { status: 502 }));
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroRequestError && error.code === "BAD_RESPONSE" && error.status === 502,
  );
});

test("a success envelope without data throws BAD_RESPONSE", async () => {
  const body = new Response(JSON.stringify({ ok: true, version: "v1" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const { fetch } = mockFetch(body);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});

test("a success envelope on a non-2xx status throws BAD_RESPONSE", async () => {
  const { fetch } = mockFetch(okJson({ wallet: WALLET }, { status: 500 }));
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});

test("a valid error envelope on HTTP 500 throws KyroApiError INTERNAL", async () => {
  const { fetch } = mockFetch(errJson("INTERNAL", "Temporary server error.", { status: 500 }));
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroApiError && error.code === "INTERNAL" && error.status === 500,
  );
});

test("onRateLimit fires with parsed header values", async () => {
  const events: unknown[] = [];
  const { fetch } = mockFetch(
    okJson({}, { headers: { "X-RateLimit-Limit": "120", "X-RateLimit-Remaining": "97" } }),
  );
  await new Kyro({ fetch, onRateLimit: (event) => events.push(event) }).score.get(WALLET);
  assert.deepEqual(events, [
    { limit: 120, remaining: 97, path: `/api/v1/score/${WALLET}`, status: 200 },
  ]);
});

test("onRateLimit stays quiet when no rate headers arrive", async () => {
  const events: unknown[] = [];
  const { fetch } = mockFetch(okJson({}));
  await new Kyro({ fetch, onRateLimit: (event) => events.push(event) }).score.get(WALLET);
  assert.equal(events.length, 0);
});

test("the API key never leaks into thrown errors", async () => {
  const key = "kyro_live_supersecretvalue";
  const { fetch } = mockFetch(errJson("RATE_LIMITED", "Rate limit exceeded.", { status: 429 }));
  try {
    await new Kyro({ apiKey: key, fetch }).score.get(WALLET);
    assert.fail("expected a KyroApiError");
  } catch (error) {
    assert.ok(error instanceof KyroApiError);
    assert.ok(!error.message.includes(key));
    assert.ok(!JSON.stringify(error).includes(key));
    assert.ok(!JSON.stringify(error.envelope).includes(key));
  }
});

test("the low-level request escape hatch returns status, headers and rateLimit", async () => {
  const { fetch } = mockFetch(
    okJson({ wallet: WALLET }, { headers: { "X-RateLimit-Limit": "20", "X-RateLimit-Remaining": "19" } }),
  );
  const kyro = new Kyro({ fetch });
  const result = await kyro.request<{ wallet: string }>("GET", `/api/v1/score/${WALLET}`);
  assert.equal(result.status, 200);
  assert.equal(result.data.wallet, WALLET);
  assert.deepEqual(result.rateLimit, { limit: 20, remaining: 19 });
  assert.ok(result.headers instanceof Headers);
});

test("request rejects a path that does not start with a slash", async () => {
  const { fetch } = mockFetch();
  await assert.rejects(new Kyro({ fetch }).request("GET", "api/v1/score/0xabc"), TypeError);
});

test("a success envelope missing version throws BAD_RESPONSE", async () => {
  const body = new Response(JSON.stringify({ ok: true, data: { wallet: WALLET } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
  const { fetch } = mockFetch(body);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});

test("request merges query options into a path that already has a query", async () => {
  const { fetch, calls } = mockFetch(okJson({}));
  await new Kyro({ fetch }).request("GET", `/api/v1/decision/${WALLET}?useCase=payment`, {
    query: { other: "1" },
  });
  assert.equal(
    calls[0]!.url,
    `https://www.thekyro.co/api/v1/decision/${WALLET}?useCase=payment&other=1`,
  );
});

test("refuses to send an API key over plain http", () => {
  assert.throws(
    () => new Kyro({ apiKey: "kyro_live_testkey", baseUrl: "http://api.example.test" }),
    (error: unknown) => error instanceof TypeError && /plain http/.test((error as TypeError).message),
  );
});

test("allows an API key over http on loopback hosts", async () => {
  for (const baseUrl of ["http://localhost:3000", "http://127.0.0.1:5000", "http://[::1]:8080"]) {
    const { fetch, calls } = mockFetch(okJson({ wallet: WALLET }));
    await new Kyro({ apiKey: "kyro_live_testkey", baseUrl, fetch }).score.get(WALLET);
    assert.equal(headerOf(calls[0]!.init, "authorization"), "Bearer kyro_live_testkey");
  }
});

test("allows anonymous clients over plain http", async () => {
  const { fetch, calls } = mockFetch(okJson({ wallet: WALLET }));
  await new Kyro({ baseUrl: "http://api.example.test", fetch }).score.get(WALLET);
  assert.equal(calls[0]!.url, `http://api.example.test/api/v1/score/${WALLET}`);
});

test("allows an API key over https", async () => {
  const { fetch } = mockFetch(okJson({ wallet: WALLET }));
  await new Kyro({ apiKey: "kyro_live_testkey", baseUrl: "https://api.example.test", fetch }).score.get(WALLET);
});
