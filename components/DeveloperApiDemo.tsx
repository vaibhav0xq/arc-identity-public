"use client";

import { useState } from "react";

const DEMO_REQUEST_TIMEOUT_MS = 15_000;
const walletPattern = /^0x[a-fA-F0-9]{40}$/;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9](?:\.arcid)?$/;

function normalizeLookupInput(value: string) {
  return value.trim();
}

function isWalletLookup(value: string) {
  return walletPattern.test(normalizeLookupInput(value));
}

function normalizeWalletLookup(value: string) {
  return normalizeLookupInput(value).toLowerCase();
}

function normalizeUsernameLookup(value: string) {
  const normalized = normalizeLookupInput(value).toLowerCase();
  if (!usernamePattern.test(normalized)) return null;
  return normalized.endsWith(".arcid") ? normalized : `${normalized}.arcid`;
}

function timeoutResult() {
  return {
    error: "Request timeout",
    message: "The API request took longer than expected. Please retry."
  };
}

function safeErrorResult(error: string, message: string, status?: number) {
  return {
    error,
    message,
    ...(status ? { status } : {})
  };
}

export function DeveloperApiDemo() {
  const [lookupValue, setLookupValue] = useState("");
  const [result, setResult] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchScore() {
    const input = normalizeLookupInput(lookupValue);
    if (!input) {
      setResult(safeErrorResult("Invalid input", "Enter a valid EVM wallet address or ARC Identity username."));
      return;
    }

    const endpoint = isWalletLookup(input)
      ? `/api/score/${encodeURIComponent(normalizeWalletLookup(input))}?t=${Date.now()}`
      : (() => {
          const username = normalizeUsernameLookup(input);
          return username ? `/api/profile/${encodeURIComponent(username)}?t=${Date.now()}` : null;
        })();

    if (!endpoint) {
      setResult(safeErrorResult("Invalid input", "Enter a valid EVM wallet address or ARC Identity username."));
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), DEMO_REQUEST_TIMEOUT_MS);
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
        signal: controller.signal
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setResult(safeErrorResult(
          typeof data?.error === "string" ? data.error : "Request failed",
          typeof data?.message === "string" ? data.message : "Could not complete this API request. Please retry.",
          response.status
        ));
        return;
      }
      setResult(data);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setResult(timeoutResult());
      } else {
        setResult(safeErrorResult("Request unavailable", "Could not complete this API request. Please retry."));
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  return (
    <div className="arc-surface min-w-0 rounded-2xl p-5 sm:p-7">
      <p className="arc-section-label">
        Live API demo
      </p>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row">
        <input
          value={lookupValue}
          onChange={(event) => setLookupValue(event.target.value)}
          className="arc-input min-w-0 flex-1 px-5 py-3.5 text-sm outline-none"
          placeholder="Wallet address or username.arcid"
        />
        <button
          onClick={fetchScore}
          disabled={loading}
          className="arc-button-primary px-6 py-3.5 font-extrabold"
        >
          {loading ? "Fetching..." : "Fetch ARC Score"}
        </button>
      </div>
      <pre className="mt-5 min-h-52 max-w-full overflow-auto rounded-xl border border-white/[0.06] bg-[rgba(8,16,22,0.95)] p-4 font-mono text-xs leading-relaxed text-emerald-50/80 sm:p-5 sm:text-sm">
        {JSON.stringify(result ?? { ready: "Enter a wallet or ARC Identity username and fetch ARC Score" }, null, 2)}
      </pre>
    </div>
  );
}

