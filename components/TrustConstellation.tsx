"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TrustEdge, TrustGraph } from "@/lib/types";
import { shortenAddress } from "@/lib/wallet";

/* Trust instrument — a live canvas observatory.
   Peers orbit the wallet on weight rings (closer = stronger). Transaction
   pulses travel along the edges as comets, a radar sweep pings each peer as
   it passes, every node carries a weight gauge arc, and the whole plate
   breathes at 60fps with a parallax dust field and vignette depth. Rendering
   is client-only, so there are no SSR hydration concerns. */

const H = 470;

const BONE = "#f2eee3";
const INK = "#252827";
const MUTED = "#b8bdb2";
const QUIET = "#9aa093";
const GOLD = "#c9a25e";
const GREEN = "#7fa98d";
const ROSE = "#c07f72";

function hashId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function peerLabel(edge: TrustEdge) {
  return edge.peerUsername ?? shortenAddress(edge.peerWallet ?? edge.targetWallet);
}

/* Medallion initials: "creepy.kyro" → "C", bare addresses → first two hex chars. */
function monogram(edge: TrustEdge) {
  const label = peerLabel(edge);
  return label.startsWith("0x") ? label.slice(2, 4).toUpperCase() : label.charAt(0).toUpperCase();
}

function ageLabel(value: string | null) {
  if (!value) return "unknown";
  const days = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86400000));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function clampWeight(weight: number) {
  return Number.isFinite(weight) ? Math.max(0, Math.min(100, weight)) : 0;
}

function easeOut(p: number) {
  const t = Math.max(0, Math.min(1, p));
  return 1 - Math.pow(1 - t, 3);
}

type Particle = { p: number; speed: number; dir: 1 | -1; size: number };

