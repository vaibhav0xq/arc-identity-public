"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArcShell } from "@/components/ArcShell";
import { useArcIdentity } from "@/hooks/useArcIdentity";
import type { Attestation, IdentityRecord, InteractionType } from "@/lib/types";
import { fetchJsonWithTimeout } from "@/lib/timeouts";
import { shortenAddress } from "@/lib/wallet";

const interactionTypes: { value: InteractionType; label: string; description: string }[] = [
  { value: "payment", label: "Payment", description: "Direct transfer" },
  { value: "service_payment", label: "Service payment", description: "Paid work or service" },
  { value: "escrow_release", label: "Escrow release", description: "Escrow completed" },
  { value: "trade_settlement", label: "Trade settlement", description: "Trade or deal completion" }
];

type AttestationRow = {
  id: string;
  from_wallet: string;
  to_wallet: string;
  type: string;
  weight: number | string | null;
  sender_score_at?: number | string | null;
  pair_history_count?: number | string | null;
  tx_hash: string | null;
  tx_block_number: number | string | null;
  tx_timestamp?: string | null;
  tx_value?: number | string | null;
  verified_participants?: string[] | null;
  verified_transaction?: boolean | null;
  chain_id?: string | null;
  created_at: string;
};

type SubmitStatus = "idle" | "verifying" | "creating" | "success" | "duplicate" | "error";

function isInteractionType(value: string): value is InteractionType {
  return interactionTypes.some((item) => item.value === value);
}

function mapAttestationRow(row: AttestationRow): Attestation {
  return {
    id: row.id,
    fromWallet: row.from_wallet,
    toWallet: row.to_wallet,
    type: isInteractionType(row.type) ? row.type : "payment",
    weight: Number(row.weight ?? 0),
    senderScoreAt: Number(row.sender_score_at ?? 0),
    pairHistoryCount: Number(row.pair_history_count ?? 0),
    txHash: row.tx_hash,
    txBlockNumber: row.tx_block_number == null ? null : Number(row.tx_block_number),
    txTimestamp: row.tx_timestamp ?? null,
    txValue: Number(row.tx_value ?? 0),
    verifiedParticipants: Array.isArray(row.verified_participants) ? row.verified_participants : [],
    verifiedTransaction: Boolean(row.verified_transaction ?? row.tx_hash),
    chainId: row.chain_id ?? null,
    createdAt: row.created_at
  };
}

function ExplorerLink({ txHash }: { txHash: string | null }) {
  const explorer = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL;
  if (!txHash || !explorer) return null;
  return <a href={`${explorer.replace(/\/$/, "")}/tx/${txHash}`} className="text-emerald-200 underline decoration-emerald-300/40 underline-offset-4">View transaction</a>;
}

function interactionLabel(type: InteractionType) {
  return interactionTypes.find((item) => item.value === type)?.label ?? type.replaceAll("_", " ");
}

function formatTimestamp(value: string | null) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Timestamp unavailable";
  return date.toLocaleString();
}

function formatIdentity(username: string | null | undefined, wallet: string) {
  return {
    primary: username ?? shortenAddress(wallet),
    secondary: username ? shortenAddress(wallet) : "Public username not claimed"
  };
}

function riskClass(risk: string) {
  if (risk === "Trusted") return "border-emerald-300/25 bg-emerald-300/10 text-emerald-100";
  if (risk === "Reliable") return "border-cyan-300/25 bg-cyan-300/10 text-cyan-100";
  if (risk === "New / Unproven") return "border-amber-300/25 bg-amber-300/10 text-amber-100";
  return "border-rose-300/25 bg-rose-400/10 text-rose-100";
}

function friendlyError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message) return fallback;
  if (/signal|abort|aborted|fetch failed|failed to fetch|internal server|json|network/i.test(message)) return fallback;
  return message;
}

function normalizeIdentitySearch(value: string) {
  const normalized = value.trim().toLowerCase();
  return {
    full: normalized.endsWith(".arcid") ? normalized : `${normalized}.arcid`,
    base: normalized.replace(/\.arcid$/i, ""),
    raw: normalized
  };
}

function looksLikeTxHash(value: string) {
  return /^0x[a-fA-F0-9]{64}$/.test(value.trim());
}

function normalizeWallet(value: string) {
  return value.trim().toLowerCase();
}

