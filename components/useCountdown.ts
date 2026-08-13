"use client";

import { useEffect, useState } from "react";

/* Whole-second countdown to a target timestamp; null target means no
   countdown. Ticks twice a second so the displayed number never looks
   stuck at a boundary. */
export function useCountdownSeconds(targetMs: number | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(() =>
    targetMs === null ? null : Math.max(0, Math.ceil((targetMs - Date.now()) / 1000))
  );

  useEffect(() => {
    if (targetMs === null) {
      setSeconds(null);
      return;
    }
    const update = () => setSeconds(Math.max(0, Math.ceil((targetMs - Date.now()) / 1000)));
    update();
    const interval = window.setInterval(update, 500);
    return () => window.clearInterval(interval);
  }, [targetMs]);

  return seconds;
}
