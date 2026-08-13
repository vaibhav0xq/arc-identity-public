import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroRequestError } from "../src/index";
import { WALLET, mockFetch, okJson } from "./helpers";

function hangingFetch(onAbort?: () => void): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => {
          onAbort?.();
          reject(init.signal?.reason ?? new DOMException("This operation was aborted", "AbortError"));
        },
        { once: true },
      );
    })) as typeof fetch;
}

test("a timeout aborts the underlying request and throws TIMEOUT", async () => {
  let aborted = false;
  const kyro = new Kyro({ fetch: hangingFetch(() => (aborted = true)), timeoutMs: 25 });
  await assert.rejects(
    kyro.score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroRequestError &&
      error.code === "TIMEOUT" &&
      /25ms/.test(error.message),
  );
  assert.equal(aborted, true);
});

test("a per-call timeoutMs overrides the client default", async () => {
  const kyro = new Kyro({ fetch: hangingFetch(), timeoutMs: 60_000 });
  await assert.rejects(
    kyro.score.get(WALLET, { timeoutMs: 20 }),
    (error: unknown) => error instanceof KyroRequestError && error.code === "TIMEOUT",
  );
});

test("a caller abort surfaces the caller's reason, not TIMEOUT", async () => {
  const controller = new AbortController();
  const reason = new Error("caller cancelled");
  const kyro = new Kyro({ fetch: hangingFetch(), timeoutMs: 60_000 });
  setTimeout(() => controller.abort(reason), 10);
  await assert.rejects(
    kyro.score.get(WALLET, { signal: controller.signal }),
    (error: unknown) => error === reason,
  );
});

test("a pre-aborted signal rejects before any network call", async () => {
  const { fetch, calls } = mockFetch(okJson({}));
  const controller = new AbortController();
  const reason = new Error("already cancelled");
  controller.abort(reason);
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET, { signal: controller.signal }),
    (error: unknown) => error === reason,
  );
  assert.equal(calls.length, 0);
});

test("a network failure throws NETWORK with the cause preserved", async () => {
  const cause = new TypeError("fetch failed");
  const failing = (async () => {
    throw cause;
  }) as unknown as typeof fetch;
  await assert.rejects(
    new Kyro({ fetch: failing }).score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroRequestError && error.code === "NETWORK" && error.cause === cause,
  );
});

function stalledBodyFetch(): typeof fetch {
  return (async () =>
    new Response(new ReadableStream<Uint8Array>({ start() {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

test("a body that stalls after headers still honors the timeout", async () => {
  const kyro = new Kyro({ fetch: stalledBodyFetch(), timeoutMs: 30 });
  await assert.rejects(
    kyro.score.get(WALLET),
    (error: unknown) =>
      error instanceof KyroRequestError && error.code === "TIMEOUT" && error.status === 200,
  );
});

test("a caller abort during body read surfaces the caller's reason", async () => {
  const controller = new AbortController();
  const reason = new Error("caller cancelled mid-body");
  const kyro = new Kyro({ fetch: stalledBodyFetch(), timeoutMs: 60_000 });
  setTimeout(() => controller.abort(reason), 10);
  await assert.rejects(
    kyro.score.get(WALLET, { signal: controller.signal }),
    (error: unknown) => error === reason,
  );
});

test("invalid timeout values are rejected", async () => {
  assert.throws(() => new Kyro({ timeoutMs: 0 }), TypeError);
  assert.throws(() => new Kyro({ timeoutMs: -5 }), TypeError);
  const { fetch } = mockFetch(okJson({}));
  await assert.rejects(
    new Kyro({ fetch }).score.get(WALLET, { timeoutMs: Number.NaN }),
    TypeError,
  );
});