type PeerSpec = {
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

function buildPeers(edges: TrustEdge[]): PeerSpec[] {
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

/* Per-peer mutable animation state (lerped every frame). */
type PeerAnim = { x: number; y: number; angle: number; scale: number; alpha: number; lastPing: number };
type Ripple = { x: number; y: number; born: number; max: number; color: string };

export function TrustConstellation({ graph, onOpen }: { graph: TrustGraph; onOpen?: (edge: TrustEdge) => void }) {
  const router = useRouter();
  // Key the peer build on edge data, not array identity, so background data
  // refreshes with identical peers do not rebuild and replay the intro.
  const edgesKey = graph.edges
    .map((e) => `${e.id}:${e.trustWeight}:${e.interactionCount}:${e.reciprocal ? 1 : 0}:${e.lastInteractionAt ?? ""}`)
    .join("|");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const peers = useMemo(() => buildPeers(graph.edges), [edgesKey]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // Remembers the last peer the user pointed at so the readout does not
  // snap back to the strongest peer when the pointer leaves a node.
  const [lastActive, setLastActive] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pointerTypeRef = useRef<string | null>(null);
  const interactionRef = useRef<{ hovered: string | null; selected: string | null; lastActive: string | null }>({ hovered: null, selected: null, lastActive: null });
  const animRef = useRef<Map<string, PeerAnim>>(new Map());
  const redrawRef = useRef<(() => void) | null>(null);
  const t0Ref = useRef<number | null>(null);

  useEffect(() => {
    interactionRef.current = { hovered, selected, lastActive };
    // Under reduced motion there is no rAF loop, so repaint on interaction.
    redrawRef.current?.();
  }, [hovered, selected, lastActive]);

  // On narrow screens the plate pans horizontally — start centered on "You".
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = scrollRef.current;
    if (!canvas || !wrap || peers.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const monoFamily = (getComputedStyle(canvas).getPropertyValue("--font-dm-mono").trim() || "ui-monospace") + ", monospace";
    const mono = (px: number, weight = 400) => `${weight} ${px}px ${monoFamily}`;

    let w = 0;
    let cx = 0;
    let cy = 0;
    let rMin = 0;
    let rMax = 0;
    let dust: { x: number; y: number; s: number; ph: number; par: number }[] = [];
    let raf = 0;
    // Persist the animation clock across effect re-runs so a data refresh
    // never replays the entry animation mid-session.
    if (t0Ref.current === null) t0Ref.current = performance.now();
    const t0 = t0Ref.current;
    const ripples: Ripple[] = [];

    for (const p of peers) {
      if (!animRef.current.has(p.edge.id)) {
        animRef.current.set(p.edge.id, { x: 0, y: 0, angle: p.baseAngle, scale: 1, alpha: 1, lastPing: -10 });
      }
    }

    function layout() {
      if (!canvas || !wrap || !ctx) return;
      w = Math.max(560, wrap.clientWidth);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${H}px`;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = w / 2;
      cy = H / 2 - 10;
      rMax = Math.min(w / 2 - 175, 186);
      rMin = Math.max(66, rMax * 0.42);
      // Deterministic two-layer dust field, reseeded per layout. The `par`
      // factor gives each mote its own drift speed so the field reads as a
      // parallax star field rather than static grain.
      dust = Array.from({ length: 64 }, (_, i) => {
        const a = Math.abs(Math.sin(i * 127.1) * 43758.5453) % 1;
        const b = Math.abs(Math.sin(i * 311.7) * 12543.8971) % 1;
        return {
          x: cx + (a - 0.5) * (rMax * 2.6),
          y: cy + (b - 0.5) * (rMax * 2.2),
          s: 0.5 + (i % 3) * 0.4,
          ph: (i * 0.61) % (Math.PI * 2),
          par: i % 2 === 0 ? 2.2 : 5.5
        };
      });
    }

    function ringRadius(weight: number) {
      return rMin + (rMax - rMin) * (1 - clampWeight(weight) / 100);
    }

    /* Sample the curved edge (quadratic bezier) between center and a peer. */
    function edgePoint(peer: PeerSpec, node: PeerAnim, u: number) {
      const dx = node.x - cx;
      const dy = node.y - cy;
      const dist = Math.hypot(dx, dy) || 1;
      const ux = dx / dist;
      const uy = dy / dist;
      const p0x = cx + ux * 27;
      const p0y = cy + uy * 27;
      const p1x = node.x - ux * (peer.nodeR + 4);
      const p1y = node.y - uy * (peer.nodeR + 4);
      const mx = (p0x + p1x) / 2 - uy * dist * peer.bow;
      const my = (p0y + p1y) / 2 + ux * dist * peer.bow;
      const v = 1 - u;
      return {
        x: v * v * p0x + 2 * v * u * mx + u * u * p1x,
        y: v * v * p0y + 2 * v * u * my + u * u * p1y
      };
    }

    function draw(now: number) {
      if (!ctx) return;
      const t = (now - t0) / 1000;
      const { hovered: hov, selected: sel, lastActive: last } = interactionRef.current;
      const activeId = hov ?? sel ?? last ?? peers[0].edge.id;
      const dimming = hov !== null || sel !== null;

      ctx.clearRect(0, 0, w, H);

      /* ambient center glow, breathing */
      const glowA = reduce ? 0.08 : 0.06 + 0.035 * Math.sin(t * 0.8);
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMax * 1.25);
      glow.addColorStop(0, `rgba(201,162,94,${glowA.toFixed(3)})`);
      glow.addColorStop(1, "rgba(201,162,94,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, H);

      /* vignette — darkened plate edges give the instrument physical depth */
      const vig = ctx.createRadialGradient(cx, cy, rMax * 0.55, cx, cy, Math.max(w * 0.62, rMax * 1.9));
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.30)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, H);

      /* trusted core — a faint warm disc inside the strongest ring */
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMin);
      core.addColorStop(0, "rgba(201,162,94,0.05)");
      core.addColorStop(0.75, "rgba(201,162,94,0.028)");
      core.addColorStop(1, "rgba(201,162,94,0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, rMin, 0, Math.PI * 2);
      ctx.fill();

      /* parallax dust field — two drift speeds, twinkling */
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        const tw = reduce ? 0.1 : 0.05 + 0.055 * Math.sin(t * 0.7 + i * 1.7);
        const ox = reduce ? 0 : Math.sin(t / d.par + d.ph) * d.par;
        const oy = reduce ? 0 : Math.cos(t / (d.par * 1.4) + d.ph) * (d.par * 0.5);
        ctx.fillStyle = `rgba(242,238,227,${Math.max(0, tw).toFixed(3)})`;
        ctx.fillRect(d.x + ox, d.y + oy, d.s, d.s);
      }

      /* weight rings + labels */
      ctx.font = mono(9.5);
      ctx.textAlign = "left";
      for (let i = 0; i < 4; i++) {
        const wgt = i * 25;
        const rr = ringRadius(wgt);
        const enter = reduce ? 1 : easeOut((t - i * 0.07) / 0.6);
        const shimmer = reduce ? 0 : 0.02 * Math.sin(t * 0.6 + i * 1.3);
        ctx.beginPath();
        ctx.arc(cx, cy, rr, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(242,238,227,${(enter * (0.12 + shimmer)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.setLineDash(wgt === 0 ? [2, 5] : []);
        ctx.lineDashOffset = wgt === 0 ? -t * 3 : 0;
        ctx.stroke();
        ctx.setLineDash([]);
        if (wgt !== 0 && enter > 0.5) {
          ctx.fillStyle = QUIET;
          ctx.fillText(`w${wgt}`, cx + rr + 5, cy - 4);
        }
      }

      /* engraved meridians — faint spokes every 30 degrees fill the plate */
      ctx.strokeStyle = "rgba(242,238,227,0.045)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6 + Math.PI / 12;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (rMin * 0.6), cy + Math.sin(a) * (rMin * 0.6));
        ctx.lineTo(cx + Math.cos(a) * (rMax + 8), cy + Math.sin(a) * (rMax + 8));
        ctx.stroke();
      }

      /* tick marks on the outer ring — a rotating instrument bezel */
      const bezelR = rMax + 14;
      const bezelSpin = reduce ? 0 : t * 0.02;
      ctx.lineWidth = 1;
      for (let i = 0; i < 72; i++) {
        const a = bezelSpin + (i * Math.PI * 2) / 72;
        const major = i % 18 === 0;
        const len = major ? 9 : i % 6 === 0 ? 7 : 3;
        ctx.strokeStyle = major ? "rgba(201,162,94,0.4)" : "rgba(242,238,227,0.14)";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * bezelR, cy + Math.sin(a) * bezelR);
        ctx.lineTo(cx + Math.cos(a) * (bezelR + len), cy + Math.sin(a) * (bezelR + len));
        ctx.stroke();
      }
      /* outer hairline — closes the bezel like a watch case */
      ctx.beginPath();
      ctx.arc(cx, cy, bezelR + 12, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242,238,227,0.055)";
      ctx.stroke();

      /* radar sweep */
      const sweepA = ((t * Math.PI * 2) / 13) % (Math.PI * 2);
      if (!reduce && "createConicGradient" in ctx) {
        const cg = ctx.createConicGradient(sweepA - 0.85, cx, cy);
        cg.addColorStop(0, "rgba(201,162,94,0)");
        cg.addColorStop(0.115, "rgba(201,162,94,0.13)");
        cg.addColorStop(0.135, "rgba(201,162,94,0)");
        cg.addColorStop(1, "rgba(201,162,94,0)");
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, bezelR, sweepA - 0.88, sweepA + 0.04);
        ctx.closePath();
        ctx.fill();
      }

      /* advance peer positions */
      for (const peer of peers) {
        const anim = animRef.current.get(peer.edge.id)!;
        const angle = peer.baseAngle + (reduce ? 0 : t * peer.drift + Math.sin(t * 0.23 + peer.phase) * 0.05);
        const rr = ringRadius(peer.edge.trustWeight) + (reduce ? 0 : Math.sin(t * 0.5 + peer.phase) * 3);
        anim.angle = angle;
        anim.x = cx + Math.cos(angle) * rr;
        anim.y = cy + Math.sin(angle) * rr;
        const isActive = peer.edge.id === activeId;
        const targetScale = isActive && dimming ? 1.28 : 1;
        const targetAlpha = dimming && !isActive ? 0.24 : 1;
        anim.scale += (targetScale - anim.scale) * 0.14;
        anim.alpha += (targetAlpha - anim.alpha) * 0.14;

        /* radar ping when the sweep passes a node */
        if (!reduce) {
          let diff = Math.abs((((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - sweepA);
          diff = Math.min(diff, Math.PI * 2 - diff);
          if (diff < 0.055 && t - anim.lastPing > 3) {
            anim.lastPing = t;
            ripples.push({ x: anim.x, y: anim.y, born: t, max: peer.nodeR + 26, color: peer.risky ? ROSE : GOLD });
          }
        }
      }

      /* orbit wakes — each peer rides its ring and trails a luminous arc,
         so the plate reads as a live orrery instead of empty space */
      for (const peer of peers) {
        const anim = animRef.current.get(peer.edge.id)!;
        const enter = reduce ? 1 : easeOut((t - 0.18 - peer.i * 0.1) / 0.55);
        if (enter <= 0.01) continue;
        const isActive = peer.edge.id === activeId;
        const orbitR = Math.hypot(anim.x - cx, anim.y - cy) || 1;
        ctx.beginPath();
        ctx.arc(cx, cy, orbitR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(242,238,227,${(0.05 * anim.alpha * enter).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        if (!reduce) {
          const dir = peer.drift >= 0 ? 1 : -1;
          const segs = 6;
          const span = 1.05;
          for (let s = 0; s < segs; s++) {
            const a1 = anim.angle - (dir * span * s) / segs;
            const a2 = anim.angle - (dir * span * (s + 1)) / segs;
            ctx.beginPath();
            ctx.arc(cx, cy, orbitR, Math.min(a1, a2), Math.max(a1, a2));
            ctx.strokeStyle = `rgba(201,162,94,${((isActive ? 0.4 : 0.2) * (1 - s / segs) * anim.alpha * enter).toFixed(3)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      /* edges + flowing particles */
      for (const peer of peers) {
        const anim = animRef.current.get(peer.edge.id)!;
        const isActive = peer.edge.id === activeId;
        const enter = reduce ? 1 : easeOut((t - 0.18 - peer.i * 0.1) / 0.55);
        if (enter <= 0.01) continue;
        const width = 1 + clampWeight(peer.edge.trustWeight) / 45;
        const steps = 26;
        const upTo = Math.max(2, Math.round(steps * enter));

        ctx.save();
        ctx.globalAlpha = anim.alpha;
        /* sample the curve once, reuse for every pass */
        const pts: { x: number; y: number }[] = [];
        for (let s = 0; s <= upTo; s++) pts.push(edgePoint(peer, anim, s / steps));
        const tail = pts[0];
        const head = pts[pts.length - 1];

        /* under-glow pass — a wide, faint halo beneath the ribbon makes
           the edge read as luminous without expensive blur */
        ctx.beginPath();
        for (let s = 0; s < pts.length; s++) {
          if (s === 0) ctx.moveTo(pts[s].x, pts[s].y);
          else ctx.lineTo(pts[s].x, pts[s].y);
        }
        ctx.strokeStyle = isActive ? "rgba(201,162,94,0.14)" : "rgba(201,162,94,0.06)";
        ctx.lineWidth = width + 8;
        ctx.lineCap = "round";
        ctx.stroke();

        /* tapered ribbon — wide at the wallet, narrowing toward the peer,
           built as a filled polygon between two offset curves */
        const weightBoost = 0.75 + (clampWeight(peer.edge.trustWeight) / 100) * 0.6;
        const wRoot = (isActive ? 5.6 : 3.6) * weightBoost;
        const wTip = (isActive ? 1.7 : 1.1) * weightBoost;
        const lastIdx = pts.length - 1 || 1;
        const leftPts: { x: number; y: number }[] = [];
        const rightPts: { x: number; y: number }[] = [];
        for (let s = 0; s < pts.length; s++) {
          const prev = pts[Math.max(0, s - 1)];
          const next = pts[Math.min(pts.length - 1, s + 1)];
          const tx = next.x - prev.x;
          const ty = next.y - prev.y;
          const tl = Math.hypot(tx, ty) || 1;
          const nx = -ty / tl;
          const ny = tx / tl;
          const half = (wRoot + (wTip - wRoot) * (s / lastIdx)) / 2;
          leftPts.push({ x: pts[s].x + nx * half, y: pts[s].y + ny * half });
          rightPts.push({ x: pts[s].x - nx * half, y: pts[s].y - ny * half });
        }
        const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        if (isActive) {
          grad.addColorStop(0, "rgba(201,162,94,0.24)");
          grad.addColorStop(1, "rgba(201,162,94,0.95)");
          ctx.shadowColor = "rgba(201,162,94,0.5)";
          ctx.shadowBlur = 10;
        } else {
          grad.addColorStop(0, "rgba(201,162,94,0.08)");
          grad.addColorStop(1, "rgba(201,162,94,0.6)");
        }
        ctx.beginPath();
        ctx.moveTo(leftPts[0].x, leftPts[0].y);
        for (let s = 1; s < leftPts.length; s++) ctx.lineTo(leftPts[s].x, leftPts[s].y);
        for (let s = rightPts.length - 1; s >= 0; s--) ctx.lineTo(rightPts[s].x, rightPts[s].y);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;

        /* bright spine keeps the ribbon crisp */
        ctx.beginPath();
        for (let s = 0; s < pts.length; s++) {
          if (s === 0) ctx.moveTo(pts[s].x, pts[s].y);
          else ctx.lineTo(pts[s].x, pts[s].y);
        }
        ctx.strokeStyle = isActive ? "rgba(242,238,227,0.45)" : "rgba(242,238,227,0.16)";
        ctx.lineWidth = 0.8;
        ctx.lineCap = "round";
        ctx.stroke();

        /* reciprocal companion line — animated dashes flowing back */
        if (peer.edge.reciprocal) {
          ctx.beginPath();
          const dx = anim.x - cx;
          const dy = anim.y - cy;
          const dist = Math.hypot(dx, dy) || 1;
          const ox = (-dy / dist) * 4;
          const oy = (dx / dist) * 4;
          for (let s = 0; s <= upTo; s++) {
            const pt = edgePoint(peer, anim, s / steps);
            if (s === 0) ctx.moveTo(pt.x + ox, pt.y + oy);
            else ctx.lineTo(pt.x + ox, pt.y + oy);
          }
          ctx.strokeStyle = isActive ? "rgba(127,169,141,0.95)" : "rgba(127,169,141,0.5)";
          ctx.lineWidth = 1.3;
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = reduce ? 0 : t * 10;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        /* transaction pulses — comets with fading tails */
        if (!reduce && enter > 0.9) {
          for (const part of peer.particles) {
            const u = (((part.p + t * part.speed * part.dir) % 1) + 1) % 1;
            const color = part.dir === 1 ? GOLD : GREEN;
            const baseA = anim.alpha * (isActive ? 0.95 : 0.6) * Math.sin(u * Math.PI);
            /* tail — trailing samples shrink and fade behind the head */
            ctx.fillStyle = color;
            for (let k = 4; k >= 1; k--) {
              const ut = u - part.dir * k * 0.022;
              if (ut < 0 || ut > 1) continue;
              const tp = edgePoint(peer, anim, ut);
              ctx.globalAlpha = baseA * (0.32 - k * 0.06);
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, part.size * (isActive ? 1.25 : 1) * (1 - k * 0.16), 0, Math.PI * 2);
              ctx.fill();
            }
            /* head */
            const pt = edgePoint(peer, anim, u);
            ctx.shadowColor = color;
            ctx.shadowBlur = 7;
            ctx.globalAlpha = baseA;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, part.size * (isActive ? 1.25 : 1), 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
        ctx.restore();
      }

      /* ripples */
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        const age = (t - rp.born) / 1.4;
        if (age >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const rr = 6 + easeOut(age) * rp.max;
        ctx.strokeStyle = rp.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rr, 0, Math.PI * 2);
        ctx.globalAlpha = (1 - age) * 0.5;
        ctx.stroke();
        /* trailing second ring, sonar style */
        ctx.beginPath();
        ctx.arc(rp.x, rp.y, rr * 0.62, 0, Math.PI * 2);
        ctx.globalAlpha = (1 - age) * 0.24;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      /* center node — a wound instrument crown with a confidence dial */
      const centerEnter = reduce ? 1 : easeOut(t / 0.5);
      ctx.save();
      ctx.globalAlpha = centerEnter;
      const auraR = 52 + (reduce ? 0 : Math.sin(t * 0.9) * 5);
      const aura = ctx.createRadialGradient(cx, cy, 8, cx, cy, auraR);
      aura.addColorStop(0, "rgba(201,162,94,0.24)");
      aura.addColorStop(1, "rgba(201,162,94,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
      ctx.fill();

      /* confidence dial — trust confidence winds around the crown */
      const confRaw = graph.metrics?.trustConfidence ?? 0;
      const conf = Math.max(0, Math.min(1, confRaw > 1 ? confRaw / 100 : confRaw)) * centerEnter;
      ctx.beginPath();
      ctx.arc(cx, cy, 33, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(242,238,227,0.1)";
      ctx.lineWidth = 2.4;
      ctx.stroke();
      if (conf > 0.01) {
        ctx.beginPath();
        ctx.arc(cx, cy, 33, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * conf);
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.stroke();
      }

      /* counter-rotating orbits — gyroscope feel */
      ctx.beginPath();
      ctx.arc(cx, cy, 40, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(201,162,94,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 6]);
      ctx.lineDashOffset = reduce ? 0 : -t * 7;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, 47, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(201,162,94,0.18)";
      ctx.setLineDash([1.5, 8]);
      ctx.lineDashOffset = reduce ? 0 : t * 5;
      ctx.stroke();
      ctx.setLineDash([]);

      const crown = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 27);
      crown.addColorStop(0, "#3d423b");
      crown.addColorStop(1, "#2b2f2a");
      ctx.beginPath();
      ctx.arc(cx, cy, 27 * centerEnter, 0, Math.PI * 2);
      ctx.fillStyle = crown;
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 12;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = GOLD;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = BONE;
      ctx.font = `700 12.5px ${monoFamily}`;
      ctx.textAlign = "center";
      ctx.fillText("You", cx, cy + 1);
      ctx.fillStyle = QUIET;
      ctx.font = mono(8);
      ctx.fillText(`${Math.round(conf * 100)}% conf`, cx, cy + 13);
      ctx.restore();

      /* peer nodes + labels (active drawn last, on top) */
      const ordered = [...peers].sort((a, b) => (a.edge.id === activeId ? 1 : 0) - (b.edge.id === activeId ? 1 : 0));
      for (const peer of ordered) {
        const anim = animRef.current.get(peer.edge.id)!;
        const isActive = peer.edge.id === activeId;
        const enter = reduce ? 1 : easeOut((t - 0.32 - peer.i * 0.1) / 0.5);
        if (enter <= 0.01) continue;
        const R = peer.nodeR * anim.scale * enter;

        ctx.save();
        ctx.globalAlpha = anim.alpha * enter;

        /* weight gauge — an arc around the medallion showing trust weight
           out of 100, like a wound instrument dial */
        const gaugeR = R + 5.5;
        const frac = (clampWeight(peer.edge.trustWeight) / 100) * enter;
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, gaugeR, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(242,238,227,0.12)";
        ctx.lineWidth = 2.2;
        ctx.stroke();
        if (frac > 0.01) {
          ctx.beginPath();
          ctx.arc(anim.x, anim.y, gaugeR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
          ctx.strokeStyle = peer.risky ? ROSE : GOLD;
          ctx.globalAlpha = anim.alpha * enter * (isActive ? 0.95 : 0.6);
          ctx.lineWidth = 2.2;
          ctx.lineCap = "round";
          ctx.stroke();
          ctx.globalAlpha = anim.alpha * enter;
        }

        if (peer.edge.reciprocal) {
          ctx.beginPath();
          ctx.arc(anim.x, anim.y, R + 9.5, 0, Math.PI * 2);
          ctx.strokeStyle = "rgba(127,169,141,0.7)";
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 3]);
          ctx.lineDashOffset = reduce ? 0 : t * 5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (isActive) {
          ctx.shadowColor = "rgba(201,162,94,0.6)";
          ctx.shadowBlur = 14;
        }
        /* node body — radial fill gives it a machined, domed surface */
        const body = ctx.createRadialGradient(anim.x - R * 0.35, anim.y - R * 0.35, R * 0.15, anim.x, anim.y, R);
        if (isActive) {
          body.addColorStop(0, "#faf7ee");
          body.addColorStop(1, "#e6e0cf");
        } else {
          body.addColorStop(0, "#474c45");
          body.addColorStop(1, "#343833");
        }
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, R, 0, Math.PI * 2);
        ctx.fillStyle = body;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = peer.risky ? ROSE : isActive ? GOLD : "#8f9489";
        ctx.lineWidth = isActive ? 2 : 1.2;
        ctx.stroke();
        /* specular — a hairline catch of light on the upper-left rim.
           Guard the radius: during the entry animation R can dip below the
           inset and a negative arc radius throws, killing the draw loop. */
        if (R > 2.5) {
          ctx.beginPath();
          ctx.arc(anim.x, anim.y, R - 1.2, Math.PI * 0.85, Math.PI * 1.45);
          ctx.strokeStyle = isActive ? "rgba(255,255,255,0.5)" : "rgba(242,238,227,0.22)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        /* medallion initial — gives every peer a face at a glance */
        if (R > 7) {
          ctx.font = `700 ${Math.max(9, R * 0.68)}px ${monoFamily}`;
          ctx.textAlign = "center";
          ctx.fillStyle = isActive ? INK : "#cfd3c9";
          ctx.fillText(monogram(peer.edge), anim.x, anim.y + R * 0.24);
        }

        /* targeting reticle — corner brackets lock onto the active node */
        if (isActive && dimming) {
          const lock = Math.max(0, Math.min(1, (anim.scale - 1) / 0.26));
          if (lock > 0.05) {
            const B = R + 13 - lock * 3;
            const L = 6;
            ctx.strokeStyle = GOLD;
            ctx.globalAlpha = anim.alpha * enter * lock * 0.9;
            ctx.lineWidth = 1.4;
            for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
              ctx.beginPath();
              ctx.moveTo(anim.x + sx * B - sx * L, anim.y + sy * B);
              ctx.lineTo(anim.x + sx * B, anim.y + sy * B);
              ctx.lineTo(anim.x + sx * B, anim.y + sy * B - sy * L);
              ctx.stroke();
            }
            ctx.globalAlpha = anim.alpha * enter;
          }
        }

        /* label plates — name, a weight bar and the interaction tally on an
           engraved backing plate for legibility over rings */
        const cos = (anim.x - cx) / (Math.hypot(anim.x - cx, anim.y - cy) || 1);
        const anchor: CanvasTextAlign = cos > 0.35 ? "left" : cos < -0.35 ? "right" : "center";
        const lx = anim.x + (anchor === "left" ? R + 14 : anchor === "right" ? -(R + 14) : 0);
        const above = anim.y < cy;
        const ly = anchor === "center" ? (above ? anim.y - R - 30 : anim.y + R + 26) : anim.y - 5;
        const nameText = `${peerLabel(peer.edge)}${peer.edge.reciprocal ? " ↔" : ""}`;
        const subText = `w${Math.round(clampWeight(peer.edge.trustWeight))} · ${peer.edge.interactionCount}× verified`;
        ctx.font = mono(13);
        const w1 = ctx.measureText(nameText).width;
        ctx.font = mono(9.5);
        const w2 = ctx.measureText(subText).width;
        const bw = Math.max(w1, w2, 60) + 16;
        const bx = anchor === "left" ? lx - 8 : anchor === "right" ? lx - bw + 8 : lx - bw / 2;
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(bx, ly - 13, bw, 40, 2);
          ctx.fillStyle = "rgba(28,31,29,0.72)";
          ctx.fill();
          ctx.strokeStyle = isActive ? "rgba(201,162,94,0.45)" : "rgba(242,238,227,0.1)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.textAlign = anchor;
        ctx.font = mono(13);
        ctx.fillStyle = isActive ? BONE : "#d9d6ca";
        ctx.fillText(nameText, lx, ly);
        /* weight bar — instant visual for how strong this bond is */
        const barW = bw - 16;
        const barX = anchor === "left" ? lx : anchor === "right" ? lx - barW : lx - barW / 2;
        ctx.fillStyle = "rgba(242,238,227,0.14)";
        ctx.fillRect(barX, ly + 6, barW, 3);
        ctx.fillStyle = peer.risky ? ROSE : GOLD;
        ctx.fillRect(barX, ly + 6, barW * (clampWeight(peer.edge.trustWeight) / 100) * enter, 3);
        ctx.font = mono(9.5);
        ctx.fillStyle = isActive ? MUTED : QUIET;
        ctx.fillText(subText, lx, ly + 21);
        ctx.restore();
      }

      /* legend */
      ctx.textAlign = "left";
      ctx.font = mono(9.5);
      ctx.fillStyle = QUIET;
      ctx.fillText("▰ ribbon = verified bond   ◠ gauge + bar = weight   ● comets = interactions   ⌒ wake = orbit", 16, H - 14);
    }

    function loop(now: number) {
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    layout();
    redrawRef.current = () => {
      if (reduce) draw(performance.now());
    };
    if (reduce) draw(performance.now());
    else raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      layout();
      if (reduce) draw(performance.now());
    });
    ro.observe(wrap);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      redrawRef.current = null;
    };
  }, [peers]);

  if (peers.length === 0) return null;

  const activeId = hovered ?? selected ?? lastActive ?? peers[0].edge.id;
  const active = peers.find((p) => p.edge.id === activeId) ?? peers[0];

  function hitTest(offsetX: number, offsetY: number) {
    let best: PeerSpec | null = null;
    let bestDist = Infinity;
    for (const peer of peers) {
      const anim = animRef.current.get(peer.edge.id);
      if (!anim) continue;
      const d = Math.hypot(offsetX - anim.x, offsetY - anim.y);
      if (d < peer.nodeR + 11 && d < bestDist) {
        best = peer;
        bestDist = d;
      }
    }
    return best;
  }

  function open(peer: PeerSpec) {
    if (onOpen) {
      /* Clear the sticky selection so the other nodes are not left dimmed
         after the drawer closes; lastActive keeps the readout on this peer
         without triggering the dimming treatment. */
      setSelected(null);
      setLastActive(peer.edge.id);
      onOpen(peer.edge);
      return;
    }
    if (peer.edge.peerUsername) router.push(`/profile/${peer.edge.peerUsername}`);
    else setSelected(peer.edge.id);
  }

  function activate(peer: PeerSpec) {
    const pointerType = pointerTypeRef.current ?? "mouse";
    pointerTypeRef.current = null;
    if (pointerType === "mouse") {
      // Desktop: hover already previews the peer, so click opens directly.
      open(peer);
      return;
    }
    // Touch/pen: first tap selects (shows readout), second tap opens.
    if (selected === peer.edge.id) open(peer);
    else setSelected(peer.edge.id);
  }

  return (
    <div className="credential-plate mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="kicker" style={{ color: MUTED }}>Trust instrument</p>
        <p className="font-mono text-[0.6rem] uppercase tracking-[0.16em]" style={{ color: QUIET }}>
          {peers.length === 1 ? "01 peer plotted" : `0${peers.length} peers plotted`} · closer = stronger
        </p>
      </div>

      <div ref={scrollRef} className="mt-4 overflow-x-auto">
        <canvas
          ref={canvasRef}
          className="block min-w-[560px]"
          style={{ height: H }}
          role="img"
          aria-label={`Trust graph: ${peers.length} verified peers around your wallet`}
          onPointerDown={(event) => {
            pointerTypeRef.current = event.pointerType || "mouse";
          }}
          onPointerMove={(event) => {
            if (event.pointerType && event.pointerType !== "mouse") return;
            const hit = hitTest(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
            event.currentTarget.style.cursor = hit ? "pointer" : "default";
            setHovered(hit ? hit.edge.id : null);
            if (hit) setLastActive(hit.edge.id);
          }}
          onPointerLeave={() => setHovered(null)}
          onClick={(event) => {
            const hit = hitTest(event.nativeEvent.offsetX, event.nativeEvent.offsetY);
            if (hit) activate(hit);
            else setSelected(null);
          }}
        />
      </div>

      {/* keyboard access — mirrors the canvas nodes for focus users */}
      <div className="sr-only">
        {peers.map((peer) => (
          <button
            key={peer.edge.id}
            type="button"
            onFocus={() => setSelected(peer.edge.id)}
            onClick={() => open(peer)}
          >
            {peerLabel(peer.edge)}, trust weight {Math.round(peer.edge.trustWeight)}
            {peer.edge.peerUsername ? ", open profile" : ""}
          </button>
        ))}
      </div>

      {/* readout for the active peer */}
      <div className="mt-2 border-t pt-4" style={{ borderColor: "#4a4f48" }}>
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-bold" style={{ color: BONE }}>{peerLabel(active.edge)}</p>
            <p className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.14em]" style={{ color: QUIET }}>
              {active.edge.interactionTypes.join(", ").replaceAll("_", " ") || "verified interaction"}
              {active.edge.reciprocal ? " · reciprocal" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-7 gap-y-3">
            {[
              ["Weight", `${Math.round(active.edge.trustWeight)}`],
              ["Interactions", `${active.edge.interactionCount}`],
              ["Identity score", active.edge.peerArcScore != null ? `${active.edge.peerArcScore}` : "n/a"],
              ["Risk", active.edge.peerRiskLevel ?? "n/a"],
              ["Last", ageLabel(active.edge.lastInteractionAt)]
            ].map(([label, value]) => (
              <div key={label}>
                <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em]" style={{ color: QUIET }}>{label}</p>
                <p className="mt-1 text-sm font-bold tabular-nums" style={{ color: MUTED }}>{value}</p>
              </div>
            ))}
          </div>
          {active.edge.peerUsername ? (
            <a
              href={`/profile/${active.edge.peerUsername}`}
              className="rounded-[2px] border px-3.5 py-2 text-xs font-bold transition hover:border-[#c9a25e]"
              style={{ borderColor: "#5b6058", color: BONE }}
            >
              View profile →
            </a>
          ) : null}
        </div>
      </div>

      <div className="plate-meta">
        <span>{graph.edges.length > 8 ? `top 8 of ${graph.edges.length} verified peers` : "transaction-verified relationships only"}</span>
        <span>hover or tap a node · tap again to open</span>
      </div>
    </div>
  );
}