function attestationResponseToRow(attestation: any): AttestationRow | null {
  if (!attestation?.id) return null;
  return {
    id: attestation.id,
    from_wallet: attestation.fromWallet,
    to_wallet: attestation.toWallet,
    type: attestation.interactionType ?? "payment",
    weight: attestation.weight ?? 0,
    sender_score_at: attestation.senderScoreAt ?? 0,
    pair_history_count: attestation.pairHistoryCount ?? 0,
    tx_hash: attestation.txHash,
    tx_block_number: attestation.blockNumber ?? null,
    tx_timestamp: attestation.transactionTime ?? null,
    tx_value: attestation.amount ?? 0,
    verified_participants: attestation.verifiedParticipants ?? null,
    verified_transaction: attestation.verifiedTransaction ?? true,
    chain_id: attestation.chainId ?? null,
    created_at: attestation.createdAt ?? new Date().toISOString()
  };
}

function InteractionTypePicker({
  value,
  onChange
}: {
  value: InteractionType;
  onChange: (value: InteractionType) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = interactionTypes.find((item) => item.value === value) ?? interactionTypes[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative grid min-w-0 w-full gap-2 transition-all duration-300 ease-out">
      <span className="text-sm font-medium text-slate-300">Interaction type</span>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="arc-input flex min-w-0 w-full items-center justify-between gap-3 px-4 py-3 text-left font-bold text-white outline-none transition-all duration-300 ease-out hover:border-emerald-300/25 hover:bg-white/[0.07]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{selected.label}</span>
        <span className={`text-xs text-emerald-200 transition ${open ? "rotate-180" : ""}`}>v</span>
      </button>
      {open ? (
        <div className="absolute left-0 right-0 top-[4.9rem] z-[90] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-emerald-300/15 bg-[rgba(7,14,20,0.98)] shadow-[0_22px_70px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-all duration-300 ease-out" role="listbox">
          {interactionTypes.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange(item.value);
                  setOpen(false);
                }}
                className={`block w-full px-4 py-3 text-left transition ${active ? "bg-emerald-300/12 text-emerald-100" : "text-slate-200 hover:bg-white/[0.06]"}`}
              >
                <span className="block text-sm font-bold">{item.label}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      <span className="text-xs leading-5 text-slate-500">Choose the closest economic context for this transaction.</span>
    </div>
  );
}

function CounterpartyPicker({
  users,
  selectedWallet,
  onSelect,
  loading,
  error,
  onRetry
}: {
  users: IdentityRecord[];
  selectedWallet: string;
  onSelect: (wallet: string) => void;
  loading: boolean;
  error: string;
  onRetry: () => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedCounterparty = users.find((item) => item.profile.walletAddress.toLowerCase() === selectedWallet.toLowerCase()) ?? null;
  const trimmedQuery = searchQuery.trim();
  const canSearch = trimmedQuery.length >= 2;
  const allMatches = users.filter((item) => {
    const value = normalizeIdentitySearch(trimmedQuery);
    if (!canSearch) return false;
    const wallet = item.profile.walletAddress.toLowerCase();
    const usernameFull = (item.profile.username ?? "").trim().toLowerCase();
    const usernameBase = usernameFull.replace(/\.arcid$/i, "");
    return [
      usernameFull,
      usernameBase,
      wallet,
      shortenAddress(item.profile.walletAddress).toLowerCase()
    ].some((entry) => entry.includes(value.raw) || entry.includes(value.base) || entry.includes(value.full));
  });
  const filtered = allMatches.slice(0, 8);
  const hasMoreResults = allMatches.length > filtered.length;

  function choose(item: IdentityRecord) {
    onSelect(item.profile.walletAddress);
    setSearchQuery("");
    setOpen(false);
    setActiveIndex(0);
  }

  function clearSelection() {
    onSelect("");
    setSearchQuery("");
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && open && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    }
  }

  return (
    <div className="relative grid min-w-0 w-full gap-2 transition-all duration-300 ease-out">
      <span className="text-sm font-medium text-slate-300">Registered counterparty</span>
      {!selectedCounterparty ? (
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => {
            setSearchQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="arc-input min-w-0 w-full px-4 py-3 text-white outline-none placeholder:text-slate-500 transition-all duration-300 ease-out"
          placeholder={loading ? "Loading registered identities..." : "Search username, username.arcid, or wallet address"}
          aria-label="Search registered counterparty"
        />
      ) : null}
      {!selectedCounterparty && open ? (
        <div className="absolute left-0 right-0 top-[4.9rem] z-[90] max-h-72 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-white/[0.08] bg-[rgba(8,16,22,0.98)] shadow-panel backdrop-blur-xl transition-all duration-300 ease-out">
          {loading ? (
            <p className="p-4 text-sm text-slate-400">Loading registered counterparties...</p>
          ) : !canSearch ? (
            <p className="p-4 text-sm text-slate-400">Type at least 2 characters to search registered identities.</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-slate-400">No registered ARC Identity found.</p>
          ) : (
            <>
              {filtered.map((item, index) => {
                const active = index === activeIndex;
                return (
                  <button key={item.profile.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)} className={active ? "block w-full bg-white/[0.08] p-4 text-left transition-all duration-300 ease-out" : "block w-full p-4 text-left transition-all duration-300 ease-out hover:bg-white/[0.06]"}>
                    <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-white">{item.profile.username}</p>
                        <p className="mt-1 truncate text-xs text-slate-500">{shortenAddress(item.profile.walletAddress)}</p>
                      </div>
                      <span className={`rounded border px-2 py-1 text-xs font-black ${riskClass(item.score.riskLevel)}`}>{item.score.arcScore} - {item.score.riskLevel}</span>
                    </div>
                  </button>
                );
              })}
              {hasMoreResults ? <p className="border-t border-white/10 p-3 text-xs text-slate-500">Showing top 8 results. Keep typing to narrow down.</p> : null}
            </>
          )}
        </div>
      ) : null}
      {error ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-50/85">
          <span>Couldn&apos;t load registered identities. Retry.</span>
          <button type="button" onClick={onRetry} className="rounded border border-amber-200/20 px-2 py-1 font-bold text-amber-50 transition hover:bg-amber-200/10">Retry</button>
        </div>
      ) : null}
      {selectedCounterparty ? (
        <div className="min-w-0 rounded-xl border border-emerald-300/25 bg-emerald-300/[0.09] p-4 shadow-[0_18px_50px_rgba(16,185,129,0.08)] transition-all duration-300 ease-out">
          <p className="mb-3 text-[0.6875rem] font-black uppercase tracking-[0.18em] text-emerald-100">Selected identity</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">{selectedCounterparty.profile.username}</p>
              <p className="mt-1 truncate text-xs text-emerald-100/70">{shortenAddress(selectedCounterparty.profile.walletAddress)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs font-black ${riskClass(selectedCounterparty.score.riskLevel)}`}>{selectedCounterparty.score.arcScore} - {selectedCounterparty.score.riskLevel}</span>
              <button type="button" onClick={clearSelection} className="rounded border border-white/10 px-2 py-1 text-xs font-bold text-white transition hover:bg-white/10" aria-label="Change selected counterparty">Change</button>
            </div>
          </div>
        </div>
      ) : null}
      <span className="text-xs leading-5 text-slate-500">{selectedCounterparty ? "ARC Identity will verify this identity against the submitted transaction." : "Search by username, username.arcid, or wallet address. Your own identity is excluded."}</span>
    </div>
  );
}

export default function AttestationsPage() {
  const loadSeqRef = useRef(0);
  const registeredWalletRef = useRef("");
  const { identity, refreshIdentity } = useArcIdentity();
  const [wallet, setWallet] = useState("");
  const [users, setUsers] = useState<IdentityRecord[]>([]);
  const [toWallet, setToWallet] = useState("");
  const [txHash, setTxHash] = useState("");
  const [interactionType, setInteractionType] = useState<InteractionType>("payment");
  const [history, setHistory] = useState<Attestation[]>([]);
  const [message, setMessage] = useState("Loading transaction attestations...");
  const [submitting, setSubmitting] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState("");
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [highlightedTxHash, setHighlightedTxHash] = useState("");
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [identityStatus, setIdentityStatus] = useState<"checking" | "registered" | "unregistered" | "disconnected" | "failed">("checking");

  async function loadHistory(current: string, options: { force?: boolean; highlightTxHash?: string } = {}) {
    console.log("[arc-identity] attestation_history_refresh_started", { wallet: current, force: Boolean(options.force), highlightTxHash: options.highlightTxHash ?? null });
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const historyData = await fetchJsonWithTimeout<{ attestations: AttestationRow[]; error?: string }>(`/api/interactions/history/${current}?t=${Date.now()}`, { cache: "no-store" }, 5000);
      const mapped = (historyData.attestations ?? []).map(mapAttestationRow);
      console.log("[arc-identity] attestation_history_refresh_success", { wallet: current, count: mapped.length });
      console.log("[arc-identity] attestation_history_record_count", { wallet: current, count: mapped.length, newestTxHash: mapped[0]?.txHash ?? null });
      setHistory(mapped);
      setHistoryLoaded(true);
      if (options.highlightTxHash) setHighlightedTxHash(options.highlightTxHash.toLowerCase());
      setHistoryError("");
      return mapped;
    } finally {
      setHistoryLoading(false);
    }
  }

  async function load() {
    const requestId = loadSeqRef.current + 1;
    loadSeqRef.current = requestId;
    const current = identity.normalizedWallet ?? "";
    const previousState = identityStatus;
    console.log("[arc-identity] attestations_wallet_state", { wallet: current || null, requestId, previousState, sharedIdentityStatus: identity.status, source: identity.source });
    setWallet(current);
    if (identity.status === "checking") {
      setIdentityStatus("checking");
      setMessage("Checking ARC Identity...");
      setUsersLoading(false);
      console.log("[arc-identity] attestations_final_decision", { requestId, state: "checking" });
      return;
    }
    if (!current || identity.status === "disconnected") {
      setIdentityStatus("disconnected");
      setMessage("Connect an EVM wallet before verifying transaction-backed attestations.");
      setUsersLoading(false);
      setHistoryLoaded(false);
      registeredWalletRef.current = "";
      console.log("[arc-identity] attestations_final_decision", { requestId, state: "disconnected" });
      return;
    }
    if (identity.status === "unclaimed") {
      setIdentityStatus("unregistered");
      setMessage("Claim your ARC Identity before creating attestations.");
      setUsersLoading(false);
      setHistoryLoaded(false);
      registeredWalletRef.current = "";
      console.log("[arc-identity] attestations_final_decision", { requestId, state: "unregistered" });
      return;
    }
    if (identity.status === "error") {
      if (registeredWalletRef.current === current) {
        setIdentityStatus("registered");
        setMessage("Could not refresh the identity check. Keeping the verified workflow open.");
        console.log("[arc-identity] attestations_final_decision", { requestId, state: "registered", reason: "previous_success_preserved" });
      } else {
        setIdentityStatus("failed");
        setMessage("Could not verify your ARC Identity. Retry the identity check.");
        console.log("[arc-identity] attestations_final_decision", { requestId, state: "failed" });
      }
      setUsersLoading(false);
      return;
    }
    if (identity.status !== "claimed") return;

    console.log("[arc-identity] attestations_profile_lookup_success", { wallet: current, username: identity.username, requestId, source: identity.source });
    console.log("[arc-identity] attestations_gate_previous_state", { requestId, previousState, registeredWallet: registeredWalletRef.current || null });
    setIdentityStatus("registered");
    registeredWalletRef.current = current;
    setToWallet("");
    setMessage("");
    setHistoryLoaded(false);
    console.log("[arc-identity] attestations_gate_next_state", { requestId, state: "registered", username: identity.username });
    console.log("[arc-identity] attestations_final_decision", { requestId, state: "registered" });

    setUsersLoading(true);
    setUsersError("");
    setHistoryError("");
    console.log("[arc-identity] attestations_users_fetch_started", { wallet: current });
    const [usersResult, historyResult] = await Promise.allSettled([
      fetchJsonWithTimeout<{ users: IdentityRecord[] }>("/api/users?limit=250", {}, 7000),
      loadHistory(current)
    ]);
    if (loadSeqRef.current !== requestId) {
      console.log("[arc-identity] attestations_ignored_stale_response", { wallet: current, requestId, stage: "secondary_data" });
      return;
    }
    if (usersResult.status === "fulfilled") {
      const counterparties = usersResult.value.users.filter((item) => item.profile.walletAddress.toLowerCase() !== current.toLowerCase());
      setUsers(counterparties);
      setUsersError("");
      console.log("[arc-identity] attestations_users_fetch_success", { wallet: current, count: usersResult.value.users.length, counterparties: counterparties.length });
      console.log("[arc-identity] attestations_users_count", { count: usersResult.value.users.length, counterparties: counterparties.length });
    } else {
      console.warn("[arc-identity] attestations_users_fetch_failed", { wallet: current, requestId, error: usersResult.reason instanceof Error ? usersResult.reason.message : "Unknown error" });
      setUsersError("Couldn't load registered identities. Retry.");
    }
    if (historyResult.status === "rejected") {
      console.warn("[arc-identity] attestations_history_fetch_failed", { wallet: current, requestId, error: historyResult.reason instanceof Error ? historyResult.reason.message : "Unknown error" });
      setHistoryLoading(false);
      setHistoryLoaded(true);
      setHistoryError("Couldn't load attestation history. Retry.");
    }
    if (usersResult.status === "fulfilled" && historyResult.status === "fulfilled") setMessage("");
    setUsersLoading(false);
  }

  async function sendRequest() {
    if (submitting) return;
    const validationMessage = attestationFormError();
    if (!wallet || validationMessage) {
      setSubmitSuccess("");
      setSubmitError(validationMessage || "Connect a verified ARC Identity wallet before submitting an attestation.");
      return;
    }
    setSubmitting(true);
    setSubmitStatus("verifying");
    setSubmitError("");
    setSubmitSuccess("Verifying transaction on Arc RPC...");
    const submittedTxHash = txHash.trim().toLowerCase();
    let finalStatus: SubmitStatus = "verifying";
    console.log("[arc-identity] attestation_submit_started", { wallet, toWallet, txHash: submittedTxHash, interactionType });
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);
    try {
      window.setTimeout(() => {
        if (!controller.signal.aborted) {
          setSubmitStatus((current) => current === "verifying" ? "creating" : current);
          setSubmitSuccess((current) => current === "Verifying transaction on Arc RPC..." ? "Creating verified attestation..." : current);
        }
      }, 1800);
      const response = await fetch("/api/attestations/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromWallet: wallet, toWallet, txHash: submittedTxHash, interactionType }),
        signal: controller.signal
      });
      const data = await response.json();
      if (data.status === "duplicate") {
        finalStatus = "duplicate";
        setSubmitStatus("duplicate");
        setSubmitSuccess("This transaction has already been submitted for this relationship.");
        setHighlightedTxHash(submittedTxHash);
        console.log("[arc-identity] attestation_duplicate_detected", { wallet, toWallet, txHash: submittedTxHash });
        const row = attestationResponseToRow(data.attestation);
        if (row) {
          const mapped = mapAttestationRow(row);
          setHistory((current) => [mapped, ...current.filter((item) => item.txHash?.toLowerCase() !== submittedTxHash)]);
        }
        await loadHistory(wallet, { force: true, highlightTxHash: submittedTxHash }).catch((historyError) => {
          console.warn("[arc-identity] attestations_history_fetch_failed", { wallet, txHash: submittedTxHash, error: historyError instanceof Error ? historyError.message : "Unknown error" });
          setHistoryError("Couldn't load attestation history. Retry.");
        });
        return;
      }
      if (!response.ok || data.ok === false) throw new Error(data.message ?? data.error ?? "Unable to verify transaction attestation");
      finalStatus = "success";
      setSubmitStatus("success");
      console.log("[arc-identity] attestation_submit_success", { wallet, toWallet, txHash: submittedTxHash });
      setSubmitSuccess("Attestation verified and added to your reputation history.");
      setTxHash("");
      setHighlightedTxHash(submittedTxHash);
      const row = attestationResponseToRow(data.attestation);
      if (row) {
        const mapped = mapAttestationRow(row);
        setHistory((current) => [mapped, ...current.filter((item) => item.txHash?.toLowerCase() !== submittedTxHash)]);
      }
      console.log("[arc-identity] history_refetch_after_submit", { wallet, txHash: submittedTxHash });
      await loadHistory(wallet, { force: true, highlightTxHash: submittedTxHash }).catch((historyError) => {
        console.warn("[arc-identity] attestations_history_fetch_failed", { wallet, txHash: submittedTxHash, error: historyError instanceof Error ? historyError.message : "Unknown error" });
        setHistoryError("Couldn't load attestation history. Retry.");
      });
    } catch (error) {
      setSubmitSuccess("");
      finalStatus = "error";
      setSubmitStatus("error");
      const timeout = error instanceof DOMException && error.name === "AbortError";
      const message = timeout ? "Verification is taking longer than expected. Check history or retry." : friendlyError(error, "Verification temporarily unavailable. Retry.");
      setSubmitError(message.includes("indexed activity") ? `${message} Eligibility uses multichain indexed history. The submitted transaction is still verified on Arc.` : message);
      if (timeout) {
        await loadHistory(wallet, { force: true, highlightTxHash: submittedTxHash }).catch(() => undefined);
      }
    } finally {
      window.clearTimeout(timeoutId);
      setSubmitting(false);
      console.log("[arc-identity] attestation_submit_final_state", { wallet, toWallet, txHash: submittedTxHash, status: finalStatus });
    }
  }

  async function retryHistoryLoad() {
    if (!wallet) return;
    try {
      await loadHistory(wallet, { force: true });
    } catch (error) {
      setHistoryLoaded(true);
      setHistoryError("Couldn't load attestation history. Retry.");
      console.warn("[arc-identity] attestations_history_fetch_failed", { wallet, error: error instanceof Error ? error.message : "Unknown error", source: "manual_retry" });
    }
  }

  useEffect(() => {
    void load();
  }, [identity.normalizedWallet, identity.source, identity.status, identity.username]);

  const selectedCounterparty = users.find((item) => item.profile.walletAddress.toLowerCase() === toWallet.toLowerCase()) ?? null;

  function attestationFormError() {
    if (submitting) return "";
    if (!selectedCounterparty) return "Select a registered ARC Identity counterparty.";
    if (wallet && normalizeWallet(wallet) === normalizeWallet(selectedCounterparty.profile.walletAddress)) return "You cannot submit an attestation with your own wallet as the counterparty.";
    if (!isInteractionType(interactionType)) return "Choose a supported interaction type.";
    if (!txHash.trim()) return "Paste the Arc transaction hash involving both wallets.";
    if (!looksLikeTxHash(txHash)) return "Enter a valid 0x transaction hash.";
    return "";
  }

  const formDisabledReason = attestationFormError();
  const formReady = Boolean(selectedCounterparty && isInteractionType(interactionType) && looksLikeTxHash(txHash) && normalizeWallet(wallet) !== normalizeWallet(selectedCounterparty.profile.walletAddress));
  const verifyButtonLabel = submitting ? (submitStatus === "creating" ? "Creating attestation..." : "Verifying transaction...") : submitSuccess ? "Attestation verified" : formReady ? "Verify transaction attestation" : "Complete all fields";

  return (
    <ArcShell>
      <section className="fade-in mx-auto grid w-full max-w-[1680px] gap-6 px-4 py-8 transition-all duration-300 ease-out sm:px-6 md:gap-8 lg:px-10 xl:px-14">
        <div className="max-w-4xl transition-all duration-300 ease-out">
          <div className="flex flex-wrap items-center gap-4">
            <p className="arc-section-label">Verified Attestations</p>
            <span className="rounded-md border border-amber-300/25 bg-amber-300/10 px-3 py-1 text-[0.6875rem] font-bold uppercase tracking-[0.16em] text-amber-100">Early Access</span>
          </div>
          <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-white lg:text-5xl">Transaction-verified reputation</h1>
          <p className="mt-4 text-[1.0625rem] leading-relaxed text-slate-300">Create transaction-backed trust evidence from real Arc Testnet activity between registered ARC identities.</p>
        </div>

        <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.08] p-5 shadow-panel transition-all duration-300 ease-out sm:p-7">
          <div className="max-w-4xl">
            <p className="text-[0.6875rem] font-bold uppercase tracking-[0.18em] text-cyan-100">Launch status</p>
            <p className="mt-2.5 text-[0.875rem] leading-relaxed text-cyan-50/80">Verified Attestations currently supports transaction-backed reputation on Arc Testnet. Additional safeguards and verification workflows are actively evolving.</p>
          </div>
        </div>

        {identityStatus !== "registered" ? (
          <div className="grid grid-cols-1 gap-6 transition-all duration-300 ease-out md:gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <div className="arc-surface min-w-0 rounded-2xl p-6 transition-all duration-300 ease-out sm:p-8">
              <p className="arc-section-label">{identityStatus === "checking" ? "Checking identity" : identityStatus === "failed" ? "Retry available" : "Identity required"}</p>
              <h2 className="mt-3 text-2xl font-extrabold text-white">
                {identityStatus === "checking"
                  ? "Checking ARC Identity..."
                  : identityStatus === "failed"
                    ? "Could not verify your ARC Identity."
                    : identityStatus === "disconnected"
                      ? "Connect your wallet to continue."
                      : "Claim your ARC Identity before creating attestations."}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
                {identityStatus === "checking"
                  ? "Looking up the connected wallet directly against the ARC Identity registry."
                  : identityStatus === "failed"
                    ? "The registry lookup did not complete. Retry the check without leaving this page."
                    : "Wallet connection verifies ownership. Verified attestations unlock after a completed username claim."}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                {identityStatus === "unregistered" || identityStatus === "disconnected" ? <a href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">Claim ARC Identity</a> : null}
                {identityStatus !== "checking" ? <button type="button" onClick={() => void refreshIdentity(identity.normalizedWallet)} className="arc-button-secondary px-5 py-3 text-sm font-bold">Retry check</button> : null}
              </div>
            </div>
            <div className="grid min-w-0 gap-6 md:gap-8">
              <div className="arc-card-hover rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 transition-all duration-300 ease-out sm:p-7">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">How it works</p>
                <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-400">
                  <p><span className="font-bold text-white">1.</span> Connect and verify your wallet.</p>
                  <p><span className="font-bold text-white">2.</span> Claim your ARC Identity username.</p>
                  <p><span className="font-bold text-white">3.</span> Return here to verify real Arc transactions.</p>
                </div>
              </div>
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-6 transition-all duration-300 ease-out sm:p-7">
                <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-100">Anti-sybil guidance</p>
                <p className="mt-3 text-sm leading-6 text-amber-50/80">Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity, or abusive verification behavior may reduce trust confidence and trigger anomaly detection.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-1 gap-6 transition-all duration-300 ease-out md:gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
          <div className="arc-surface min-w-0 rounded-2xl p-5 transition-all duration-300 ease-out sm:p-7">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Verification workflow</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">Choose who you interacted with, select the interaction context, then paste the Arc transaction hash. ARC Identity verifies the transaction before adding it to reputation history.</p>
            </div>
            <div className="mt-5 grid gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ["1", "Select a registered ARC Identity"],
                ["2", "Choose interaction type"],
                ["3", "Paste Arc transaction hash"],
                ["4", "Verify transaction-backed attestation"]
              ].map(([step, label]) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-emerald-300/25 bg-emerald-300/10 text-xs font-black text-emerald-100">{step}</span>
                  <p className="text-sm font-bold leading-5 text-slate-200">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">
              <CounterpartyPicker users={users} selectedWallet={toWallet} onSelect={setToWallet} loading={usersLoading} error={usersError} onRetry={() => void load()} />
              <InteractionTypePicker value={interactionType} onChange={setInteractionType} />
              <label className="grid min-w-0 gap-2 md:col-span-2">
                <span className="text-sm font-medium text-slate-300">Arc transaction hash</span>
                <input value={txHash} onChange={(event) => setTxHash(event.target.value.trim())} className="arc-input min-w-0 w-full px-4 py-3 text-white outline-none transition-all duration-300 ease-out" placeholder="0x..." />
                <span className="text-xs leading-5 text-slate-500">{toWallet ? "Use the transaction hash from the Arc transfer involving both wallets." : "Select a counterparty first so ARC Identity knows which wallets to verify."}</span>
              </label>
              {!formReady && formDisabledReason ? <p className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs leading-5 text-slate-400 md:col-span-2">{formDisabledReason}</p> : null}
              <button onClick={sendRequest} disabled={!formReady || submitting} className="arc-button-primary w-full px-5 py-3 font-black disabled:cursor-not-allowed disabled:opacity-50 md:col-span-2">{verifyButtonLabel}</button>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 md:gap-8">
            <div className="arc-card-hover rounded-2xl border border-white/[0.06] bg-white/[0.03] p-6 transition-all duration-300 ease-out sm:p-7">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-300">How it works</p>
              <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-400">
                <p><span className="font-bold text-white">1.</span> Select a registered counterparty.</p>
                <p><span className="font-bold text-white">2.</span> Choose the interaction type.</p>
                <p><span className="font-bold text-white">3.</span> Paste the Arc transaction hash involving both wallets.</p>
                <p><span className="font-bold text-white">4.</span> ARC Identity verifies the transaction before trust is created.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.08] p-6 transition-all duration-300 ease-out sm:p-7">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-amber-100">Anti-sybil guidance</p>
              <p className="mt-3 text-sm leading-6 text-amber-50/80">Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity, or abusive verification behavior may reduce trust confidence and trigger anomaly detection.</p>
            </div>
          </div>
        </div>
        {message ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-white/10 bg-white/[0.04] p-4 text-slate-300">
            <span>{message}</span>
            {wallet ? <button type="button" onClick={() => void load()} className="rounded border border-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/10">Retry</button> : null}
          </div>
        ) : null}
        {submitSuccess ? <div className="rounded border border-emerald-300/20 bg-emerald-300/10 p-4 text-emerald-100">{submitSuccess}</div> : null}
        {submitError ? <div className="rounded border border-rose-300/20 bg-rose-400/10 p-4 text-rose-100">{submitError}</div> : null}
        <section className="arc-surface rounded-2xl p-5 transition-all duration-300 ease-out sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Verified reputation history</p>
              <p className="mt-2 text-sm text-slate-400">Accepted transaction-backed attestations connected to this wallet.</p>
            </div>
            <span className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-300">{history.length} records</span>
          </div>
          {historyLoading || !historyLoaded ? (
            <p className="mt-3 text-slate-400">Loading verified attestations...</p>
          ) : historyError ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300/20 bg-amber-300/10 p-4 text-amber-50/85">
              <span>{historyError}</span>
              <button type="button" onClick={() => void retryHistoryLoad()} className="rounded border border-amber-200/20 px-3 py-2 text-xs font-bold text-amber-50 transition hover:bg-amber-200/10">Retry</button>
            </div>
          ) : history.length === 0 ? <p className="mt-3 max-w-2xl text-slate-400">No verified attestations yet. Complete your first transaction-backed attestation to start building portable trust.</p> : (
            <div className="mt-4 grid gap-3">
              {(showAllHistory ? history : history.slice(0, 3)).map((item) => {
                const from = formatIdentity(item.fromUsername, item.fromWallet);
                const to = formatIdentity(item.toUsername, item.toWallet);
                const expanded = Boolean(expandedHistory[item.id]);
                const highlighted = Boolean(item.txHash && item.txHash.toLowerCase() === highlightedTxHash);
                return (
                  <div key={item.id} className={`rounded border p-3 transition ${highlighted ? "border-emerald-300/40 bg-emerald-300/[0.08] shadow-[0_0_30px_rgba(16,185,129,0.08)]" : "border-white/10 bg-white/[0.045]"}`}>
                    <div className="grid gap-3 lg:grid-cols-[0.8fr_1.3fr_0.45fr_0.45fr_0.75fr_0.75fr] lg:items-center">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded border border-cyan-300/20 bg-cyan-300/10 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-cyan-100">{interactionLabel(item.type)}</span>
                        <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-2 py-1 text-xs font-black uppercase tracking-[0.12em] text-emerald-100">Verified</span>
                      </div>
                      <div className="min-w-0">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{from.primary}</p>
                            {item.fromUsername ? <p className="truncate text-xs text-slate-500">{from.secondary}</p> : null}
                          </div>
                          <span className="hidden text-xs font-bold uppercase tracking-[0.16em] text-slate-500 sm:block">to</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-white">{to.primary}</p>
                            {item.toUsername ? <p className="truncate text-xs text-slate-500">{to.secondary}</p> : null}
                          </div>
                        </div>
                      </div>
                      <p><span className="block text-xs text-slate-500 lg:hidden">Trust weight</span><span className="font-bold text-white">{item.weight}</span></p>
                      <p><span className="block text-xs text-slate-500 lg:hidden">Value</span><span className="font-bold text-white">{item.txValue}</span></p>
                      <p><span className="block text-xs text-slate-500 lg:hidden">Verified date</span><span className="font-bold text-slate-200">{formatTimestamp(item.txTimestamp ?? item.createdAt)}</span></p>
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        <button type="button" onClick={() => setExpandedHistory((current) => ({ ...current, [item.id]: !expanded }))} className="font-bold text-white underline decoration-white/20 underline-offset-4 transition hover:text-emerald-200">
                          {expanded ? "Hide details" : "View details"}
                        </button>
                        <ExplorerLink txHash={item.txHash} />
                      </div>
                    </div>
                    {expanded ? (
                      <div className="mt-3 grid gap-3 border-t border-white/10 pt-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                        <p className="min-w-0"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">From wallet</span><span className="break-all font-bold text-slate-200">{item.fromWallet}</span></p>
                        <p className="min-w-0"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">To wallet</span><span className="break-all font-bold text-slate-200">{item.toWallet}</span></p>
                        <p className="min-w-0"><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Tx hash</span><span className="break-all font-bold text-slate-200">{item.txHash ?? "Unavailable"}</span></p>
                        <p><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Block number</span><span className="font-bold text-slate-200">{item.txBlockNumber ?? "Unavailable"}</span></p>
                        <p><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Timestamp</span><span className="font-bold text-slate-200">{formatTimestamp(item.txTimestamp ?? item.createdAt)}</span></p>
                        <p><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">Verification status</span><span className="font-bold text-emerald-100">{item.verifiedTransaction ? "Verified transaction" : "Unverified"}</span></p>
                        <p><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">From username</span><span className="font-bold text-slate-200">{item.fromUsername ?? "No public username"}</span></p>
                        <p><span className="block text-xs uppercase tracking-[0.14em] text-slate-500">To username</span><span className="font-bold text-slate-200">{item.toUsername ?? "No public username"}</span></p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {history.length > 3 ? (
                <button type="button" onClick={() => setShowAllHistory((current) => !current)} className="rounded border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white transition hover:bg-white/[0.07]">
                  {showAllHistory ? "Show less" : "Show all attestations"}
                </button>
              ) : null}
            </div>
          )}
        </section>
          </>
        )}
        <section className="arc-surface rounded-2xl p-5 transition-all duration-300 ease-out sm:p-7">
          <p className="text-sm uppercase tracking-[0.22em] text-emerald-200">Upcoming verification layers</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {["Reciprocal attestations", "Trust confidence expansion", "Merchant reputation", "Advanced anomaly detection", "Multi-party verification"].map((item) => (
              <div key={item} className="rounded border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-bold text-slate-300 transition-all duration-300 ease-out">{item}</div>
            ))}
          </div>
        </section>
      </section>
    </ArcShell>
  );
}
