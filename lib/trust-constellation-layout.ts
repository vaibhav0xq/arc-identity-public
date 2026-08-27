import type { TrustEdge } from "@/lib/types";

/* Layout contract for the Trust constellation (components/TrustConstellation.tsx).
   Pure, deterministic functions only — everything here is unit-tested by
   scripts/test-trust-constellation.mjs, so any change to these rules is a
   deliberate drawing-behavior change, not a refactor. No randomness: node
   placement, orbit drift, particle seeds and peer-link selection must derive
   solely from the edge data so identical evidence always draws identically. */

export function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function clampWeight(weight: number) {
  return Number.isFinite(weight) ? Math.max(0, Math.min(100, weight)) : 0;
}

export function easeOut(p: number) {
  const t = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - t, 3);
}

export type Particle = { p: number; speed: number; dir: 1 | -1; size: number };

export type PeerSpec = {
  edge: TrustEdge;
  i: number;
  baseAngle: number;
  drift: number;
  phase: number;
  nodeR: number;
  risky: boolean;
  bow: number;
  particles: Particle[];
};

export function buildPeers(edges: TrustEdge[]): PeerSpec[] {
  const shown = [...edges].sort((a, b) => b.trustWeight - a.trustWeight).slice(0, 8);
  const n = shown.length;
  return shown.map((edge, i) => {
    const h = hashId(edge.id);
    const jitter = (h % 17) - 8;
    const count = Math.min(4, 1 + Math.floor(edge.interactionCount / 2));
    return {
      edge,
      i,
      baseAngle: ((-54 + (i * 360) / n + jitter) * Math.PI) / 180,
      drift: (0.016 + (h % 7) * 0.004) * (h % 2 ? 1 : -1),
      phase: (h % 628) / 100,
      nodeR: 14 + Math.min(6, edge.interactionCount * 1.1),
      risky: /high risk|anomaly|suspicious/i.test(edge.peerRiskLevel ?? ""),
      bow: (h % 2 ? 1 : -1) * (0.09 + (h % 5) * 0.02),
      particles: Array.from({ length: count }, (_, k) => ({
        p: (((h >> (k + 1)) % 97) / 97 + k / count) % 1,
        speed: 0.09 + (clampWeight(edge.trustWeight) / 100) * 0.14 + k * 0.015,
        dir: (edge.reciprocal && k % 2 === 1 ? -1 : 1) as 1 | -1,
        size: 1.5 + ((h >> k) % 3) * 0.5
      }))
    };
  });
}

/* A verified trust edge between two of the shown peers, deduped per pair.
   Drawn as a faint hairline thread so the circle reads as a real network. */
export type PeerLink = { aId: string; bId: string; shared: number; weight: number };

export function buildPeerLinks(peerEdges: TrustEdge[], peers: PeerSpec[]): PeerLink[] {
  if (peers.length < 2 || peerEdges.length === 0) return [];
  const idByWallet = new Map<string, string>();
  for (const peer of peers) {
    idByWallet.set((peer.edge.peerWallet ?? peer.edge.targetWallet).toLowerCase(), peer.edge.id);
  }
  const byPair = new Map<string, PeerLink>();
  for (const edge of peerEdges) {
    const aId = idByWallet.get(edge.sourceWallet.toLowerCase());
    const bId = idByWallet.get(edge.targetWallet.toLowerCase());
    if (!aId || !bId || aId === bId) continue;
    const key = aId < bId ? `${aId}|${bId}` : `${bId}|${aId}`;
    const shared = Math.max(0, edge.sharedCounterpartyCount);
    const weight = clampWeight(edge.trustWeight);
    const prev = byPair.get(key);
    if (prev) {
      /* A pair can appear twice (A to B and B to A); keep the strongest reading. */
      prev.shared = Math.max(prev.shared, shared);
      prev.weight = Math.max(prev.weight, weight);
    } else {
      byPair.set(key, { aId, bId, shared, weight });
    }
  }
  /* Cap minor links so a dense circle stays readable; strongest pairs win. */
  return Array.from(byPair.values())
    .sort((a, b) => (b.shared - a.shared) || (b.weight - a.weight))
    .slice(0, 12);
}
