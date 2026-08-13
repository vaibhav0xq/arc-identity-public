import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroApiError, KyroError, KyroRequestError } from "../src/index";
import { WALLET, errJson, mockFetch } from "./helpers";

test("a 429 carries retryAfterSeconds and rateLimit", async () => {
  const { fetch } = mockFetch(
    errJson("RATE_LIMITED", "Rate limit exceeded (20 requests per minute). Retry in 17s.", {
      status: 429,
      headers: {
        "Retry-After": "17",
        "X-RateLimit-Limit": "20",
        "X-RateLimit-Remaining": "0",
      },
    }),
  );
  try {
    await new Kyro({ fetch }).decisions.check(WALLET);
    assert.fail("expected a KyroApiError");
  } catch (error) {
    assert.ok(error instanceof KyroApiError);
    assert.equal(error.code, "RATE_LIMITED");
    assert.equal(error.status, 429);
    assert.equal(error.retryAfterSeconds, 17);
    assert.deepEqual(error.rateLimit, { limit: 20, remaining: 0 });
    assert.match(error.message, /Retry in 17s/);
  }
});

test("a 429 without Retry-After leaves retryAfterSeconds undefined", async () => {
  const { fetch } = mockFetch(errJson("RATE_LIMITED", "Slow down.", { status: 429 }));
  try {
    await new Kyro({ fetch }).score.get(WALLET);
    assert.fail("expected a KyroApiError");
  } catch (error) {
    assert.ok(error instanceof KyroApiError);
    assert.equal(error.retryAfterSeconds, undefined);
    assert.equal(error.rateLimit, undefined);
  }
});

test("the raw envelope and headers are exposed on KyroApiError", async () => {
  const { fetch } = mockFetch(
    errJson("NOT_FOUND", "No receipt with that id.", {
      status: 404,
      headers: { "X-RateLimit-Limit": "20" },
    }),
  );
  try {
    await new Kyro({ fetch }).receipts.get("rcp_Zt3kQ9wXb2LmNpQr");
    assert.fail("expected a KyroApiError");
  } catch (error) {
    assert.ok(error instanceof KyroApiError);
    assert.deepEqual(error.envelope, {
      ok: false,
      version: "v1",
      error: { code: "NOT_FOUND", message: "No receipt with that id." },
    });
    assert.equal(error.headers.get("x-ratelimit-limit"), "20");
  }
});

test("error classes keep clean instanceof chains and names", () => {
  const apiError = new KyroApiError({
    code: "NOT_FOUND",
    message: "missing",
    status: 404,
    envelope: {},
    headers: new Headers(),
  });
  assert.ok(apiError instanceof KyroApiError);
  assert.ok(apiError instanceof KyroError);
  assert.ok(apiError instanceof Error);
  assert.equal(apiError.name, "KyroApiError");

  const requestError = new KyroRequestError("NETWORK", "boom");
  assert.ok(requestError instanceof KyroRequestError);
  assert.ok(requestError instanceof KyroError);
  assert.equal(requestError.name, "KyroRequestError");
  assert.equal(requestError.status, undefined);
});

test("an error envelope missing its code throws BAD_RESPONSE, not KyroApiError", async () => {
  const body = new Response(JSON.stringify({ ok: false, version: "v1", error: { message: "??" } }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
  const { fetch } = mockFetch(body);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});

test("an error envelope with a non-string message throws BAD_RESPONSE", async () => {
  const body = new Response(
    JSON.stringify({ ok: false, version: "v1", error: { code: "INTERNAL", message: 7 } }),
    { status: 500, headers: { "content-type": "application/json" } },
  );
  const { fetch } = mockFetch(body);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});

test("an error envelope missing version throws BAD_RESPONSE", async () => {
  const body = new Response(
    JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "upstream hiccup" } }),
    { status: 500, headers: { "content-type": "application/json" } },
  );
  const { fetch } = mockFetch(body);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET),
    (error: unknown) => error instanceof KyroRequestError && error.code === "BAD_RESPONSE",
  );
});
