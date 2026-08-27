"use client";

import { useEffect, useRef, useState } from "react";
import { InteractionGraphCard } from "@/components/InteractionGraphCard";
import type { InteractionGraphPeerEdge } from "@/components/InteractionGraphVisual";
import type { InteractionGraph } from "@/lib/types";

type InteractionGraphLiveCardProps = {
  wallet: string;
  initialGraph?: InteractionGraph | null;
  /** Transaction-verified peer↔peer trust edges for the same wallet, if the caller has them. */
  peerEdges?: InteractionGraphPeerEdge[] | null;
  refreshKey?: string | null;
  title?: string;
  description?: string;
  variant?: "dashboard" | "public";
};

function mergePages(current: InteractionGraph, next: InteractionGraph): InteractionGraph {
  const nodes = new Map(current.nodes.map((node) => [node.walletAddress, node]));
  for (const node of next.nodes) nodes.set(node.walletAddress, node);
  const mergedNodes = Array.from(nodes.values());
  return {
    ...next,
    nodes: mergedNodes,
    summary: {
      ...next.summary,
      returnedCounterparties: mergedNodes.length,
      kyroProfilesOnPage: mergedNodes.filter((node) => node.registered).length
    }
  };
}

export function InteractionGraphLiveCard({
  wallet,
  initialGraph = null,
  peerEdges = null,
  refreshKey = null,
  title,
  description,
  variant
}: InteractionGraphLiveCardProps) {
  const requestRef = useRef(0);
  const [graph, setGraph] = useState<InteractionGraph | null>(initialGraph);
  const [loading, setLoading] = useState(!initialGraph);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  useEffect(() => {
    const fallback = graph?.walletAddress.toLowerCase() === wallet.toLowerCase() ? graph : null;
    const requestId = ++requestRef.current;
    setGraph(fallback);
    setLoading(!fallback);
    setError(null);
    setPageError(null);
    void (async () => {
      try {
        const response = await fetch(`/api/interaction-graph/${encodeURIComponent(wallet)}?limit=25`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Interaction graph request failed with ${response.status}.`);
        const next = await response.json() as InteractionGraph;
        if (requestRef.current === requestId && next.walletAddress.toLowerCase() === wallet.toLowerCase()) setGraph(next);
      } catch {
        if (requestRef.current === requestId && !fallback) setError("Saved interaction evidence is temporarily unavailable.");
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    })();
    return () => {
      requestRef.current += 1;
    };
    // refreshKey intentionally re-runs the database-only read after a saved
    // wallet index changes; it never starts a refresh or provider request.
  }, [wallet, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadMore() {
    if (!graph?.pagination.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setPageError(null);
    try {
      const params = new URLSearchParams({ limit: String(graph.pagination.limit), cursor: graph.pagination.nextCursor });
      const response = await fetch(`/api/interaction-graph/${encodeURIComponent(wallet)}?${params}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Interaction graph request failed with ${response.status}.`);
      const next = await response.json() as InteractionGraph;
      if (next.walletAddress.toLowerCase() !== wallet.toLowerCase()) throw new Error("Interaction graph wallet mismatch.");
      setGraph((current) => current ? mergePages(current, next) : next);
    } catch {
      setPageError("Could not load the next saved page. The counterparties already shown are unchanged.");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <InteractionGraphCard
      graph={graph}
      peerEdges={peerEdges}
      loading={loading}
      error={error ?? false}
      loadingMore={loadingMore}
      pageError={pageError}
      onLoadMore={graph?.pagination.hasMore ? loadMore : null}
      title={title}
      description={description}
      variant={variant}
    />
  );
}