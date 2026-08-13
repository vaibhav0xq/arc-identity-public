"use client";

import { useEffect, useRef, useState } from "react";

/* Tiny client leaf so server-rendered pages (receipt view) can offer
   copy-to-clipboard on ids, wallets and hashes without becoming client pages. */
export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <button
      type="button"
      className={`copy-chip${done ? " is-done" : ""}`}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setDone(false), 1800);
        } catch {
          /* Clipboard unavailable (permissions/HTTP): values remain selectable text. */
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
