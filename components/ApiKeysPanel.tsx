"use client";

import { useEffect, useRef, useState } from "react";
import { signChallengeWithConnectedWallet } from "@/lib/wallet-challenge-client";

interface KeyRow {
  id: string;
  keyPrefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

const RATE_FACTS: Array<[string, string]> = [
  ["Anonymous requests", "20 / min"],
  ["With an API key", "120 / min"]
];

function currentWallet() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("arcIdentityWallet") ?? "";
}

/* Every key action signs a fresh single-use challenge. Nothing is cached:
   the wallet prompt itself is the authorization step. */
async function keyManagementCredentials(wallet: string) {
  const { signature, signatureMessage } = await signChallengeWithConnectedWallet(wallet, "key-management");
  return { walletAddress: wallet, signature, signatureMessage };
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function ApiKeysPanel() {
  const [wallet, setWallet] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [label, setLabel] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const confirmTimerRef = useRef<number | null>(null);
  const walletRef = useRef("");

  useEffect(() => {
    function syncWallet() {
      const next = currentWallet();
      if (next.toLowerCase() !== walletRef.current.toLowerCase()) {
        walletRef.current = next;
        setUnlocked(false);
        setKeys([]);
        setFreshKey(null);
        setStatus(null);
        setConfirmRevokeId(null);
      }
      setWallet(next);
    }
    syncWallet();
    window.addEventListener("storage", syncWallet);
    window.addEventListener("arc-identity-wallet-changed", syncWallet);
    return () => {
      window.removeEventListener("storage", syncWallet);
      window.removeEventListener("arc-identity-wallet-changed", syncWallet);
      if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    };
  }, []);

  const unlockKeys = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const credentials = await keyManagementCredentials(wallet);
      const response = await fetch("/api/v1/keys/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials)
      });
      const json = await response.json();
      if (json.ok) {
        setKeys(json.data.keys);
        setUnlocked(true);
        setStatus(null);
      } else {
        setStatus(json.error?.message ?? "Could not load keys.");
      }
    } catch (error) {
      setStatus(errorText(error, "Could not load keys. Please retry."));
    } finally {
      setBusy(false);
    }
  };

  const createKey = async () => {
    if (!wallet || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const credentials = await keyManagementCredentials(wallet);
      const response = await fetch("/api/v1/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credentials, label: label.trim() || "default" })
      });
      const json = await response.json();
      if (json.ok) {
        setFreshKey(json.data.apiKey);
        setCopied(false);
        setLabel("");
        /* The response carries the created row, so no refetch is needed.
           A refetch would ask for a second signature. */
        if (json.data.key) setKeys((rows) => [json.data.key as KeyRow, ...rows]);
      } else {
        setStatus(json.error?.message ?? "Could not create the key.");
      }
    } catch (error) {
      setStatus(errorText(error, "Could not create the key. Please retry."));
    } finally {
      setBusy(false);
    }
  };

  const revokeKey = async (keyId: string) => {
    if (!wallet || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const credentials = await keyManagementCredentials(wallet);
      const response = await fetch("/api/v1/keys/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credentials, keyId })
      });
      const json = await response.json();
      if (json.ok) {
        const revoked = json.data.revoked as KeyRow | undefined;
        setKeys((rows) => rows.map((row) => (row.id === keyId ? { ...row, ...(revoked ?? { revokedAt: new Date().toISOString() }) } : row)));
      } else {
        setStatus(json.error?.message ?? "Could not revoke the key.");
      }
    } catch (error) {
      setStatus(errorText(error, "Could not revoke the key. Please retry."));
    } finally {
      setBusy(false);
    }
  };

  const copyFreshKey = async () => {
    if (!freshKey) return;
    try {
      await navigator.clipboard.writeText(freshKey);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      // Clipboard unavailable; the key stays visible for manual copy.
    }
  };

  const requestRevoke = (keyId: string) => {
    if (confirmTimerRef.current) window.clearTimeout(confirmTimerRef.current);
    if (confirmRevokeId === keyId) {
      setConfirmRevokeId(null);
      void revokeKey(keyId);
      return;
    }
    setConfirmRevokeId(keyId);
    confirmTimerRef.current = window.setTimeout(() => setConfirmRevokeId(null), 3500);
  };

  const activeKeys = keys.filter((key) => !key.revokedAt);

  return (
    <section className="r4-panel mt-10 min-w-0" aria-labelledby="api-keys-title">
      <div className="r4-panel-head">
        <div>
          <p className="kicker">Access</p>
          <h2 id="api-keys-title" className="mt-1 font-heading text-2xl font-semibold">API keys</h2>
        </div>
        <span className="chip">beta · invite-only</span>
      </div>
      <div className="r4-panel-body">
        <div className="grid min-w-0 gap-x-12 gap-y-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="min-w-0">
            <p className="text-sm leading-6 text-mutedc">
              A key identifies your integration and unlocks the higher rate limit. Send it with every request as{" "}
              <code className="font-mono text-xs text-ink">Authorization: Bearer kyro_live_...</code>
            </p>
            <div className="mt-4">
              {RATE_FACTS.map(([fact, value]) => (
                <div className="ledger-row" key={fact}>
                  <span className="min-w-0"><b className="font-medium text-ink">{fact}</b></span>
                  <span className="font-mono text-xs text-ink">{value}</span>
                </div>
              ))}
              <div className="ledger-row">
                <span className="min-w-0"><b className="font-medium text-ink">Active keys</b></span>
                <span className="font-mono text-xs text-ink">{unlocked ? `${activeKeys.length} of 3` : "N/A"}</span>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-quiet">
              During beta, key creation is limited to approved wallets. Keys are shown once at creation and stored only as a fingerprint. Treat them like passwords.
            </p>
          </div>

          <div className="min-w-0">
            {!wallet ? (
              <div className="verify-note">
                <p className="font-medium text-ink">Connect your wallet to manage API keys.</p>
                <p className="mt-1">Every key action is confirmed with a wallet signature.</p>
              </div>
            ) : !unlocked ? (
              <div className="verify-note">
                <p className="font-medium text-ink">Unlock key management with a wallet signature.</p>
                <p className="mt-1">Signing a one-time verification message lists your keys. Creating and revoking keys each ask for a fresh signature.</p>
                <button
                  type="button"
                  className="arc-button-primary mt-4 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void unlockKeys()}
                  disabled={busy}
                >
                  {busy ? "Waiting for signature..." : "Unlock API keys"}
                </button>
                {status ? (
                  <div className="mt-4 border-l-2 border-[#8c4a3f] bg-[#ecdcd4] px-3.5 py-3 text-xs leading-5 text-[#6d3a31]" role="status">
                    {status}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                <p className="kicker">New key</p>
                <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                  <input
                    id="api-key-label"
                    className="arc-input min-w-0 flex-1 px-4 py-3 font-mono text-xs outline-none"
                    placeholder="Key label (e.g. my-integration)"
                    value={label}
                    maxLength={64}
                    onChange={(event) => setLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void createKey();
                    }}
                  />
                  <button
                    type="button"
                    className="arc-button-primary shrink-0 px-5 py-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void createKey()}
                    disabled={busy}
                  >
                    {busy ? "Working..." : "Create key"}
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-quiet">Each create or revoke asks for a wallet signature.</p>

                {freshKey ? (
                  <div className="verify-note mt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-medium text-ink">Copy this key now. It is shown only once.</p>
                      <button type="button" className="chip cursor-pointer" onClick={() => void copyFreshKey()}>
                        {copied ? "Copied" : "Copy key"}
                      </button>
                    </div>
                    <code className="mt-2 block overflow-x-auto whitespace-nowrap font-mono text-xs text-ink">{freshKey}</code>
                  </div>
                ) : null}

                {status ? (
                  <div className="mt-5 border-l-2 border-[#8c4a3f] bg-[#ecdcd4] px-3.5 py-3 text-xs leading-5 text-[#6d3a31]" role="status">
                    {status}
                  </div>
                ) : null}

                <div className="mt-7">
                  <div className="flex items-baseline justify-between border-b border-linec pb-2">
                    <p className="kicker">Your keys</p>
                    <span className="font-mono text-[0.65rem] text-quiet">{activeKeys.length} active</span>
                  </div>
                  {activeKeys.length === 0 ? (
                    <p className="mt-4 text-sm text-mutedc">No active keys yet. Create one to unlock 120 requests per minute.</p>
                  ) : (
                    activeKeys.map((key) => (
                      <div className="ledger-row" key={key.id}>
                        <span className="min-w-0">
                          <code className="block font-mono text-xs text-ink">{key.keyPrefix}...</code>
                          <small>
                            {key.label || "unlabeled"} · created {new Date(key.createdAt).toLocaleDateString()}
                            {key.lastUsedAt ? ` · last used ${new Date(key.lastUsedAt).toLocaleDateString()}` : " · never used"}
                          </small>
                        </span>
                        <button
                          type="button"
                          className={`chip cursor-pointer disabled:opacity-50 ${confirmRevokeId === key.id ? "rose" : ""}`}
                          onClick={() => requestRevoke(key.id)}
                          disabled={busy}
                        >
                          {confirmRevokeId === key.id ? "Confirm revoke" : "Revoke"}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
