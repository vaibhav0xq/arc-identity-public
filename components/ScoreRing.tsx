"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function ScoreRing({ score, size = "large", pulsing = false }: { score: number; size?: "large" | "small"; pulsing?: boolean }) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(Number.isFinite(score) ? score : 0)));
  const [displayScore, setDisplayScore] = useState(0);
  const previousScoreRef = useRef(0);
  const firstRenderRef = useRef(true);
  const dimensions = size === "large" ? "h-44 w-44 min-[390px]:h-48 min-[390px]:w-48 sm:h-56 sm:w-56" : "h-28 w-28";
  const scoreText = size === "large" ? "text-5xl sm:text-7xl" : "text-3xl";
  const ringBorderSize = size === "large" ? "-inset-2 sm:-inset-4" : "-inset-2";

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplayScore(clampedScore);
      previousScoreRef.current = clampedScore;
      firstRenderRef.current = false;
      return;
    }

    const from = firstRenderRef.current ? 0 : previousScoreRef.current;
    const to = clampedScore;
    const duration = size === "large" ? 1200 : 950;
    const startedAt = performance.now();
    let animationFrame = 0;

    function tick(now: number) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      } else {
        previousScoreRef.current = to;
        firstRenderRef.current = false;
      }
    }

    animationFrame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [clampedScore, size]);

  return (
    <div className={`relative max-w-full shrink-0 ${pulsing ? "score-ring-refreshing" : ""}`}>
      <div className={`absolute ${ringBorderSize} rounded-full border border-gold/30 bg-gold-bg/30`} />
      <div
        className={`${dimensions} score-ring relative grid place-items-center rounded-full border border-white/[0.12] transition duration-500 hover:scale-[1.015]`}
        style={{ "--score": displayScore } as React.CSSProperties}
        aria-label={`Identity Score ${clampedScore}`}
      >
        <div className="text-center">
          <div className={`${scoreText} font-black tabular-nums text-ink`}>{displayScore}</div>
          <div className="mt-0.5 font-mono text-[0.65rem] font-bold uppercase tracking-[0.28em] text-mutedc">
            Identity Score
          </div>
        </div>
      </div>
    </div>
  );
}
