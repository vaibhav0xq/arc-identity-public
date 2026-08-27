import type { TrustGraph } from "@/lib/types";

export type TrustGraphDisplaySource = "live" | "cached" | "unavailable";

export type TrustGraphDisplayState = {
  graph: TrustGraph | null;
  source: TrustGraphDisplaySource;
  observedAt: string | null;
};

function normalizedWallet(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

export function trustGraphBelongsToWallet(graph: TrustGraph | null | undefined, walletAddress: string) {
  const expectedWallet = normalizedWallet(walletAddress);
  return Boolean(graph && expectedWallet && normalizedWallet(graph.walletAddress) === expectedWallet);
}

export function unavailableTrustGraphDisplay(): TrustGraphDisplayState {
  return {
    graph: null,
    source: "unavailable",
    observedAt: null
  };
}

export function liveTrustGraphDisplay(graph: TrustGraph, observedAt = new Date().toISOString()): TrustGraphDisplayState {
  return {
    graph,
    source: "live",
    observedAt
  };
}

export function cachedTrustGraphDisplay(
  graph: TrustGraph | null | undefined,
  observedAt: string | null | undefined,
  walletAddress: string
): TrustGraphDisplayState {
  if (!trustGraphBelongsToWallet(graph, walletAddress)) return unavailableTrustGraphDisplay();
  return {
    graph: graph!,
    source: "cached",
    observedAt: observedAt ?? null
  };
}

export function resolveTrustGraphRefresh(
  liveGraph: TrustGraph | null | undefined,
  previous: TrustGraphDisplayState,
  walletAddress: string,
  observedAt = new Date().toISOString()
): TrustGraphDisplayState {
  // A graph with zero edges is still an authoritative successful response.
  // Only null/undefined means the live request failed.
  if (trustGraphBelongsToWallet(liveGraph, walletAddress)) return liveTrustGraphDisplay(liveGraph!, observedAt);
  return cachedTrustGraphDisplay(previous.graph, previous.observedAt, walletAddress);
}