"use client";

import { useState } from "react";

const DEMO_REQUEST_TIMEOUT_MS = 15_000;
const walletPattern = /^0x[a-fA-F0-9]{40}$/;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9](?:\.(?:kyro|arcid))?$/;

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
  return normalized.endsWith(".kyro") || normalized.endsWith(".arcid") ? normalized : `${normalized}.kyro`;
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
      setResult(safeErrorResult("Invalid input", "Enter a valid EVM wallet address or Kyro username."));
      return;
    }

    const endpoint = isWalletLookup(input)
      ? `/api/score/${encodeURIComponent(normalizeWalletLookup(input))}?t=${Date.now()}`
      : (() => {
          const username = normalizeUsernameLookup(input);
          return username ? `/api/profile/${encodeURIComponent(username)}?t=${Date.now()}` : null;
        })();

    if (!endpoint) {
      setResult(safeErrorResult("Invalid input", "Enter a valid EVM wallet address or Kyro username."));
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
    <section className="r4-panel min-w-0" aria-labelledby="live-demo-title">
      <div className="r4-panel-head items-end px-0">
        <div>
          <p className="kicker">Live request / no mock data</p>
          <h2 id="live-demo-title" className="mt-1 font-heading text-2xl font-semibold sm:text-3xl">Query a credential record</h2>
        </div>
        <span className="font-mono text-[0.625rem] text-quiet">GET /score · GET /profile</span>
      </div>
      <div className="r4-panel-body px-0 sm:px-0">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={lookupValue}
            onChange={(event) => setLookupValue(event.target.value)}
            className="arc-input min-w-0 flex-1 px-4 py-3.5 font-mono text-sm outline-none"
            placeholder="Wallet address or username.kyro"
          />
          <button
            onClick={fetchScore}
            disabled={loading}
            className="arc-button-primary px-6 py-3.5 font-semibold"
          >
            {loading ? "Fetching..." : "Fetch Identity Score"}
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="kicker">Raw response</span>
          <span className={loading ? "chip amber" : "chip"}><span className="dot" />{loading ? "request active" : result ? "response received" : "ready"}</span>
        </div>
        <pre className="arc-code-block mt-3 min-h-52 max-w-full overflow-auto p-4 text-xs leading-relaxed text-bone sm:p-5 sm:text-sm">
          {JSON.stringify(result ?? { ready: "Enter a wallet or Kyro username and fetch Identity Score" }, null, 2)}
        </pre>
      </div>
    </section>
  );
}

