"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { InteractionGraph, InteractionGraphNode } from "@/lib/types";
import { compareObservedActivity, isArcInteractionChain } from "@/lib/interaction-graph-contract";
import { collisionFreeAddressLabels, shortenAddress } from "@/lib/wallet";
import styles from "./InteractionGraphVisual.module.css";

/**
 * A verified peer-to-peer trust edge between two of the root's
 * counterparties, handed in by the caller from the trust graph API.
 * The visual NEVER infers these — no rows, no mesh (fail closed).
 */
export type InteractionGraphPeerEdge = {
  sourceWallet: string;
  targetWallet: string;
};

type InteractionGraphVisualProps = {
  graph: InteractionGraph;
  /** "You" for a wallet workspace, "Kyro identity" for public, "Checked wallet" for Playground. */
  rootLabel: string;
  /** Transaction-verified peer↔peer trust edges; drawn only between visible nodes. */
  peerEdges?: InteractionGraphPeerEdge[] | null;
  className?: string;
};

type InteractionGraphLedgerProps = {
  nodes: InteractionGraphNode[];
  className?: string;
};

type PositionedNode = {
  node: InteractionGraphNode;
  x: number;
  y: number;
};

type GraphLayout = {
  centerY: number;
  height: number;
};

/**
 * Physics registry entry: one per rendered counterparty per stage variant.
 * Each marker is a particle on a spring — the simulation integrates it
 * every frame, moves its SVG group, keeps its hairline edge attached, and
 * feeds the canvas light layer. Motion is symmetric around each node's
 * rest position and carries no semantic meaning.
 */
type DriftEntry = {
  address: string;
  group: SVGGElement | null;
  line: SVGPathElement | null;
  /** Cached elastic control point (viewBox units) shared by SVG + canvas. */
  cx: number;
  cy: number;
  /** Rest (home) position from the deterministic layout. */
  x: number;
  y: number;
  /** Simulated position + velocity (viewBox units). */
  px: number;
  py: number;
  vx: number;
  vy: number;
  /** Pointer pin while the user drags this marker; null when free. */
  drag: { x: number; y: number } | null;
  seed: number;
  phase: number;
  mobile: boolean;
  damp: number;
};

const CENTER_X = 497;
const MAX_VISUAL_NODES = 12;
const MOBILE_ROOT_X = 178;
const MOBILE_ROOT_Y = 262;

function stableSvgCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

/** Organic two-frequency float. Deterministic per seed; symmetric around rest. */
function driftOffset(t: number, seed: number, amp: number) {
  const phase = seed * 2.399963;
  return {
    x: Math.sin(t * 0.31 + phase * 3.1) * amp * 0.62 + Math.sin(t * 0.127 + phase * 1.7) * amp * 0.38,
    y: Math.cos(t * 0.26 + phase * 2.3) * amp * 0.56 + Math.cos(t * 0.104 + phase) * amp * 0.44
  };
}

