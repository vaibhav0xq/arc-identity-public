"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { TrustEdge, TrustGraph } from "@/lib/types";
import { TxLink } from "@/components/TxLink";
import { shortenAddress } from "@/lib/wallet";

type Evidence = {
  txHash: string;
  type: string;
  txValue: number;
  occurredAt: string | null;
  direction: "sent" | "received";
};

type WeightBreakdown = {
  base: number;
  repeatInteractions: number;
  reciprocal: number;
  verifiedVolume: number;
  peerScores: number;
  total: number;
};

type RelationshipDetail = {
  peerUsername: string | null;
  peerArcScore: number | null;
  reciprocal: boolean;
  interactionCount: number;
  interactionTypes: string[];
  trustWeight: number;
  firstInteractionAt: string | null;
  lastInteractionAt: string | null;
  weightBreakdown: WeightBreakdown | null;
  evidence: Evidence[];
};

function dateLabel(value: string | null) {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function typeLabel(value: string) {
  return value.replaceAll("_", " ");
}

export function RelationshipDrawer({
  walletAddress,
  edge,
  graph,
  onClose
}: {
  walletAddress: string;
  edge: TrustEdge;
  graph: TrustGraph;
  onClose: () => void;
}) {
  const peerWallet = edge.peerWallet ?? edge.targetWallet;
  const [detail, setDetail] = useState<RelationshipDetail | null>(null);
  const [evidenceState, setEvidenceState] = useState<"loading" | "ready" | "error">("loading");

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    /* Freeze the page with the position-fixed body lock: overflow locks on
       the scroll roots let the browser shift the scroll position (scroll
       anchoring), which made the page jump on close. Fixing the body with a
       compensating top offset keeps the background pixel-identical while
       open, and the exact position is restored on close. Runs once per
       drawer mount so the captured scroll position is the true pre-open one. */
    const scrollY = window.scrollY;
    const bodyStyle = document.body.style;
    const previous = {
      position: bodyStyle.position,
      top: bodyStyle.top,
      left: bodyStyle.left,
      right: bodyStyle.right,
      width: bodyStyle.width,
      overflow: bodyStyle.overflow
    };
    bodyStyle.position = "fixed";
    bodyStyle.top = `-${scrollY}px`;
    bodyStyle.left = "0";
    bodyStyle.right = "0";
    bodyStyle.width = "100%";
    bodyStyle.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      bodyStyle.position = previous.position;
      bodyStyle.top = previous.top;
      bodyStyle.left = previous.left;
      bodyStyle.right = previous.right;
      bodyStyle.width = previous.width;
      bodyStyle.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEvidenceState("loading");
    setDetail(null);
    fetch(`/api/trust/${walletAddress}/relationship/${peerWallet}`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`relationship request failed (${response.status})`);
        return response.json() as Promise<RelationshipDetail>;
      })
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        setEvidenceState("ready");
      })
      .catch(() => {
        if (!cancelled) setEvidenceState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress, peerWallet]);

  /* The drawer opens instantly with the edge data already on screen;
     the API adds tx evidence and the live weight breakdown. */
  const peerUsername = detail?.peerUsername ?? edge.peerUsername ?? null;
  const peerName = peerUsername ?? shortenAddress(peerWallet);
  const interactionTypes = detail?.interactionTypes ?? edge.interactionTypes;
  const reciprocal = detail?.reciprocal ?? edge.reciprocal;
  const trustWeight = detail?.trustWeight ?? edge.trustWeight;
  const interactionCount = detail?.interactionCount ?? edge.interactionCount;
  const peerArcScore = detail?.peerArcScore ?? edge.peerArcScore ?? null;
  const firstInteractionAt = detail?.firstInteractionAt ?? edge.firstInteractionAt;
  const lastInteractionAt = detail?.lastInteractionAt ?? edge.lastInteractionAt;
  const breakdown = detail?.weightBreakdown ?? null;

  const propagatedPoints = Math.min(5, Math.round((graph.metrics.propagatedTrustScore ?? 0) / 3));
  const weightShare = graph.metrics.totalTrustWeight > 0 ? Math.round((trustWeight / graph.metrics.totalTrustWeight) * 100) : 0;

  const stats: Array<[string, string]> = [
    ["Trust weight", `${Math.round(trustWeight)}`],
    ["Verified interactions", `${interactionCount}`],
    ["Status", reciprocal ? "Reciprocal" : "One-way"],
    ["Peer identity score", peerArcScore != null ? `${peerArcScore}` : "Not claimed"],
    ["First verified", dateLabel(firstInteractionAt)],
    ["Last verified", dateLabel(lastInteractionAt)]
  ];

  const breakdownRows: Array<[string, number]> = breakdown
    ? [
      ["Verified relationship base", breakdown.base],
      ["Repeat interactions", breakdown.repeatInteractions],
      ["Reciprocal verification", breakdown.reciprocal],
      ["Verified volume", breakdown.verifiedVolume],
      ["Peer score quality", breakdown.peerScores]
    ]
    : [];

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={`Verified relationship with ${peerName}`}>
      <button type="button" className="absolute inset-0 h-full w-full cursor-default bg-[#252827]/45" onClick={onClose} aria-label="Close relationship panel" />
      <aside className="absolute inset-x-0 bottom-0 max-h-[86vh] overflow-y-auto overscroll-contain border-t-2 border-ink bg-paper px-5 pb-10 pt-5 shadow-panel sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-[460px] sm:border-l sm:border-t-0 sm:border-linec sm:px-8 sm:pb-8 sm:pt-7">
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-linec sm:hidden" aria-hidden="true" />
        <div className="flex items-start justify-between gap-4">
          <p className="arc-section-label">Verified relationship</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[2px] border border-linec px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc transition hover:border-ink hover:text-ink"
          >
            Close
          </button>
        </div>

        <h2 className="mt-3 break-words text-2xl font-extrabold text-ink">{peerName}</h2>
        <p className="mt-2 break-all font-mono text-xs text-mutedc">{peerWallet}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="chip green"><span className="dot" />Transaction verified</span>
          <span className={`chip ${reciprocal ? "green" : "amber"}`}><span className="dot" />{reciprocal ? "Reciprocal" : "One-way"}</span>
        </div>

        {interactionTypes.length > 0 ? (
          <div className="mt-5 border-t border-linec pt-4">
            <p className="kicker">Relationship context</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {interactionTypes.map((type) => (
                <span key={type} className="rounded-[2px] border border-linec px-2.5 py-1 font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc">
                  {typeLabel(type)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-x-6 border-t border-linec">
          {stats.map(([label, value]) => (
            <div key={label} className="border-b border-linec py-3">
              <p className="kicker">{label}</p>
              <p className="mt-1.5 truncate text-base font-extrabold tabular-nums text-ink">{value}</p>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <p className="kicker">How this weight is built</p>
          {breakdown ? (
            <div className="mt-2">
              {breakdownRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-linec py-2.5 text-sm">
                  <span className="text-mutedc">{label}</span>
                  <span className="font-mono font-bold tabular-nums text-ink">{value > 0 ? `+${Math.round(value)}` : "0"}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 py-2.5 text-sm">
                <span className="font-bold text-ink">Trust weight</span>
                <span className="font-mono font-extrabold tabular-nums text-ink">{Math.round(breakdown.total)}</span>
              </div>
            </div>
          ) : evidenceState === "loading" ? (
            <p className="mt-2 text-sm text-mutedc">Loading weight breakdown...</p>
          ) : (
            <p className="mt-2 text-sm text-mutedc">Weight breakdown is unavailable right now.</p>
          )}
        </div>

        <div className="mt-6 border-t border-linec pt-4">
          <p className="kicker">Effect on identity score</p>
          <p className="mt-2 text-sm leading-relaxed text-mutedc">
            Relationships are never scored one by one. The whole verified network currently adds
            {" "}<b className="text-ink">+{propagatedPoints}</b> of a maximum 5 points to this Identity Score.
            {graph.metrics.totalTrustWeight > 0 ? <> This relationship carries <b className="text-ink">{weightShare}%</b> of the total network weight behind that contribution.</> : null}
          </p>
        </div>

        <div className="mt-6 border-t border-linec pt-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="kicker">Onchain evidence</p>
            {evidenceState === "ready" && detail ? (
              <span className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc">{detail.evidence.length} verified tx</span>
            ) : null}
          </div>
          {evidenceState === "loading" ? (
            <p className="mt-2 text-sm text-mutedc">Loading verified transactions...</p>
          ) : evidenceState === "error" ? (
            <p className="mt-2 border border-limited/50 bg-limited-bg px-3 py-2.5 text-sm text-limited">
              Evidence could not be loaded right now. The relationship itself is still transaction verified.
            </p>
          ) : detail && detail.evidence.length > 0 ? (
            <div className="mt-1">
              {detail.evidence.slice(0, 8).map((item) => (
                <div key={item.txHash} className="border-b border-linec py-3 last:border-b-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{typeLabel(item.type)}</p>
                    <p className="font-mono text-[0.65rem] font-bold uppercase tracking-[0.12em] text-mutedc">{item.direction} · {dateLabel(item.occurredAt)}</p>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-[0.7rem] text-mutedc">{item.txHash}</p>
                  <TxLink txHash={item.txHash} className="mt-2" />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-mutedc">No verified transaction records were found for this relationship.</p>
          )}
        </div>

        {peerUsername ? (
          <div className="mt-7">
            <Link href={`/profile/${peerUsername}`} className="arc-button-secondary inline-block px-5 py-3 text-sm font-bold">
              View full profile
            </Link>
          </div>
        ) : (
          <p className="mt-7 text-xs leading-relaxed text-mutedc">This wallet has not claimed a Kyro username yet, so there is no public profile to open.</p>
        )}
      </aside>
    </div>
  );
}
