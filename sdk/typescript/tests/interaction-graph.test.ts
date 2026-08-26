import { test } from "node:test";
import assert from "node:assert/strict";
import { Kyro, KyroApiError } from "../src/index";
import { WALLET, errJson, headerOf, mockFetch, okJson } from "./helpers";

const KEY = "kyro_live_testkey";

const GRAPH_DATA = {
  wallet: WALLET,
  interactionGraph: { status: "current", counterparties: [], pagination: { nextCursor: null } },
};

test("interactionGraph.get reads with no query params by default", async () => {
  const { fetch, calls } = mockFetch(okJson(GRAPH_DATA));
  const result = await new Kyro({ fetch }).interactionGraph.get(WALLET);
  assert.equal(calls[0]!.url, `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}`);
  assert.equal(calls[0]!.init.method, "GET");
  assert.equal(headerOf(calls[0]!.init, "authorization"), null);
  assert.deepEqual(result, GRAPH_DATA);
});

test("interactionGraph.get passes limit, cursor and sort", async () => {
  const { fetch, calls } = mockFetch(okJson(GRAPH_DATA), okJson(GRAPH_DATA));
  const kyro = new Kyro({ fetch });
  await kyro.interactionGraph.get(WALLET, { limit: 10, cursor: "abc" });
  assert.equal(
    calls[0]!.url,
    `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}?limit=10&cursor=abc`,
  );
  await kyro.interactionGraph.get(WALLET, { sort: "activity" });
  assert.equal(
    calls[1]!.url,
    `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}?sort=activity`,
  );
});

test("interactionGraph.get trims the wallet and rejects an empty one", async () => {
  const { fetch, calls } = mockFetch(okJson(GRAPH_DATA));
  const kyro = new Kyro({ fetch });
  await kyro.interactionGraph.get(`  ${WALLET}  `);
  assert.equal(calls[0]!.url, `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}`);
  await assert.rejects(kyro.interactionGraph.get("   "), TypeError);
  assert.equal(calls.length, 1);
});

test("interactionGraph.refresh posts with the API key and no body", async () => {
  const { fetch, calls } = mockFetch(
    okJson({
      wallet: WALLET,
      status: "fresh",
      lastIndexedAt: "2026-08-25T12:00:00.000Z",
      nextRefreshAt: "2026-08-25T13:00:00.000Z",
      retryAfterSeconds: 1799,
    }),
  );
  await new Kyro({ fetch, apiKey: KEY }).interactionGraph.refresh(`  ${WALLET}  `);
  assert.equal(calls[0]!.url, `https://www.thekyro.co/api/v1/interaction-graph/${WALLET}/refresh`);
  assert.equal(calls[0]!.init.method, "POST");
  assert.equal(headerOf(calls[0]!.init, "authorization"), `Bearer ${KEY}`);
  assert.equal(headerOf(calls[0]!.init, "content-type"), null);
  assert.equal(calls[0]!.init.body, undefined);
});

test("interactionGraph.refresh parses all three outcomes", async () => {
  const fresh = mockFetch(
    okJson({
      wallet: WALLET,
      status: "fresh",
      lastIndexedAt: "2026-08-25T12:00:00.000Z",
      nextRefreshAt: "2026-08-25T13:00:00.000Z",
      retryAfterSeconds: 1799,
    }),
  );
  const freshResult = await new Kyro({ fetch: fresh.fetch, apiKey: KEY }).interactionGraph.refresh(
    WALLET,
  );
  assert.equal(freshResult.status, "fresh");
  if (freshResult.status === "fresh") {
    assert.equal(freshResult.retryAfterSeconds, 1799);
    assert.equal(freshResult.nextRefreshAt, "2026-08-25T13:00:00.000Z");
  }

  const started = mockFetch(
    okJson({ wallet: WALLET, status: "started", mode: "reindex" }, { status: 202 }),
  );
  const startedResult = await new Kyro({
    fetch: started.fetch,
    apiKey: KEY,
  }).interactionGraph.refresh(WALLET);
  assert.equal(startedResult.status, "started");
  if (startedResult.status === "started") {
    assert.equal(startedResult.mode, "reindex");
  }

  const firstIndex = mockFetch(
    okJson({ wallet: WALLET, status: "started", mode: "first_index" }, { status: 202 }),
  );
  const firstIndexResult = await new Kyro({
    fetch: firstIndex.fetch,
    apiKey: KEY,
  }).interactionGraph.refresh(WALLET);
  if (firstIndexResult.status === "started") {
    assert.equal(firstIndexResult.mode, "first_index");
  } else {
    assert.fail(`expected started, got ${firstIndexResult.status}`);
  }

  const indexing = mockFetch(
    okJson({ wallet: WALLET, status: "indexing", startedAt: null }, { status: 202 }),
  );
  const indexingResult = await new Kyro({
    fetch: indexing.fetch,
    apiKey: KEY,
  }).interactionGraph.refresh(WALLET);
  assert.equal(indexingResult.status, "indexing");
});

test("an anonymous refresh surfaces 401 NOT_ALLOWED", async () => {
  const { fetch } = mockFetch(
    errJson("NOT_ALLOWED", "Refreshing a wallet's interaction graph requires an API key.", {
      status: 401,
    }),
  );
  await assert.rejects(
    new Kyro({ fetch }).interactionGraph.refresh(WALLET),
    (error: unknown) =>
      error instanceof KyroApiError && error.code === "NOT_ALLOWED" && error.status === 401,
  );
});

test("a refresh quota 429 surfaces retryAfterSeconds", async () => {
  const { fetch } = mockFetch(
    errJson("RATE_LIMITED", "Daily refresh quota reached.", {
      status: 429,
      headers: { "Retry-After": "600" },
    }),
  );
  await assert.rejects(
    new Kyro({ fetch, apiKey: KEY }).interactionGraph.refresh(WALLET),
    (error: unknown) =>
      error instanceof KyroApiError &&
      error.code === "RATE_LIMITED" &&
      error.retryAfterSeconds === 600,
  );
});

test("interactionGraph.refresh rejects an empty wallet without a request", async () => {
  const { fetch, calls } = mockFetch();
  await assert.rejects(new Kyro({ fetch, apiKey: KEY }).interactionGraph.refresh("   "), TypeError);
  assert.equal(calls.length, 0);
});