/** Deterministic per-wallet seed: orientation-only identity, never a magnitude. */
function addressSeed(address: string) {
  let h = 0;
  for (let i = 0; i < address.length; i++) h = (h * 31 + address.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Arc segment path (fixed sweep; rotation carries the wallet's identity). */
function arcPathD(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  const a0 = (startDeg * Math.PI) / 180;
  const a1 = ((startDeg + sweepDeg) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  return `M ${stableSvgCoordinate(x0)} ${stableSvgCoordinate(y0)} A ${r} ${r} 0 ${sweepDeg > 180 ? 1 : 0} 1 ${stableSvgCoordinate(x1)} ${stableSvgCoordinate(y1)}`;
}

/**
 * Control point for the elastic thread between the root and a counterparty.
 * The bend is deterministic per node; velocity lag makes the rope bow
 * against motion so drags feel physical. Sag scales with the span by the
 * SAME law for every edge — short filaments hang taut, long ones drape —
 * so close nodes never grow hooks. Spans are authored composition, not
 * data: nothing here may read as strength, flow, or direction.
 */
function threadControl(rootX: number, rootY: number, x: number, y: number, seed: number, mobile: boolean, wobble: number, vx: number, vy: number) {
  const span = Math.hypot(x - rootX, y - rootY);
  const slack = mobile ? 1 : Math.min(1, Math.max(0.45, span / 320));
  const bend = (seed % 2 === 0 ? 1 : -1) * (mobile ? 34 : 34) * slack;
  return {
    x: (rootX + x) / 2 + (y - rootY) * (mobile ? 0.13 : 0.09) * slack - vx * 3,
    y: (rootY + y) / 2 + bend + wobble * slack - vy * 3
  };
}

/**
 * Monogram glyph for a counterparty medallion — the instrument register
 * shared with the trust constellation: every disc carries a face.
 * Registered wallets show their name's initial; observed wallets show
 * their first two address nibbles. Identity only — the same type size,
 * weight, and color role on every disc, never a count, category, or
 * magnitude.
 */
function glyphFor(node: InteractionGraphNode) {
  if (node.registered && node.username) return node.username.slice(0, 1).toUpperCase();
  return node.walletAddress.slice(2, 4).toUpperCase();
}

/**
 * Engraved instrument plate (canvas, source-over, drawn BEFORE the
 * additive light passes): concentric hairline rings, faint meridian
 * spokes, and a ticked outer bezel around the root — the machined-gauge
 * furniture transplanted from the trust instrument. Pure plate
 * engraving at fixed radii shared by every render: it encodes nothing.
 * The optional radar sweep is one uniform rotating sheen, identical
 * over every sector, so it can never single out a node or edge.
 */
function drawInstrumentGrid(
  ctx: CanvasRenderingContext2D,
  rootXpx: number, rootYpx: number, k: number, mobile: boolean, sweepT: number | null
) {
  const rootR = (mobile ? ROOT_R.mobile : ROOT_R.desktop) * k;
  const step = (mobile ? 38 : 46) * k;
  const r1 = rootR + step * 0.7;
  const rings = 5;
  const rOut = r1 + step * (rings - 1);
  ctx.lineWidth = 1;
  for (let i = 0; i < rings; i++) {
    ctx.beginPath();
    if (i === 0) ctx.setLineDash([2, 5]);
    ctx.arc(rootXpx, rootYpx, r1 + step * i, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(242,238,227,${i === rings - 1 ? 0.11 : 0.07})`;
    ctx.stroke();
    if (i === 0) ctx.setLineDash([]);
  }
  // Dotted perimeter ring — the instrument's outer beadwork.
  ctx.beginPath();
  ctx.setLineDash([1, 5]);
  ctx.arc(rootXpx, rootYpx, rOut + 16 * k, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(242,238,227,0.14)";
  ctx.stroke();
  ctx.setLineDash([]);
  // Meridian spokes, hairline-faint.
  ctx.strokeStyle = "rgba(242,238,227,0.04)";
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6 + Math.PI / 12;
    ctx.beginPath();
    ctx.moveTo(rootXpx + Math.cos(a) * (rootR + 10 * k), rootYpx + Math.sin(a) * (rootR + 10 * k));
    ctx.lineTo(rootXpx + Math.cos(a) * (rOut + 30 * k), rootYpx + Math.sin(a) * (rOut + 30 * k));
    ctx.stroke();
  }
  // Micro-graduation ticks on the third ring — machined, not decorative.
  const tickR = r1 + step * 2;
  ctx.strokeStyle = "rgba(242,238,227,0.1)";
  for (let i = 0; i < 96; i++) {
    const a = (i * Math.PI * 2) / 96;
    const len = (i % 8 === 0 ? 4.5 : 2.2) * Math.max(k, 0.5);
    ctx.beginPath();
    ctx.moveTo(rootXpx + Math.cos(a) * tickR, rootYpx + Math.sin(a) * tickR);
    ctx.lineTo(rootXpx + Math.cos(a) * (tickR + len), rootYpx + Math.sin(a) * (tickR + len));
    ctx.stroke();
  }
  if (sweepT !== null && "createConicGradient" in ctx) {
    const bezelR = rOut + 16 * k;
    const sweepA = ((sweepT * Math.PI * 2) / 13) % (Math.PI * 2);
    const cg = ctx.createConicGradient(sweepA - 0.85, rootXpx, rootYpx);
    cg.addColorStop(0, `rgba(${GOLD_RGB},0)`);
    cg.addColorStop(0.115, `rgba(${GOLD_RGB},0.11)`);
    cg.addColorStop(0.135, `rgba(${GOLD_RGB},0)`);
    cg.addColorStop(1, `rgba(${GOLD_RGB},0)`);
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.moveTo(rootXpx, rootYpx);
    ctx.arc(rootXpx, rootYpx, bezelR, sweepA - 0.88, sweepA + 0.04);
    ctx.closePath();
    ctx.fill();
    // Leading-edge graduation arc rides just behind the sweep head.
    ctx.beginPath();
    ctx.setLineDash([2, 4]);
    ctx.arc(rootXpx, rootYpx, tickR + step * 0.5, sweepA - 0.6, sweepA + 0.02);
    ctx.strokeStyle = `rgba(${GOLD_RGB},0.22)`;
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

/** Point at t along a quadratic curve — shared by the hub-faded thread strokes. */
function quadPoint(t: number, x0: number, y0: number, cx: number, cy: number, x1: number, y1: number) {
  const u = 1 - t;
  return {
    x: u * u * x0 + 2 * u * t * cx + t * t * x1,
    y: u * u * y0 + 2 * u * t * cy + t * t * y1
  };
}

/**
 * Root dial radius (viewBox units): a COMPACT precision medallion like
 * the trust instrument's "You" hub — never a giant hub plate that digs
 * a black hole into the field.
 */
const ROOT_R = { desktop: 40, mobile: 33 };

/**
 * Hub occlusion radius (viewBox units): thread roots fade only in the
 * thin band where they duck behind the dial's bezel, so ribbons emerge
 * crisply from the root ring. Smaller than any node's rest distance
 * from the root, so EVERY edge leaves the zone and carries the same
 * full-strength body — a spatial lighting field, never a per-edge
 * ramp. Direction, flow, and strength must stay unreadable here.
 */
const HUB_FADE_R = { desktop: 52, mobile: 42 };

/**
 * Thread stroke with the hub occlusion zone (canvas): constant width
 * and light along the whole filament, fading only where it crosses the
 * dial's hub zone. No ramp runs along the edge and both endpoints get
 * identical treatment, so twelve threads never knot into a star at the
 * centre — and nothing reads as flow toward or away from anyone.
 */
function strokeHubFadedThread(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, cx: number, cy: number, x1: number, y1: number,
  hubFadePx: number, rgb: string, alpha: number, width: number
) {
  const SEGS = 14;
  let prev = { x: x0, y: y0 };
  for (let s = 1; s <= SEGS; s++) {
    const t = s / SEGS;
    const pt = quadPoint(t, x0, y0, cx, cy, x1, y1);
    const midX = (prev.x + pt.x) / 2;
    const midY = (prev.y + pt.y) / 2;
    const d = Math.hypot(midX - x0, midY - y0);
    const f0 = hubFadePx > 0 ? Math.min(1, d / hubFadePx) : 1;
    const f = f0 * f0 * (3 - 2 * f0);
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.strokeStyle = `rgba(${rgb},${(alpha * (0.08 + 0.92 * f)).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.4, width * (0.25 + 0.75 * f));
    ctx.stroke();
    prev = pt;
  }
}

/**
 * Endpoint light beads: the SAME bead at both ends of every thread,
 * seated just outside each endpoint's rim. The root-side bead sits at
 * the dial's edge (inside the hub fade zone), but it is always drawn —
 * identical treatment at both endpoints, identical on every edge, so a
 * bead can never read as direction, flow, or strength. Crisp discs
 * only: a lamp at instrument scale, not a glow pool.
 */
function drawEndpointBeads(
  ctx: CanvasRenderingContext2D,
  x0: number, y0: number, cx: number, cy: number, x1: number, y1: number,
  rootRimPx: number, nodeRimPx: number, alpha: number, k: number
) {
  const one = (ex: number, ey: number, towardX: number, towardY: number, rimPx: number) => {
    const dx = towardX - ex;
    const dy = towardY - ey;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.001) return;
    const bx = ex + (dx / dist) * rimPx;
    const by = ey + (dy / dist) * rimPx;
    const haloR = 2.2 * Math.max(k, 0.5) + 0.6;
    ctx.beginPath();
    ctx.fillStyle = `rgba(${GOLD_RGB},${(alpha * 0.3).toFixed(3)})`;
    ctx.arc(bx, by, haloR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,240,206,${Math.min(1, alpha * 1.15).toFixed(3)})`;
    ctx.arc(bx, by, Math.max(0.9, 1.05 * k), 0, Math.PI * 2);
    ctx.fill();
  };
  one(x1, y1, cx, cy, nodeRimPx);
  one(x0, y0, cx, cy, rootRimPx);
}

const GOLD_RGB = "201,162,94";
/** Peer-mesh hue: bone-silver — a categorical split from the gold root
 * threads (different evidence CLASS: verified trust vs observed
 * interaction), uniform across every peer link. */
const PEER_RGB = "214,204,170";

/** One path of radial tick marks around (cx,cy) — flat instrument furniture. */
function ringTicksPath(cx: number, cy: number, r: number, count: number, len: number) {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    parts.push(
      `M ${stableSvgCoordinate(cx + Math.cos(a) * r)} ${stableSvgCoordinate(cy + Math.sin(a) * r)} L ${stableSvgCoordinate(cx + Math.cos(a) * (r + len))} ${stableSvgCoordinate(cy + Math.sin(a) * (r + len))}`
    );
  }
  return parts.join(" ");
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="1" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

function ExternalIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

/**
 * SVG materials for the light stage: every counterparty is a reticle —
 * a crisp hairline ring with one small lit center. All glow lives in
 * the additive canvas engine below the SVG; the only SVG gradients are
 * the root's tight aura and the shared hub-occlusion thread gradient.
 * Identical marks on every node, so material can never read as count,
 * strength, or quality.
 */
function StageMaterialDefs({ prefix, rootX, rootY, hubR }: { prefix: string; rootX: number; rootY: number; hubR: number }) {
  return (
    <>
      <radialGradient id={`${prefix}-aura`}>
        <stop offset="0%" stopColor="rgba(201,162,94,0.16)" />
        <stop offset="55%" stopColor="rgba(201,162,94,0.05)" />
        <stop offset="100%" stopColor="rgba(201,162,94,0)" />
      </radialGradient>
      {/*
       * Hub occlusion for the SVG hairlines: a root-centred radial
       * gradient whose radius IS the hub fade zone. Beyond it the last
       * stop clamps, so every edge carries the SAME constant brightness
       * everywhere outside the dial's hub zone — no distance-dependent
       * arrival, no along-edge ramp. Purely the hub swallowing thread
       * roots, identical for all edges, direction-correct mid-drag.
       */}
      <radialGradient id={`${prefix}-thread`} gradientUnits="userSpaceOnUse" cx={rootX} cy={rootY} r={hubR}>
        <stop offset="0%" stopColor="rgba(201,162,94,0.06)" />
        <stop offset="55%" stopColor="rgba(203,167,102,0.3)" />
        <stop offset="100%" stopColor="rgba(210,182,128,0.72)" />
      </radialGradient>
      {/* Shared machined dome: ONE rest material for every entity disc. */}
      <radialGradient id={`${prefix}-dome`} cx="35%" cy="32%" r="82%">
        <stop offset="0%" stopColor="#474c45" />
        <stop offset="100%" stopColor="#343833" />
      </radialGradient>
      {/* Attention flips the dome to bone — the instrument's active material. */}
      <radialGradient id={`${prefix}-domeActive`} cx="35%" cy="32%" r="82%">
        <stop offset="0%" stopColor="#faf7ee" />
        <stop offset="100%" stopColor="#e6e0cf" />
      </radialGradient>
    </>
  );
}

function observedNodes(nodes: InteractionGraphNode[]) {
  const addresses = new Set<string>();
  return nodes.filter((node) => {
    const address = node.walletAddress.toLowerCase();
    if (addresses.has(address)) return false;
    addresses.add(address);
    return true;
  });
}

function graphLayout(nodeCount: number): GraphLayout {
  return { centerY: nodeCount > 7 ? 250 : 242, height: nodeCount > 7 ? 500 : 466 };
}

function positionDesktopNodes(nodes: InteractionGraphNode[], layout: GraphLayout): PositionedNode[] {
  /*
   * Tight ring in the 1000-unit field: hub-to-node runs stay short
   * (~146-380 units) so threads read as taut filaments, and the whole
   * instrument renders larger inside the same card. Constraints (all
   * include drift and label height):
   * - frame margins: x in [79,921], y in [72,417];
   * - full-width dock (hint panel bottom-right, left edge ≈ x556): points
   *   with x>600 keep y ≤ 330; bottom band y>367 keeps label RIGHT edges
   *   ≤ ~545, i.e. centers ≤ ~480 for 14-char chips;
   * - label collision: pairs need Δx ≥ ~175 or Δy ≥ ~48 (chip widths are
   *   viewBox-unit sized, so thresholds did NOT shrink with the field).
   */
  const stagePoints = [[229, 132], [404, 90], [607, 97], [785, 138], [877, 226], [818, 322], [466, 388], [288, 398], [189, 340], [139, 222], [314, 181], [685, 193]];
  return nodes.map((node, index) => {
    const point = stagePoints[index]!;
    return { node, x: point[0]!, y: stableSvgCoordinate(point[1]! + (layout.centerY === 242 ? -12 : 0)) };
  });
}

function positionMobileNodes(nodes: InteractionGraphNode[]): PositionedNode[] {
  /* Pulled in from the frame edges so r26/30 coins + drift never clip. */
  const stagePoints = [[66, 110], [192, 70], [300, 158], [294, 348], [222, 434], [74, 432], [54, 314], [128, 378], [298, 88], [60, 196], [282, 242], [150, 472]];
  return nodes.map((node, index) => ({ node, x: stagePoints[index]![0]!, y: stagePoints[index]![1]! }));
}

function nodeLabel(node: InteractionGraphNode, labels?: Map<string, string>) {
  return node.username || labels?.get(node.walletAddress.toLowerCase()) || shortenAddress(node.walletAddress);
}

function visualNodeLabel(node: InteractionGraphNode, labels?: Map<string, string>) {
  const label = nodeLabel(node, labels);
  /* Only usernames get ellipsized: an address label is already the
     minimal unique form — truncating it could re-collide two wallets
     the collision widening just separated. */
  if (!node.username || label.length <= 16) return label;
  return `${label.slice(0, 15)}…`;
}

function rootLabelLines(label: string) {
  const words = label.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return words;
  return [words[0]!, words.slice(1).join(" ")];
}

function nodeDescription(node: InteractionGraphNode) {
  const signals = [
    node.registered ? "registered Kyro profile" : "observed wallet",
    node.chains.length > 1 ? `present on ${node.chains.length} observed chains` : "present on one observed chain",
    node.verifiedKyroPeer ? "verified Kyro peer overlay" : null
  ].filter(Boolean);
  return signals.join(", ");
}

function CopyAddressButton({
  address,
  copied,
  onCopy
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <button type="button" onClick={onCopy} className="arc-button-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold">
      <CopyIcon />
      {copied ? "Address copied" : "Copy address"}
    </button>
  );
}

function ExplorerActions({ node, label }: { node: InteractionGraphNode; label?: string }) {
  const explorerChains = node.chains.filter((chain) => chain.explorerUrl);
  if (!explorerChains.length) return null;

  return (
    <>
      {explorerChains.map((chain) => (
        <a
          key={`${chain.chain}-${chain.chainId}`}
          href={chain.explorerUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="arc-button-secondary inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold"
          aria-label={`Open ${label ?? nodeLabel(node)} on ${chain.chain} explorer`}
        >
          {chain.chain}
          <ExternalIcon />
        </a>
      ))}
    </>
  );
}

function CounterpartyNode({
  item,
  index,
  selected,
  hovered,
  dimmed,
  detailId,
  onSelect,
  onHover,
  nodeRef,
  labelClamp,
  mobile,
  paintPrefix,
  plateAbove,
  labels,
  dragProps
}: {
  item: PositionedNode;
  index: number;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  detailId: string;
  onSelect: (node: InteractionGraphNode) => void;
  onHover: (node: InteractionGraphNode | null) => void;
  nodeRef?: (element: SVGGElement | null) => void;
  /** Keeps centered labels inside narrow stages without moving the marker. */
  labelClamp?: { min: number; max: number };
  mobile?: boolean;
  /** Defs id prefix for the shared dome gradients (url(#<prefix>-dome)). */
  paintPrefix: string;
  /** Engraved plate sits on the side facing away from the root dial. */
  plateAbove: boolean;
  /** Collision-free display labels keyed by lowercase full address. */
  labels?: Map<string, string>;
  /** Grab/drag/fling pointer handlers from the physics stage. */
  dragProps?: Pick<
    React.DOMAttributes<SVGGElement>,
    "onPointerDown" | "onPointerMove" | "onPointerUp" | "onPointerCancel"
  >;
}) {
  const { node, x, y } = item;
  const labelX = labelClamp ? Math.min(Math.max(x, labelClamp.min), labelClamp.max) : x;
  const registered = node.registered;
  const multiChain = node.chains.length > 1;
  const active = selected || hovered;
  /*
   * Instrument medallion — the register transplanted from the trust
   * constellation the user approved: a machined dark dome that flips to
   * bone under attention, an ink monogram face, a uniform gauge track,
   * and an engraved name plate. One shared size, material, and light
   * for every counterparty: registration is a rim-hue split only (gold
   * vs stone) and the monogram is identity only — never prominence.
   */
  const radius = mobile ? 19 : 22;
  const ringWidth = mobile ? 1.5 : 1.7;
  const hitR = mobile ? 27 : 30;
  const labelSize = mobile ? 10.5 : 11.5;
  const chipH = mobile ? 26 : 30;
  const chipY = plateAbove ? y - radius - (mobile ? 14 : 15) - chipH : y + radius + (mobile ? 14 : 15);
  const fullLabel = nodeLabel(node, labels);
  const label = visualNodeLabel(node, labels);
  /* Collision-widened address labels may exceed the username cap; let the
     plate grow instead of re-truncating them back into ambiguity. */
  const chipCap = !node.username && label.length > 16 ? (mobile ? 170 : 200) : 158;
  const chipW = Math.min(chipCap, Math.max(64, label.length * (mobile ? 6.1 : 6.7) + 18));
  const glyph = glyphFor(node);
  const bodyClassName = [
    styles.nodeButton,
    active ? styles.nodeActive : "",
    dimmed ? styles.nodeDimmed : ""
  ].filter(Boolean).join(" ");

  return (
    <g
      ref={nodeRef}
      role="button"
      tabIndex={0}
      aria-label={`Inspect observed counterparty ${fullLabel}: ${nodeDescription(node)}`}
      aria-controls={detailId}
      aria-pressed={selected}
      className={`${bodyClassName} ${styles.grabbable}`}
      data-testid={`button-interaction-node-${node.walletAddress}`}
      {...dragProps}
      onClick={() => onSelect(node)}
      onFocus={() => onSelect(node)}
      onMouseEnter={() => onHover(node)}
      onMouseLeave={() => onHover(null)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(node);
        }
      }}
    >
      <title>{fullLabel}</title>
      <circle
        className={styles.nodeFocus}
        cx={x}
        cy={y}
        r={radius + 16}
        fill="none"
        stroke="var(--gold)"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        opacity="0"
      />
      {selected ? (
        <circle
          className={styles.nodeSelectedPulse}
          cx={x}
          cy={y}
          r={radius + 10}
          fill="none"
          stroke="var(--gold)"
          strokeWidth="1.4"
        />
      ) : null}
      <g className={styles.nodeBody} style={{ animationDelay: `${-index * 0.68}s` }}>
        {/* Full-size invisible hit target: the grab zone outsizes the disc. */}
        <circle cx={x} cy={y} r={hitR} fill="transparent" />
        {/*
         * Medallion body — a plate-toned occluder swallows the thread's
         * last pixels, then the shared machined dome (rest) with its
         * bone attention dome above it (CSS opacity flip), one hairline
         * specular catch, and the ink monogram. Identical material on
         * every node, so surface can never read as count, strength, or
         * quality — attention is the ONLY thing that changes a disc.
         */}
        <circle cx={x} cy={y} r={radius - 0.6} fill="#1a1d18" />
        <circle className={styles.reticleRing} cx={x} cy={y} r={radius} fill={`url(#${paintPrefix}-dome)`} />
        <circle className={styles.nodeDomeActive} cx={x} cy={y} r={radius} fill={`url(#${paintPrefix}-domeActive)`} />
        <circle
          className={`${styles.nodeRing} ${registered ? styles.nodeRingRegistered : ""}`}
          cx={x}
          cy={y}
          r={radius}
          fill="none"
          strokeWidth={ringWidth}
        />
        <path className={styles.nodeSpec} d={arcPathD(x, y, radius - 1.2, -155, 108)} fill="none" stroke="#f2eee3" strokeWidth="1" />
        {/* Gauge track: the same full hairline ring on EVERY medallion — pure furniture. */}
        <circle cx={x} cy={y} r={radius + 5.5} fill="none" stroke="#f2eee3" strokeWidth={mobile ? 1.8 : 2.2} opacity="0.12" />
        <text
          x={x}
          y={y + (mobile ? 4 : 4.5)}
          textAnchor="middle"
          className={`${styles.nodeGlyph} pointer-events-none font-mono`}
          fontSize={mobile ? 12 : 13.5}
          fontWeight="700"
          letterSpacing="0.5px"
        >
          {glyph}
        </text>
        {multiChain ? (
          <circle
            cx={x}
            cy={y}
            r={radius + 9}
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1.1"
            strokeDasharray="2 5"
            opacity={active ? "0.95" : "0.5"}
          />
        ) : null}
        {node.verifiedKyroPeer ? (
          <circle
            cx={x}
            cy={y}
            r={radius + 12.5}
            fill="none"
            stroke="rgba(127,169,141,0.7)"
            strokeWidth="1"
            strokeDasharray="2 3"
          />
        ) : null}
      </g>
      {/*
       * Engraved name plate — the trust instrument's two-line label:
       * name over a categorical register line. Same plate on every
       * node, placed on the side facing AWAY from the root dial.
       */}
      <rect
        className={`${styles.nodeChip} ${registered ? styles.nodeChipRegistered : ""} pointer-events-none`}
        x={labelX - chipW / 2}
        y={chipY}
        width={chipW}
        height={chipH}
        rx="2"
        fill="#1c1f1d"
        fillOpacity="0.78"
        strokeWidth="1"
      />
      <text
        x={labelX}
        y={chipY + (mobile ? 11 : 12.5)}
        textAnchor="middle"
        className={`${styles.nodeLabel} pointer-events-none font-mono`}
        fontSize={labelSize}
        letterSpacing="0.4px"
        fill="#e6e2d2"
      >
        {label}
      </text>
      <text
        x={labelX}
        y={chipY + (mobile ? 20.5 : 24)}
        textAnchor="middle"
        className="pointer-events-none font-mono uppercase"
        fontSize={mobile ? 7.5 : 8}
        letterSpacing="0.7px"
        fill="#969b8e"
      >
        {registered ? "registered" : "observed"}
      </text>
    </g>
  );
}

function RootNode({
  x,
  y,
  rootLabel,
  walletAddress,
  compact,
  gradientId,
  auraId,
  rootRef
}: {
  x: number;
  y: number;
  rootLabel: string;
  walletAddress: string;
  compact: boolean;
  gradientId: string;
  auraId: string;
  rootRef?: (element: SVGGElement | null) => void;
}) {
  const radius = compact ? ROOT_R.mobile : ROOT_R.desktop;
  const labels = rootLabelLines(rootLabel);
  const labelStart = labels.length === 1 ? y - 4 : y - 13;
  const addressY = labels.length === 1 ? y + 13 : y + 22;
  /*
   * Dial bezel: one hairline ring of fine ticks with four longer
   * cardinal marks — a COMPACT precision hub like the trust
   * instrument's "You" medallion, never a giant plate. Double gold
   * ring, clean type, nothing else.
   */
  const bezelR = radius + 6;
  const tickCount = compact ? 36 : 48;

  return (
    <g ref={rootRef} aria-label={`${rootLabel}: ${shortenAddress(walletAddress)}`}>
      <circle className={styles.rootAtmosphere} cx={x} cy={y} r={radius + 22} fill={`url(#${auraId})`} aria-hidden="true" />
      <g className={styles.rootDial} aria-hidden="true">
        <circle cx={x} cy={y} r={bezelR} fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.3" />
        <path d={ringTicksPath(x, y, bezelR, tickCount, 3)} stroke="var(--gold)" strokeWidth="1" fill="none" opacity="0.22" />
        <path d={ringTicksPath(x, y, bezelR, 4, 6)} stroke="var(--gold)" strokeWidth="1.2" fill="none" opacity="0.5" />
      </g>
      <g className={styles.rootCore}>
        <circle cx={x} cy={y} r={radius} fill={`url(#${gradientId})`} stroke="var(--gold)" strokeWidth="1.6" />
        <circle cx={x} cy={y} r={radius - 4} fill="none" stroke="var(--gold)" strokeWidth="1" opacity="0.35" />
        {labels.map((line, index) => (
          <text
            key={`${line}-${index}`}
            x={x}
            y={labelStart + index * (compact ? 12 : 14)}
            textAnchor="middle"
            className="font-mono font-bold uppercase"
            fill="#f2eee3"
            fontSize={compact ? 10.5 : 12.5}
            letterSpacing={compact ? "0.8px" : "1.2px"}
          >
            {line}
          </text>
        ))}
        <text x={x} y={addressY} textAnchor="middle" className="font-mono" fill="#8f948a" fontSize={compact ? 7.5 : 8.5}>
          {shortenAddress(walletAddress)}
        </text>
      </g>
    </g>
  );
}

function GraphKey({ showPeerLinks }: { showPeerLinks: boolean }) {
  return (
    <div className={`${styles.graphKey} flex flex-wrap gap-2 font-mono text-[0.58rem] uppercase tracking-[0.09em]`} aria-label="Interaction map key">
      <span className="inline-flex items-center gap-1.5 border border-linec bg-paper/65 px-2 py-1.5"><i className="h-2.5 w-2.5 rounded-full border border-gold" aria-hidden="true" /> Registered profile</span>
      <span className="inline-flex items-center gap-1.5 border border-linec bg-paper/65 px-2 py-1.5"><i className="h-2.5 w-2.5 rounded-full border border-dashed border-gold" aria-hidden="true" /> Multi-chain presence</span>
      <span className="inline-flex items-center gap-1.5 border border-linec bg-paper/65 px-2 py-1.5"><i className="h-2.5 w-2.5 rounded-full border border-dashed border-verified" aria-hidden="true" /> Verified peer orbit</span>
      {showPeerLinks ? <span className="inline-flex items-center gap-1.5 border border-linec bg-paper/65 px-2 py-1.5"><i className="h-px w-4" style={{ background: "rgba(214,204,170,0.8)" }} aria-hidden="true" /> Verified peer link</span> : null}
    </div>
  );
}

/* C1b metrics row: one deterministic line in the fixed readout slot.
   Month-year formatting is pinned to UTC + en-US so server and client
   renders are identical at every viewer locale. */
const MONTH_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function monthYear(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? MONTH_YEAR_FORMAT.format(parsed) : null;
}

function metricsReadout(node: InteractionGraphNode): { text: string; measured: boolean } {
  const metrics = node.metrics;
  if (metrics) {
    const prefix = metrics.lowerBound ? "≥ " : "";
    const parts = [
      `${prefix}${metrics.transactionCount.total} tx`,
      `${metrics.transactionCount.in} in / ${metrics.transactionCount.out} out`
    ];
    const first = monthYear(metrics.firstInteractionAt);
    const last = monthYear(metrics.lastInteractionAt);
    if (first) parts.push(`first ${first}`);
    if (last) parts.push(`last ${last}`);
    if (metrics.lowerBound) parts.push("partial evidence");
    return { text: parts.join(" · "), measured: true };
  }
  /* Null metrics split honestly: an EVM chain can still capture counts on
     the wallet's next refresh; Arc evidence is aggregate-only forever. */
  return nullMetricsState(node) === "pending"
    ? { text: "Metrics pending re-index — counts appear after this wallet's next refresh", measured: false }
    : { text: "Not tracked for Arc activity — Arc evidence is aggregate-only", measured: false };
}

/* C1b-s2: the ledger reuses the readout's exact tri-state law through this
   single derivation point — pending vs Arc-only must never be re-derived. */
function nullMetricsState(node: InteractionGraphNode): "pending" | "arc" {
  return node.chains.some((chain) => !isArcInteractionChain(chain.chain)) ? "pending" : "arc";
}

/* C1b-s2 counterparty card copy: shortened heads of the readout sentences
   (approved wording). The card heads must stay literal prefixes of the full
   readout sentences so the two registers can never drift — gate-asserted. */
const PENDING_METRICS_CARD_COPY = "Metrics pending re-index";
const ARC_METRICS_CARD_COPY = "Not tracked for Arc activity";

/* C1b-s2 ledger line: count + direction + last seen only (no first seen,
   approved scope). Lower bound keeps the ≥ prefix and partial-evidence tag. */
function ledgerMetricsLine(node: InteractionGraphNode): { text: string; measured: boolean } {
  const metrics = node.metrics;
  if (metrics) {
    const prefix = metrics.lowerBound ? "≥ " : "";
    const parts = [
      `${prefix}${metrics.transactionCount.total} tx`,
      `${metrics.transactionCount.in} in / ${metrics.transactionCount.out} out`
    ];
    const last = monthYear(metrics.lastInteractionAt);
    if (last) parts.push(`last ${last}`);
    if (metrics.lowerBound) parts.push("partial evidence");
    return { text: parts.join(" · "), measured: true };
  }
  return nullMetricsState(node) === "pending"
    ? { text: PENDING_METRICS_CARD_COPY, measured: false }
    : { text: ARC_METRICS_CARD_COPY, measured: false };
}

function SelectedCounterpartyDetail({
  node,
  detailId,
  labels,
  onClose
}: {
  node: InteractionGraphNode;
  detailId: string;
  labels?: Map<string, string>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const label = nodeLabel(node, labels);
  const metrics = metricsReadout(node);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(node.walletAddress);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <aside
      id={detailId}
      className={`${styles.detailPanel} relative flex flex-col justify-center gap-1.5 border`}
      aria-live="polite"
      aria-label="Selected observed counterparty"
      data-testid="interaction-selected-detail"
    >
      {/* Close is pinned outside the scrollable action row so it stays
          visible without scrolling at every width. */}
      <button type="button" onClick={onClose} className="arc-button-secondary absolute right-2 top-2 font-mono leading-none" aria-label={`Close details for ${label}`}>
        ✕
      </button>
      {/*
       * Fixed-slot console readout — swaps with the stage hint in the
       * same fixed-height slot so selecting a node never changes the
       * plate's size. Four deterministic rows: name, register line,
       * metrics line (always exactly one row: measured, lower-bound,
       * pending, or Arc-unavailable),
       * and a single non-wrapping action row that scrolls horizontally
       * when explorer links exceed the width (nothing is ever clipped
       * vertically, so Close stays reachable at every width).
       */}
      <div className="flex min-w-0 items-baseline gap-2.5 overflow-hidden">
        <h4 className="truncate font-heading text-[0.95rem] font-semibold leading-tight text-[#f2eee3]">{label}</h4>
        {node.chains.length > 1 ? <span className="shrink-0 font-mono text-[0.52rem] uppercase tracking-[0.09em] text-gold">Multi-chain</span> : null}
        {node.verifiedKyroPeer ? <span className="shrink-0 font-mono text-[0.52rem] uppercase tracking-[0.09em] text-[#7fa98d]">Verified peer</span> : null}
      </div>
      <p className="flex min-w-0 items-baseline gap-1.5 overflow-hidden font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[#8b9083]">
        <span className="shrink-0 text-gold">{node.registered ? "Registered profile" : "Observed wallet"}</span>
        {node.username ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="shrink-0 normal-case tracking-normal text-[#9aa093]">{labels?.get(node.walletAddress.toLowerCase()) ?? shortenAddress(node.walletAddress)}</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span className="min-w-0 truncate">
          {node.chains.length} {node.chains.length === 1 ? "network" : "networks"} · Score neutral
        </span>
      </p>
      <p className="flex min-w-0 items-baseline overflow-hidden font-mono text-[0.56rem] uppercase tracking-[0.08em]" data-testid="interaction-node-metrics">
        <span className={`min-w-0 truncate ${metrics.measured ? "text-[#d6ccaa]" : "text-[#8b9083]"}`}>{metrics.text}</span>
      </p>
      <div className={`${styles.readoutActions} flex items-center gap-1.5`}>
        {node.registered && node.profileUrl ? (
          <Link href={node.profileUrl} className="arc-button-secondary inline-flex items-center px-2.5 py-1.5 text-xs font-bold">
            View profile
          </Link>
        ) : null}
        <CopyAddressButton address={node.walletAddress} copied={copied} onCopy={copyAddress} />
        <ExplorerActions node={node} label={label} />
      </div>
    </aside>
  );
}

export function InteractionGraphVisual({ graph, rootLabel, peerEdges = null, className = "" }: InteractionGraphVisualProps) {
  const titleId = useId();
  const detailId = useId();
  const visualId = useId().replaceAll(":", "");
  const allNodes = useMemo(() => observedNodes(graph.nodes), [graph.nodes]);
  const nodes = useMemo(() => allNodes.slice(0, MAX_VISUAL_NODES), [allNodes]);
  /* One collision-free label set across the WHOLE observed list (not just
     the visible slice) so the map, the detail panel and a ledger rendered
     from the same payload agree on every widened label. */
  const addressLabels = useMemo(
    () => collisionFreeAddressLabels(allNodes.map((node) => node.walletAddress)),
    [allNodes]
  );
  const hiddenNodeCount = allNodes.length - nodes.length;
  const layout = useMemo(() => graphLayout(nodes.length), [nodes.length]);
  const desktopNodes = useMemo(() => positionDesktopNodes(nodes, layout), [layout, nodes]);
  const mobileNodes = useMemo(() => positionMobileNodes(nodes), [nodes]);
  const mobileHeight = 560;
  const [selectedAddress, setSelectedAddress] = useState<string | null>(null);
  const [hoveredAddress, setHoveredAddress] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const selected = nodes.find((node) => node.walletAddress === selectedAddress) ?? null;
  const attentionAddress = selectedAddress ?? hoveredAddress;

  /*
   * Verified peer mesh: cross-links between two VISIBLE counterparties,
   * built only from transaction-verified trust-graph peer edges handed
   * in by the caller — never inferred here (fail closed). Deduped and
   * undirected; every link renders identically, so the mesh encodes
   * topology only — never strength, volume, or direction.
   */
  const peerPairs = useMemo(() => {
    const visible = new Set(nodes.map((node) => node.walletAddress.toLowerCase()));
    const seen = new Set<string>();
    const pairs: Array<[string, string]> = [];
    for (const edge of peerEdges ?? []) {
      const a = edge.sourceWallet.toLowerCase();
      const b = edge.targetWallet.toLowerCase();
      if (a === b || !visible.has(a) || !visible.has(b)) continue;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([a, b]);
    }
    return pairs;
  }, [peerEdges, nodes]);
  const peerPairsRef = useRef(peerPairs);
  useEffect(() => { peerPairsRef.current = peerPairs; }, [peerPairs]);

  const driftRegistry = useRef<Map<string, DriftEntry>>(new Map());
  const rootGroups = useRef<{ desktop: SVGGElement | null; mobile: SVGGElement | null }>({ desktop: null, mobile: null });
  const stageEls = useRef<{
    desktopWrap: HTMLDivElement | null;
    desktopCanvas: HTMLCanvasElement | null;
    mobileWrap: HTMLDivElement | null;
    mobileCanvas: HTMLCanvasElement | null;
  }>({ desktopWrap: null, desktopCanvas: null, mobileWrap: null, mobileCanvas: null });
  const pointerTarget = useRef({ x: 0, y: 0 });
  const attentionRef = useRef<string | null>(null);
  const reducedMotionRef = useRef(false);
  const activeDragCleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => activeDragCleanup.current?.(), []);

  useEffect(() => {
    attentionRef.current = attentionAddress;
  }, [attentionAddress]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function registerDrift(key: string, patch: Partial<DriftEntry>) {
    const registry = driftRegistry.current;
    const entry = registry.get(key) ?? {
      address: "",
      group: null,
      line: null,
      cx: Number.NaN,
      cy: Number.NaN,
      x: 0,
      y: 0,
      px: Number.NaN,
      py: Number.NaN,
      vx: 0,
      vy: 0,
      drag: null,
      seed: 0,
      phase: 0,
      mobile: false,
      damp: 1
    };
    Object.assign(entry, patch);
    if (!entry.group && !entry.line) {
      // Both refs go null momentarily during any commit that churns inline
      // ref identities (every hover re-render). Evicting immediately would
      // orphan live physics state mid-drag, so defer the check past the
      // commit: only a node that truly left the rendered set stays bare.
      queueMicrotask(() => {
        const current = registry.get(key);
        if (current && !current.group && !current.line) {
          registry.delete(key);
        }
      });
      return;
    }
    registry.set(key, entry);
  }

  /**
   * The living-stage loop: a spring simulation drives every marker
   * (ambient sway, pointer parallax, grab/drag/fling with spring-back and
   * soft pair repulsion), the SVG instruments ride the simulated
   * positions, and an additive canvas light engine below draws the
   * fiber threads, lit rims, and mirrored light pulses at 60fps. Every
   * thread gets the same treatment and every pulse pair is mirrored —
   * motion is symmetric and carries no semantic meaning.
   */
  useEffect(() => {
    if (reducedMotion) return;
    let frame = 0;
    const started = performance.now();
    let last = started;
    const pointer = { x: 0, y: 0 };
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const stages = [
      { mobile: false, viewW: 1000, viewH: layout.height, rootX: CENTER_X, rootY: layout.centerY, k: 0 },
      { mobile: true, viewW: 360, viewH: mobileHeight, rootX: MOBILE_ROOT_X, rootY: MOBILE_ROOT_Y, k: 0 }
    ];
    const canvasFor = (mobile: boolean) => (mobile ? stageEls.current.mobileCanvas : stageEls.current.desktopCanvas);
    const wrapFor = (mobile: boolean) => (mobile ? stageEls.current.mobileWrap : stageEls.current.desktopWrap);

    const resize = () => {
      for (const stage of stages) {
        const canvas = canvasFor(stage.mobile);
        const wrap = wrapFor(stage.mobile);
        if (!canvas || !wrap) continue;
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        stage.k = w > 0 ? w / stage.viewW : 0;
        canvas.width = Math.max(1, Math.round(w * dpr));
        canvas.height = Math.max(1, Math.round(h * dpr));
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    if (stageEls.current.desktopWrap) observer.observe(stageEls.current.desktopWrap);
    if (stageEls.current.mobileWrap) observer.observe(stageEls.current.mobileWrap);

    let sizeCheck = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 16.7, 2.4);
      last = now;
      const t = (now - started) / 1000;
      // Breakpoint flips can land between ResizeObserver ticks; re-measure
      // occasionally so a newly-visible stage always gets a sized canvas.
      if (++sizeCheck >= 24) {
        sizeCheck = 0;
        for (const stage of stages) {
          const wrap = wrapFor(stage.mobile);
          const canvas = canvasFor(stage.mobile);
          if (wrap && canvas && wrap.clientWidth > 0 && Math.abs(canvas.width - wrap.clientWidth * dpr) > 2) {
            resize();
            break;
          }
        }
      }
      pointer.x += (pointerTarget.current.x - pointer.x) * 0.05;
      pointer.y += (pointerTarget.current.y - pointer.y) * 0.05;

      const rootShift = {
        desktop: { x: pointer.x * 7, y: pointer.y * 5 },
        mobile: { x: pointer.x * 3, y: pointer.y * 2 }
      };
      rootGroups.current.desktop?.setAttribute("transform", `translate(${rootShift.desktop.x.toFixed(2)} ${rootShift.desktop.y.toFixed(2)})`);
      rootGroups.current.mobile?.setAttribute("transform", `translate(${rootShift.mobile.x.toFixed(2)} ${rootShift.mobile.y.toFixed(2)})`);

      const byStage: { desktop: DriftEntry[]; mobile: DriftEntry[] } = { desktop: [], mobile: [] };
      driftRegistry.current.forEach((entry) => {
        if (!entry.group) return;
        (entry.mobile ? byStage.mobile : byStage.desktop).push(entry);
      });

      for (const stage of stages) {
        const entries = stage.mobile ? byStage.mobile : byStage.desktop;
        if (!entries.length) continue;
        const shift = stage.mobile ? rootShift.mobile : rootShift.desktop;
        const rootX = stage.rootX + shift.x;
        const rootY = stage.rootY + shift.y;
        const amp = stage.mobile ? 5 : 11;
        const parallax = stage.mobile ? 5 : 13;

        // --- integrate the springs ---
        for (const entry of entries) {
          if (!Number.isFinite(entry.px)) {
            entry.px = entry.x;
            entry.py = entry.y;
          }
          if (!entry.phase) entry.phase = ((addressSeed(entry.address) % 997) / 997) * Math.PI * 2;
          const factor = 0.32 + ((entry.seed * 37) % 55) / 100;
          const dampTarget = attentionRef.current === entry.address ? 0.25 : 1;
          entry.damp += (dampTarget - entry.damp) * 0.12;
          const idle = driftOffset(t, entry.seed, amp * entry.damp);
          const homeX = entry.x + idle.x + pointer.x * parallax * factor * entry.damp;
          const homeY = entry.y + idle.y + pointer.y * parallax * factor * entry.damp;

          if (entry.drag) {
            const prevX = entry.px;
            const prevY = entry.py;
            const pull = Math.min(0.45 * dt, 0.9);
            entry.px += (entry.drag.x - entry.px) * pull;
            entry.py += (entry.drag.y - entry.py) * pull;
            entry.vx = (entry.px - prevX) * 0.9;
            entry.vy = (entry.py - prevY) * 0.9;
          } else {
            entry.vx += (homeX - entry.px) * 0.024 * dt;
            entry.vy += (homeY - entry.py) * 0.024 * dt;
          }
        }

        // Soft pair repulsion keeps thrown markers from stacking.
        for (let i = 0; i < entries.length; i++) {
          for (let j = i + 1; j < entries.length; j++) {
            const a = entries[i]!;
            const b = entries[j]!;
            const dx = b.px - a.px;
            const dy = b.py - a.py;
            const dist = Math.hypot(dx, dy);
            const minDist = stage.mobile ? 66 : 96;
            if (dist > 0.001 && dist < minDist) {
              const push = ((minDist - dist) / minDist) * 0.55 * dt;
              const ux = dx / dist;
              const uy = dy / dist;
              if (!a.drag) { a.vx -= ux * push; a.vy -= uy * push; }
              if (!b.drag) { b.vx += ux * push; b.vy += uy * push; }
            }
          }
        }

        const damping = Math.pow(0.9, dt);
        const minX = stage.mobile ? 40 : 52;
        const maxX = stage.viewW - minX;
        const minY = stage.mobile ? 50 : 60;
        const maxY = stage.viewH - (stage.mobile ? 64 : 78);
        for (const entry of entries) {
          if (!entry.drag) {
            entry.vx *= damping;
            entry.vy *= damping;
            const speed = Math.hypot(entry.vx, entry.vy);
            if (speed > 26) {
              entry.vx = (entry.vx / speed) * 26;
              entry.vy = (entry.vy / speed) * 26;
            }
            entry.px += entry.vx * dt;
            entry.py += entry.vy * dt;
          }
          if (entry.px < minX) { entry.px = minX; entry.vx = Math.abs(entry.vx) * 0.4; }
          if (entry.px > maxX) { entry.px = maxX; entry.vx = -Math.abs(entry.vx) * 0.4; }
          if (entry.py < minY) { entry.py = minY; entry.vy = Math.abs(entry.vy) * 0.4; }
          if (entry.py > maxY) { entry.py = maxY; entry.vy = -Math.abs(entry.vy) * 0.4; }

          entry.group?.setAttribute("transform", `translate(${(entry.px - entry.x).toFixed(2)} ${(entry.py - entry.y).toFixed(2)})`);
          // One curve, two renderers: cache the elastic control point so
          // the crisp SVG hairline and the canvas thread trace the same
          // filament — a straight line here would read as a stray needle.
          const wobble = Math.sin(t * 0.21 + entry.seed * 1.31) * 2.5;
          const control = threadControl(rootX, rootY, entry.px, entry.py, entry.seed, stage.mobile, wobble, entry.vx, entry.vy);
          entry.cx = control.x;
          entry.cy = control.y;
          entry.line?.setAttribute(
            "d",
            `M ${rootX.toFixed(2)} ${rootY.toFixed(2)} Q ${control.x.toFixed(2)} ${control.y.toFixed(2)} ${entry.px.toFixed(2)} ${entry.py.toFixed(2)}`
          );
        }

        // --- canvas light layer ---
        const canvas = canvasFor(stage.mobile);
        const ctx = canvas?.getContext("2d") ?? null;
        if (!canvas || !ctx || stage.k <= 0 || canvas.width <= 1) continue;
        const k = stage.k;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        ctx.lineCap = "round";
        // Engraved plate furniture first (source-over), light passes above.
        drawInstrumentGrid(ctx, rootX * k, rootY * k, k, stage.mobile, t);

        /*
         * LUMEN engine: every light pass composites additively
         * ("lighter"), so overlapping passes can only brighten — light
         * reads as light, never as sediment or fog. Layering is identical
         * for every thread and marker; all motion is shared and mirrored,
         * so nothing can read as flow, count, or strength.
         */
        const attention = attentionRef.current;
        ctx.globalCompositeOperation = "lighter";
        const hubFadePx = (stage.mobile ? HUB_FADE_R.mobile : HUB_FADE_R.desktop) * k;
        const nodeRimPx = (stage.mobile ? 19 : 22) * k;
        const rootRimPx = (stage.mobile ? ROOT_R.mobile : ROOT_R.desktop) * k;
        const posByAddr = new Map<string, DriftEntry>();
        for (const entry of entries) posByAddr.set(entry.address.toLowerCase(), entry);

        // Powered hub: the dial's bezel carries a quiet rim of light.
        ctx.beginPath();
        ctx.arc(rootX * k, rootY * k, rootRimPx + 7 * k, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${GOLD_RGB},0.08)`;
        ctx.lineWidth = 3.5;
        ctx.stroke();

        for (const entry of entries) {
          const active = attention === entry.address || Boolean(entry.drag);
          const dimmed = Boolean(attention) && !active;
          const x0 = rootX * k;
          const y0 = rootY * k;
          const cx = (Number.isFinite(entry.cx) ? entry.cx : (rootX + entry.px) / 2) * k;
          const cy = (Number.isFinite(entry.cy) ? entry.cy : (rootY + entry.py) / 2) * k;
          const x1 = entry.px * k;
          const y1 = entry.py * k;

          // Fiber body: wide soft ribbon + gold body + white-hot core —
          // the same three additive passes on every thread, hub-faded so
          // twelve filaments never knot into a needle star at the centre.
          strokeHubFadedThread(ctx, x0, y0, cx, cy, x1, y1, hubFadePx, GOLD_RGB, dimmed ? 0.02 : active ? 0.16 : 0.08, active ? 8 : 6.5);
          strokeHubFadedThread(ctx, x0, y0, cx, cy, x1, y1, hubFadePx, GOLD_RGB, dimmed ? 0.05 : active ? 0.8 : 0.45, active ? 1.9 : 1.4);
          strokeHubFadedThread(ctx, x0, y0, cx, cy, x1, y1, hubFadePx, "255,226,168", dimmed ? 0 : active ? 0.5 : 0.2, 0.7);

          // Threads plug into BOTH endpoints with the same point of light.
          drawEndpointBeads(ctx, x0, y0, cx, cy, x1, y1, rootRimPx, nodeRimPx, dimmed ? 0.05 : active ? 0.7 : 0.45, k);

          // Lit reticle: the ring itself carries light — one crisp
          // additive rim at ring radius, identical for every marker.
          ctx.beginPath();
          ctx.arc(x1, y1, nodeRimPx, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${GOLD_RGB},${(dimmed ? 0.02 : active ? 0.3 : 0.12).toFixed(3)})`;
          ctx.lineWidth = 2.8;
          ctx.stroke();

          // Light pulses: one comet each way on EVERY thread — same size,
          // same speed, mirrored directions, phases seeded per thread.
          // Energy visibly flows both ways at once, so a pulse can never
          // read as transfer direction, volume, or recency.
          for (const dir of [1, -1]) {
            const phase = ((entry.seed * (dir > 0 ? 13 : 29)) % 97) / 97;
            const s = (t * 0.11 + phase) % 1;
            const sp = dir > 0 ? s : 1 - s;
            const pt = quadPoint(sp, x0, y0, cx, cy, x1, y1);
            const dRoot = Math.hypot(pt.x - x0, pt.y - y0);
            const hubK = Math.min(1, Math.max(0, (dRoot - hubFadePx * 0.55) / (hubFadePx * 0.45)));
            if (hubK <= 0.01) continue;
            const pulseAlpha = (dimmed ? 0.05 : active ? 0.75 : 0.4) * hubK;
            for (let i = 3; i >= 1; i--) {
              const ts = sp - dir * i * 0.016;
              if (ts < 0 || ts > 1) continue;
              const tail = quadPoint(ts, x0, y0, cx, cy, x1, y1);
              ctx.beginPath();
              ctx.fillStyle = `rgba(${GOLD_RGB},${(pulseAlpha * (1 - i / 4) * 0.35).toFixed(3)})`;
              ctx.arc(tail.x, tail.y, Math.max(0.8, 1.3 * k) * (1 - i * 0.16), 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.beginPath();
            ctx.fillStyle = `rgba(255,232,178,${pulseAlpha.toFixed(3)})`;
            ctx.arc(pt.x, pt.y, Math.max(1, 1.6 * k), 0, Math.PI * 2);
            ctx.fill();
          }
        }

        /*
         * Verified peer mesh: bone-silver splines between counterparties
         * that share a transaction-verified trust edge — the cross-links
         * that make this a graph, not a star. One hue and the same two
         * additive passes on every link (a categorical split from the
         * gold root threads: different evidence class, never strength).
         * Links bow away from the dial so the mesh never crosses the
         * hub, and they carry no pulses: topology, never traffic.
         */
        for (const [pa, pb] of peerPairsRef.current) {
          const ea = posByAddr.get(pa);
          const eb = posByAddr.get(pb);
          if (!ea || !eb) continue;
          const meshActive = attention === ea.address || attention === eb.address || Boolean(ea.drag) || Boolean(eb.drag);
          const meshDimmed = Boolean(attention) && !meshActive;
          const mx = (ea.px + eb.px) / 2;
          const my = (ea.py + eb.py) / 2;
          const awayX = mx - rootX;
          const awayY = my - rootY;
          const away = Math.hypot(awayX, awayY) || 1;
          const bow = stage.mobile ? 16 : 26;
          const pcx = (mx + (awayX / away) * bow) * k;
          const pcy = (my + (awayY / away) * bow) * k;
          const soft = meshDimmed ? 0.015 : meshActive ? 0.16 : 0.05;
          const core = meshDimmed ? 0.04 : meshActive ? 0.55 : 0.28;
          ctx.beginPath();
          ctx.moveTo(ea.px * k, ea.py * k);
          ctx.quadraticCurveTo(pcx, pcy, eb.px * k, eb.py * k);
          ctx.strokeStyle = `rgba(${PEER_RGB},${soft.toFixed(3)})`;
          ctx.lineWidth = meshActive ? 4.5 : 3.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ea.px * k, ea.py * k);
          ctx.quadraticCurveTo(pcx, pcy, eb.px * k, eb.py * k);
          ctx.strokeStyle = `rgba(${PEER_RGB},${core.toFixed(3)})`;
          ctx.lineWidth = meshActive ? 1.5 : 1.1;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      driftRegistry.current.forEach((entry) => {
        entry.group?.removeAttribute("transform");
        entry.px = entry.x;
        entry.py = entry.y;
        entry.vx = 0;
        entry.vy = 0;
        entry.drag = null;
        const rootX = entry.mobile ? MOBILE_ROOT_X : CENTER_X;
        const rootY = entry.mobile ? MOBILE_ROOT_Y : layout.centerY;
        if (entry.line) {
          const control = threadControl(rootX, rootY, entry.x, entry.y, entry.seed, entry.mobile, 0, 0, 0);
          entry.line.setAttribute("d", `M ${rootX} ${rootY} Q ${control.x} ${control.y} ${entry.x} ${entry.y}`);
        }
      });
      rootGroups.current.desktop?.removeAttribute("transform");
      rootGroups.current.mobile?.removeAttribute("transform");
      for (const mobile of [false, true]) {
        const canvas = mobile ? stageEls.current.mobileCanvas : stageEls.current.desktopCanvas;
        const context = canvas?.getContext("2d");
        if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
  }, [reducedMotion, layout.centerY, layout.height, mobileHeight]);

  /** Reduced motion: one static, fully-drawn frame — no loop, no pulses. */
  useEffect(() => {
    if (!reducedMotion) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const draw = () => {
      for (const mobile of [false, true]) {
        const canvas = mobile ? stageEls.current.mobileCanvas : stageEls.current.desktopCanvas;
        const wrap = mobile ? stageEls.current.mobileWrap : stageEls.current.desktopWrap;
        if (!canvas || !wrap || wrap.clientWidth === 0) continue;
        const viewW = mobile ? 360 : 1000;
        const rootX = mobile ? MOBILE_ROOT_X : CENTER_X;
        const rootY = mobile ? MOBILE_ROOT_Y : layout.centerY;
        const k = wrap.clientWidth / viewW;
        canvas.width = Math.max(1, Math.round(wrap.clientWidth * dpr));
        canvas.height = Math.max(1, Math.round(wrap.clientHeight * dpr));
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = "round";
        // Same plate furniture as the live loop, minus the radar sweep.
        drawInstrumentGrid(ctx, rootX * k, rootY * k, k, mobile, null);
        // Same additive register as the live loop — one static frame,
        // no pulses, identical thread layering.
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        ctx.arc(rootX * k, rootY * k, ((mobile ? 48 : 64) + 7) * k, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${GOLD_RGB},0.08)`;
        ctx.lineWidth = 3.5;
        ctx.stroke();
        driftRegistry.current.forEach((entry) => {
          if (entry.mobile !== mobile || !entry.group) return;
          const control = threadControl(rootX, rootY, entry.x, entry.y, entry.seed, mobile, 0, 0, 0);
          const hubFadePx = (mobile ? HUB_FADE_R.mobile : HUB_FADE_R.desktop) * k;
          const nodeRimPx = (mobile ? 19 : 22) * k;
          strokeHubFadedThread(ctx, rootX * k, rootY * k, control.x * k, control.y * k, entry.x * k, entry.y * k, hubFadePx, GOLD_RGB, 0.07, 5.5);
          strokeHubFadedThread(ctx, rootX * k, rootY * k, control.x * k, control.y * k, entry.x * k, entry.y * k, hubFadePx, GOLD_RGB, 0.45, 1.4);
          strokeHubFadedThread(ctx, rootX * k, rootY * k, control.x * k, control.y * k, entry.x * k, entry.y * k, hubFadePx, "255,226,168", 0.2, 0.7);
          drawEndpointBeads(ctx, rootX * k, rootY * k, control.x * k, control.y * k, entry.x * k, entry.y * k, (mobile ? ROOT_R.mobile : ROOT_R.desktop) * k, nodeRimPx, 0.45, k);
          ctx.beginPath();
          ctx.arc(entry.x * k, entry.y * k, nodeRimPx, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(${GOLD_RGB},0.12)`;
          ctx.lineWidth = 2.8;
          ctx.stroke();
        });
        // Verified peer mesh, static register: same two passes, rest positions.
        const restByAddr = new Map<string, DriftEntry>();
        driftRegistry.current.forEach((entry) => {
          if (entry.mobile === mobile && entry.group) restByAddr.set(entry.address.toLowerCase(), entry);
        });
        for (const [pa, pb] of peerPairs) {
          const ea = restByAddr.get(pa);
          const eb = restByAddr.get(pb);
          if (!ea || !eb) continue;
          const mx = (ea.x + eb.x) / 2;
          const my = (ea.y + eb.y) / 2;
          const awayX = mx - rootX;
          const awayY = my - rootY;
          const away = Math.hypot(awayX, awayY) || 1;
          const bow = mobile ? 16 : 26;
          const pcx = (mx + (awayX / away) * bow) * k;
          const pcy = (my + (awayY / away) * bow) * k;
          ctx.beginPath();
          ctx.moveTo(ea.x * k, ea.y * k);
          ctx.quadraticCurveTo(pcx, pcy, eb.x * k, eb.y * k);
          ctx.strokeStyle = `rgba(${PEER_RGB},0.05)`;
          ctx.lineWidth = 3.5;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(ea.x * k, ea.y * k);
          ctx.quadraticCurveTo(pcx, pcy, eb.x * k, eb.y * k);
          ctx.strokeStyle = `rgba(${PEER_RGB},0.28)`;
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }
        ctx.globalCompositeOperation = "source-over";
      }
    };
    draw();
    const observer = new ResizeObserver(draw);
    if (stageEls.current.desktopWrap) observer.observe(stageEls.current.desktopWrap);
    if (stageEls.current.mobileWrap) observer.observe(stageEls.current.mobileWrap);
    return () => observer.disconnect();
  }, [reducedMotion, layout.centerY, layout.height, mobileHeight, nodes, peerPairs]);

  /**
   * Grab-and-throw: while dragging, the marker pins to the pointer; on
   * release the spring carries it home with a satisfying overshoot.
   * Window-level move/up listeners (not pointer capture) track the drag,
   * so it stays attached however fast the hand moves. Selection still
   * happens on focus, so grabbing a marker also inspects it. Purely
   * physical play — positions never change meaning.
   */
  function getDragProps(key: string, mobile: boolean) {
    return {
      onPointerDown: (event: React.PointerEvent<SVGGElement>) => {
        if (reducedMotionRef.current || event.button > 0) return;
        const entry = driftRegistry.current.get(key);
        const svg = event.currentTarget.ownerSVGElement;
        if (!entry || !svg) return;
        const viewW = mobile ? 360 : 1000;
        const viewH = mobile ? mobileHeight : layout.height;
        const margin = mobile ? 30 : 42;
        const toView = (clientX: number, clientY: number) => {
          const rect = svg.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;
          const x = ((clientX - rect.left) / rect.width) * viewW;
          const y = ((clientY - rect.top) / rect.height) * viewH;
          return {
            x: Math.min(Math.max(x, margin), viewW - margin),
            y: Math.min(Math.max(y, margin), viewH - margin)
          };
        };
        const start = toView(event.clientX, event.clientY);
        if (!start) return;
        activeDragCleanup.current?.();
        entry.drag = start;
        const pointerId = event.pointerId;
        // Re-fetch on every event: re-renders can rebuild registry entries,
        // and the drag must ride whichever entry is live for this key.
        const grabbed = () => driftRegistry.current.get(key);
        const move = (nativeEvent: PointerEvent) => {
          if (nativeEvent.pointerId !== pointerId) return;
          const live = grabbed();
          if (!live) return;
          const target = toView(nativeEvent.clientX, nativeEvent.clientY);
          if (target) live.drag = target;
        };
        const release = (nativeEvent: PointerEvent) => {
          if (nativeEvent.pointerId !== pointerId) return;
          cleanup();
        };
        const cleanup = () => {
          const live = grabbed();
          if (live) live.drag = null;
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", release);
          window.removeEventListener("pointercancel", release);
          if (activeDragCleanup.current === cleanup) activeDragCleanup.current = null;
        };
        activeDragCleanup.current = cleanup;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
      }
    };
  }

  function selectNode(node: InteractionGraphNode) {
    setSelectedAddress(node.walletAddress);
  }

  /*
   * Structural hairline edges: honest root-to-counterparty geometry that
   * rides the physics every frame on the SAME quadratic the canvas
   * threads trace — one crisp filament, never a second straight needle
   * crossing the curve. Legible even before the canvas paints.
   */
  function renderEdges(positioned: PositionedNode[], rootX: number, rootY: number, mobile = false) {
    return positioned.map((item, index) => {
      const active = attentionAddress === item.node.walletAddress;
      const dimmed = Boolean(attentionAddress && !active);
      const key = `${mobile ? "m" : "d"}:${item.node.walletAddress}`;
      const control = threadControl(rootX, rootY, item.x, item.y, index, mobile, 0, 0, 0);
      return (
        <path
          key={`${mobile ? "mobile" : "desktop"}-edge-${item.node.walletAddress}`}
          ref={(element) => registerDrift(key, { line: element, address: item.node.walletAddress, x: item.x, y: item.y, seed: index, mobile })}
          className={styles.edgeBase}
          d={`M ${rootX} ${rootY} Q ${control.x} ${control.y} ${item.x} ${item.y}`}
          fill="none"
          stroke={`url(#${mobile ? `${visualId}-m` : visualId}-thread)`}
          strokeWidth="1"
          opacity={dimmed ? "0.05" : active ? "0.7" : "0.45"}
          style={{ animationDelay: `${-index * 0.8}s` }}
        />
      );
    });
  }

  function renderNodes(positioned: PositionedNode[], mobile = false) {
    return positioned.map((item, index) => {
      const active = attentionAddress === item.node.walletAddress;
      const key = `${mobile ? "m" : "d"}:${item.node.walletAddress}`;
      return (
      <CounterpartyNode
        key={item.node.walletAddress}
        item={item}
        index={index}
        selected={selectedAddress === item.node.walletAddress}
        hovered={hoveredAddress === item.node.walletAddress}
        dimmed={Boolean(attentionAddress && !active)}
        detailId={detailId}
        onSelect={selectNode}
        onHover={(node) => setHoveredAddress(node?.walletAddress ?? null)}
        nodeRef={(element) => registerDrift(key, { group: element })}
        labelClamp={mobile ? { min: 74, max: 286 } : { min: 84, max: 902 }}
        mobile={mobile}
        paintPrefix={mobile ? `${visualId}-m` : visualId}
        plateAbove={item.y < (mobile ? MOBILE_ROOT_Y : layout.centerY) - 40 && item.y > (mobile ? 84 : 128)}
        labels={addressLabels}
        dragProps={getDragProps(key, mobile)}
      />
      );
    });
  }

  return (
    <section
      className={`${styles.surface} min-w-0 border border-linec p-3 sm:p-5 ${className}`}
      aria-labelledby={titleId}
      data-testid="interaction-graph-visual"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-2xl">
          <p className="arc-section-label text-gold">Observed wallet network</p>
          <h3 id={titleId} className="mt-1.5 font-heading text-2xl font-semibold text-ink sm:text-3xl">Wallet interaction map</h3>
          <p className="mt-2 text-sm leading-6 text-mutedc">
            Explore counterparties found in the latest saved onchain observations.
          </p>
        </div>
        <div className={`${styles.snapshotBadge} flex items-center gap-2 px-2.5 py-2 font-mono text-[0.58rem] uppercase tracking-[0.1em]`}>
          <span className={styles.fieldStatusDot} aria-hidden="true" />
          Saved snapshot · Score neutral
        </div>
      </div>

      <div
        className={`${styles.fieldFrame} mt-4 border border-linec`}
        onPointerMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const normalizedX = (event.clientX - bounds.left) / bounds.width;
          const normalizedY = (event.clientY - bounds.top) / bounds.height;
          event.currentTarget.style.setProperty("--pointer-x", `${normalizedX * 100}%`);
          event.currentTarget.style.setProperty("--pointer-y", `${normalizedY * 100}%`);
          pointerTarget.current = { x: (normalizedX - 0.5) * 2, y: (normalizedY - 0.5) * 2 };
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.setProperty("--pointer-x", "50%");
          event.currentTarget.style.setProperty("--pointer-y", "46%");
          pointerTarget.current = { x: 0, y: 0 };
        }}
      >
        <div className={styles.fieldHud} aria-hidden="true">
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.11em]">Select a wallet to inspect</span>
          <span className="font-mono text-[0.54rem] uppercase tracking-[0.11em]">
            {nodes.length} mapped{peerPairs.length > 0 ? ` · ${peerPairs.length} verified peer ${peerPairs.length === 1 ? "link" : "links"}` : ""}{hiddenNodeCount > 0 ? ` · ${hiddenNodeCount} more in list` : ""}
          </span>
        </div>

        <div className={`${styles.stageWrap} hidden sm:block`} ref={(element) => { stageEls.current.desktopWrap = element; }}>
        <canvas className={styles.stageCanvas} ref={(element) => { stageEls.current.desktopCanvas = element; }} aria-hidden="true" />
        <svg className={`${styles.svg} block h-auto w-full`} viewBox={`0 0 1000 ${layout.height}`} role="group" aria-label="Interactive map of observed counterparties">
          <defs>
            <linearGradient id={`${visualId}-root`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#21251e" />
              <stop offset="55%" stopColor="#1a1d17" />
              <stop offset="100%" stopColor="#151810" />
            </linearGradient>
            <StageMaterialDefs prefix={visualId} rootX={CENTER_X} rootY={layout.centerY} hubR={HUB_FADE_R.desktop} />
          </defs>
          {/* All plate furniture lives on the canvas gauge grid below. */}
          {renderEdges(desktopNodes, CENTER_X, layout.centerY)}
          {renderNodes(desktopNodes)}
          <RootNode
            x={CENTER_X}
            y={layout.centerY}
            rootLabel={rootLabel}
            walletAddress={graph.walletAddress}
            compact={false}
            gradientId={`${visualId}-root`}
            auraId={`${visualId}-aura`}
            rootRef={(element) => { rootGroups.current.desktop = element; }}
          />
          {!nodes.length ? <text x={CENTER_X} y={layout.centerY + 112} textAnchor="middle" className="font-sans text-[15px]" fill="#9aa093">{graph.coverage?.status === "complete" ? "No observed counterparties in the saved snapshot" : graph.coverage?.status === "partial" ? "No counterparties saved so far — coverage is partial" : "This wallet has not been indexed as a center wallet yet"}</text> : null}
        </svg>
        </div>

        <div className={`${styles.stageWrap} block sm:hidden`} ref={(element) => { stageEls.current.mobileWrap = element; }}>
        <canvas className={styles.stageCanvas} ref={(element) => { stageEls.current.mobileCanvas = element; }} aria-hidden="true" />
        <svg className={`${styles.svg} block h-auto w-full`} viewBox={`0 0 360 ${mobileHeight}`} role="group" aria-label="Interactive map of observed counterparties">
          <defs>
            <linearGradient id={`${visualId}-root-mobile`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#21251e" />
              <stop offset="55%" stopColor="#1a1d17" />
              <stop offset="100%" stopColor="#151810" />
            </linearGradient>
            <StageMaterialDefs prefix={`${visualId}-m`} rootX={MOBILE_ROOT_X} rootY={MOBILE_ROOT_Y} hubR={HUB_FADE_R.mobile} />
          </defs>
          {/* All plate furniture lives on the canvas gauge grid below. */}
          {renderEdges(mobileNodes, MOBILE_ROOT_X, MOBILE_ROOT_Y, true)}
          {renderNodes(mobileNodes, true)}
          <RootNode
            x={MOBILE_ROOT_X}
            y={MOBILE_ROOT_Y}
            rootLabel={rootLabel}
            walletAddress={graph.walletAddress}
            compact
            gradientId={`${visualId}-root-mobile`}
            auraId={`${visualId}-m-aura`}
            rootRef={(element) => { rootGroups.current.mobile = element; }}
          />
          {!nodes.length ? <text x={MOBILE_ROOT_X} y={MOBILE_ROOT_Y + 96} textAnchor="middle" className="font-sans text-[13px]" fill="#9aa093">{graph.coverage?.status === "complete" ? "No observed counterparties" : graph.coverage?.status === "partial" ? "No counterparties in partial coverage" : "Not indexed as a center wallet yet"}</text> : null}
        </svg>
        </div>
        <div className={`${styles.plateLegend} font-mono`} aria-hidden="true">
          <span>threads = observations</span>
          <span>bone links = peer bonds</span>
          <span>all marks equal</span>
        </div>
        {selected ? (
          <SelectedCounterpartyDetail node={selected} detailId={detailId} labels={addressLabels} onClose={() => setSelectedAddress(null)} />
        ) : (
          <div id={detailId} className={`${styles.stageHint} ${styles.controlPanel}`} aria-live="polite">
            <span className="font-mono uppercase tracking-[0.08em]">Network stage</span>
            <span>Hover, focus, or select a node to inspect the saved observation.</span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <GraphKey showPeerLinks={peerPairs.length > 0} />
      </div>
      <details className="group mt-3 border-t border-linec pt-3">
        <summary className="cursor-pointer list-none font-mono text-[0.58rem] uppercase tracking-[0.09em] text-quiet [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <span className="transition-transform group-open:rotate-45" aria-hidden="true">+</span>
            How to read this map
          </span>
        </summary>
        <div className="mt-2 max-w-3xl space-y-1 text-xs leading-5 text-quiet">
          <p>Every connection is equal and undirected. It means only “observed as a counterparty” in saved evidence—not a trust endorsement—and it does not affect score.</p>
          <p>Bone-colored links between two counterparties mark transaction-verified peer relationships from the trust graph—evidence that those two wallets transacted with each other, never a strength or endorsement.</p>
          <p>The map does not represent transaction count, direction, recency, value, assets, reputation, or edge strength.</p>
        </div>
      </details>
    </section>
  );
}

export function InteractionGraphLedger({ nodes: rawNodes, className = "" }: InteractionGraphLedgerProps) {
  const [copied, setCopied] = useState<string | null>(null);
  /* C2: list order is a client-side display choice fed by the SAME shared
     comparator the ranked API mode uses, so order can never drift between
     surfaces. Default stays the API enumeration (address-asc); the map
     above never reorders — its positions are index-mapped to API order. */
  const [order, setOrder] = useState<"address" | "activity">("address");
  const nodes = useMemo(() => observedNodes(rawNodes), [rawNodes]);
  const displayNodes = useMemo(
    () => order === "activity" ? [...nodes].sort(compareObservedActivity) : nodes,
    [nodes, order]
  );
  const labels = useMemo(
    () => collisionFreeAddressLabels(nodes.map((node) => node.walletAddress)),
    [nodes]
  );

  async function copyAddress(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(address);
      window.setTimeout(() => setCopied((current) => current === address ? null : current), 1800);
    } catch {
      setCopied(null);
    }
  }

  if (!nodes.length) return null;

  return (
    <details className={`group ${className}`} data-testid="interaction-counterparty-drawer">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border border-linec bg-paper-deep/55 px-3 py-3 font-mono text-[0.68rem] font-bold uppercase tracking-[0.1em] text-ink [&::-webkit-details-marker]:hidden">
        <span>View counterparties <span className="ml-1 text-mutedc">({nodes.length})</span></span>
        <span className="flex h-5 w-5 items-center justify-center border border-linec text-sm font-normal transition-transform group-open:rotate-45" aria-hidden="true">+</span>
      </summary>
      <p className="mt-2 px-1 text-xs leading-5 text-mutedc">Supporting actions for the observed wallets above.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 px-1" role="group" aria-label="Counterparty list order">
        <span className="font-mono text-[0.58rem] uppercase tracking-[0.09em] text-quiet">Order</span>
        <button
          type="button"
          aria-pressed={order === "address"}
          onClick={() => setOrder("address")}
          data-testid="interaction-ledger-order-address"
          className={`border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] transition-colors ${order === "address" ? "border-linec bg-paper-deep/70 font-bold text-ink" : "border-linec/70 text-mutedc hover:text-ink"}`}
        >
          Address
        </button>
        <button
          type="button"
          aria-pressed={order === "activity"}
          onClick={() => setOrder("activity")}
          data-testid="interaction-ledger-order-activity"
          className={`border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] transition-colors ${order === "activity" ? "border-linec bg-paper-deep/70 font-bold text-ink" : "border-linec/70 text-mutedc hover:text-ink"}`}
        >
          Observed activity
        </button>
      </div>
      {order === "activity" ? (
        <p className="mt-2 px-1 font-mono text-[0.58rem] uppercase tracking-[0.09em] text-mutedc" data-testid="interaction-ledger-ranked-caption">
          Ranked by observed activity — observation only, never endorsement or trust.
        </p>
      ) : null}
      <ul className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="Observed counterparties">
        {displayNodes.map((node) => {
          const label = nodeLabel(node, labels);
          const canShowProfile = node.registered && node.profileUrl;
          const rowMetrics = ledgerMetricsLine(node);
          return (
            <li key={node.walletAddress} className="min-w-0 border border-linec bg-paper/60 px-3 py-3">
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-semibold text-ink">{label}</p>
                  <p className="mt-1 font-mono text-[0.61rem] uppercase tracking-[0.08em] text-mutedc">
                    {node.registered ? "Registered Kyro profile" : "Observed wallet"} · {node.chains.length} {node.chains.length === 1 ? "chain" : "chains"}
                  </p>
                  {/* C1b-s2: metrics line wraps, never truncates — counts must
                      not be silently clipped (readout truncates only because
                      it lives in a fixed-height console slot). */}
                  <p className="mt-1.5 font-mono text-[0.61rem] uppercase tracking-[0.08em]" data-testid="interaction-ledger-metrics">
                    <span className={rowMetrics.measured ? "text-ink" : "text-mutedc"}>{rowMetrics.text}</span>
                  </p>
                </div>
                {node.verifiedKyroPeer ? <span className="border border-verified/45 bg-verified-bg px-1.5 py-1 font-mono text-[0.56rem] font-bold uppercase tracking-[0.08em] text-verified">Trust overlay</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {canShowProfile ? <Link href={node.profileUrl!} className="arc-button-secondary inline-flex items-center px-2.5 py-1.5 text-xs font-bold">View profile</Link> : <CopyAddressButton address={node.walletAddress} copied={copied === node.walletAddress} onCopy={() => copyAddress(node.walletAddress)} />}
                <ExplorerActions node={node} label={label} />
              </div>
            </li>
          );
        })}
      </ul>
      {copied ? <p role="status" className="mt-3 text-xs text-verified" data-testid="status-interaction-address-copied">Address copied.</p> : null}
    </details>
  );
}
