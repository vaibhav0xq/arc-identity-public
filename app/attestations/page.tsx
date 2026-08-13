"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArcShell } from "@/components/ArcShell";
import { ConnectGatePanel } from "@/components/ConnectGatePanel";
import { WalletConnectButton } from "@/components/WalletConnectButton";
import { TxLink } from "@/components/TxLink";
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
    full: normalized.endsWith(".arcid") || normalized.endsWith(".kyro") ? normalized : `${normalized}.kyro`,
    base: normalized.replace(/\.(arcid|kyro)$/i, ""),
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
  value: InteractionType | "";
  onChange: (value: InteractionType) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

    return (
      <div ref={rootRef} className="grid min-w-0 w-full gap-3">
        <span className="kicker">02 / Interaction context</span>
        <div className="context-picks grid gap-2 sm:grid-cols-2" role="listbox" aria-label="Interaction context">
          {interactionTypes.map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onChange(item.value)}
                className={`rounded-[2px] border px-3 py-3 text-left transition ${active ? "border-verified bg-verified-bg text-verified" : "border-linec bg-bone text-ink hover:border-gold"}`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className="mt-1 block text-xs text-mutedc">{item.description}</span>
              </button>
            );
          })}
        </div>
        <span className="text-xs leading-5 text-mutedc">Choose the closest economic context for this transaction.</span>
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
    const usernameBase = usernameFull.replace(/\.(arcid|kyro)$/i, "");
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
    // Keep the previous identity in the search box (pre-selected) so the
    // user can refine it instead of retyping from scratch.
    const previousQuery = selectedCounterparty?.profile.username ?? "";
    onSelect("");
    setSearchQuery(previousQuery);
    setOpen(true);
    window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
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
    <div className="relative grid min-w-0 w-full gap-2">
      <span className="arc-section-label">01 / Registered counterparty</span>
      {!selectedCounterparty ? (
        <div className="relative min-w-0 w-full">
          <input
            ref={inputRef}
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onKeyDown={handleKeyDown}
            className="arc-input min-w-0 w-full border-linec px-4 py-3 font-mono text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20"
            placeholder={loading ? "Loading registered identities..." : "Search username, username.kyro or wallet address"}
            aria-label="Search registered counterparty"
          />
          {/* Dropdown only appears once there is something to search — the caption
              below the field already explains what to type. */}
          {open && canSearch ? (
            <div className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-72 overflow-y-auto rounded-[2px] border border-linec bg-bone shadow-panel">
              {loading ? (
                <div className="p-4">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="py-2">
                      <span className="skeleton h-4 w-40 max-w-full" />
                      <span className="skeleton mt-2 h-3 w-28 max-w-full" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <p className="p-4 text-sm text-mutedc">No registered identity found.</p>
              ) : (
                <>
                  {filtered.map((item, index) => {
                    const active = index === activeIndex;
                    return (
                      <button key={item.profile.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)} className={active ? "block w-full bg-paper p-4 text-left" : "block w-full p-4 text-left hover:bg-paper"}>
                        <div className="grid grid-cols-[1fr_auto] items-center gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{item.profile.username}</p>
                            <p className="mt-1 truncate font-mono text-xs text-mutedc">{shortenAddress(item.profile.walletAddress)}</p>
                          </div>
                          <span className={`rounded border px-2 py-1 text-xs font-black ${riskClass(item.score.riskLevel)}`}>{item.score.arcScore} - {item.score.riskLevel}</span>
                        </div>
                      </button>
                    );
                  })}
                  {hasMoreResults ? <p className="border-t border-linec p-3 text-xs text-mutedc">Showing top 8 results. Keep typing to narrow down.</p> : null}
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
         <div className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-limited bg-limited-bg px-3 py-2 text-xs text-limited">
          <span>Couldn&apos;t load registered identities. Retry.</span>
           <button type="button" onClick={onRetry} className="arc-button-secondary px-2 py-1 text-xs">Retry</button>
        </div>
      ) : null}
      {selectedCounterparty ? (
         <div className="min-w-0 rounded-[2px] border border-verified bg-verified-bg p-4">
           <p className="arc-section-label mb-3 text-verified">Selected identity</p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
               <p className="truncate text-sm font-semibold text-ink">{selectedCounterparty.profile.username}</p>
               <p className="mt-1 truncate font-mono text-xs text-verified">{shortenAddress(selectedCounterparty.profile.walletAddress)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded border px-2 py-1 text-xs font-black ${riskClass(selectedCounterparty.score.riskLevel)}`}>{selectedCounterparty.score.arcScore} - {selectedCounterparty.score.riskLevel}</span>
               <button type="button" onClick={clearSelection} className="arc-button-secondary px-2 py-1 text-xs" aria-label="Change selected counterparty">Change</button>
            </div>
          </div>
        </div>
      ) : null}
       <span className="text-xs leading-5 text-mutedc">{selectedCounterparty ? "Kyro will verify this identity against the submitted transaction." : "Search by username, username.kyro or wallet address. Your own identity is excluded."}</span>
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
  const [interactionType, setInteractionType] = useState<InteractionType | "">("");
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
      setMessage("Checking identity...");
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
      setMessage("Claim your identity before creating attestations.");
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
        setMessage("Could not verify your identity. Retry the identity check.");
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
      setSubmitError(validationMessage || "Connect a verified Kyro wallet before submitting an attestation.");
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
    if (!selectedCounterparty) return "Select a registered counterparty.";
    if (wallet && normalizeWallet(wallet) === normalizeWallet(selectedCounterparty.profile.walletAddress)) return "You cannot submit an attestation with your own wallet as the counterparty.";
    if (!isInteractionType(interactionType)) return "Choose a supported interaction type.";
    if (!txHash.trim()) return "Paste the Arc transaction hash involving both wallets.";
    if (!looksLikeTxHash(txHash)) return "Enter a valid 0x transaction hash.";
    return "";
  }

  const formDisabledReason = attestationFormError();
  const formReady = Boolean(selectedCounterparty && isInteractionType(interactionType) && looksLikeTxHash(txHash) && normalizeWallet(wallet) !== normalizeWallet(selectedCounterparty.profile.walletAddress));
  const verifyButtonLabel = submitting ? (submitStatus === "creating" ? "Creating attestation..." : "Verifying transaction...") : submitSuccess ? "Attestation verified" : formReady ? "Verify transaction attestation" : "Complete all fields";
  const stepStates = [
    { number: "01", title: "Counterparty", detail: selectedCounterparty ? `${selectedCounterparty.profile.username ?? shortenAddress(selectedCounterparty.profile.walletAddress)} selected` : "Select an identity", done: Boolean(selectedCounterparty) },
    { number: "02", title: "Context", detail: interactionType ? interactionLabel(interactionType) : "Choose context", done: isInteractionType(interactionType) },
    { number: "03", title: "Transaction", detail: txHash ? "Hash entered" : "Submit hash", done: looksLikeTxHash(txHash) },
    { number: "04", title: "Evidence", detail: submitSuccess ? "Record verified" : "Verify record", done: Boolean(submitSuccess) }
  ];

  return (
    <ArcShell>
      <section className="fade-in grid w-full gap-7">
        <header className="max-w-4xl">
          <p className="kicker">Evidence ledger / transaction-backed</p>
          <h1 className="mt-4 text-6xl tracking-tight lg:text-8xl">Verify an attestation</h1>
          <p className="mt-4 text-lg leading-relaxed text-mutedc">Turn a real interaction into a durable trust edge.</p>
        </header>

        {identityStatus !== "registered" ? (
          <div className="grid gap-6 md:gap-8">
            <ConnectGatePanel
              kicker={identityStatus === "checking" ? "Checking identity" : identityStatus === "failed" ? "Connection error" : identityStatus === "disconnected" ? "Wallet required" : "Identity required"}
              title={identityStatus === "checking" ? "Checking identity..." : identityStatus === "failed" ? "Could not verify your identity." : identityStatus === "disconnected" ? "Connect your wallet to continue." : "Claim your identity before creating attestations."}
              description={identityStatus === "checking" ? "Looking up the connected wallet directly against the registry." : identityStatus === "failed" ? "The registry lookup did not complete. Retry the check without leaving this page." : identityStatus === "disconnected" ? "Connect and claim your identity to turn real transactions into verified attestations." : "Claim your identity to create verified attestations."}
              checking={identityStatus === "checking"}
              unlocks={["Create transaction-backed attestations", "Track your verified records", "Grow durable trust edges"]}
              actions={
                <>
                  {identityStatus === "disconnected" ? <WalletConnectButton /> : null}
                  {identityStatus === "unregistered" ? <a href="/create" className="arc-button-primary px-5 py-3 text-sm font-extrabold">Claim username</a> : null}
                  {identityStatus === "failed" ? <button type="button" onClick={() => void refreshIdentity(identity.normalizedWallet)} className="arc-button-secondary px-5 py-3 text-sm font-bold">Retry check</button> : null}
                </>
              }
            />
            <div className="grid gap-6 md:grid-cols-2 md:gap-8">
              <div className="r4-panel p-6 sm:p-7">
                <p className="kicker">How it works</p>
                <div className="mt-4 grid gap-3 text-sm leading-6 text-mutedc">
                  <p><span className="font-bold text-gold">1.</span> Connect and verify your wallet.</p>
                  <p><span className="font-bold text-gold">2.</span> Claim your username.</p>
                  <p><span className="font-bold text-gold">3.</span> Return here to verify real Arc transactions.</p>
                </div>
              </div>
              <div className="r4-panel border-limited bg-limited-bg p-6 sm:p-7">
                <p className="kicker text-limited">Anti-sybil guidance</p>
                <p className="mt-3 text-sm leading-6 text-limited">Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity or abusive verification behavior may reduce trust confidence and trigger anomaly detection.</p>
              </div>
            </div>
          </div>
        ) : (
          <>
         <div className="stepper">
           {stepStates.map((step, index) => {
             const active = !step.done && (index === 0 || stepStates[index - 1].done);
             return (
               <div key={step.number} className={`step ${step.done ? "done" : ""} ${active ? "active" : ""}`}>
                 <b>{step.number} · {step.title}</b>
                 <span className={step.done || active ? "" : "text-quiet"}>{step.detail}</span>
               </div>
             );
           })}
         </div>
        <div className="grid grid-cols-1 gap-6 transition-all duration-300 ease-out md:gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
           <div className="r4-panel min-w-0 p-5 sm:p-7">
            <div>
                <p className="kicker">Steps 01-03 / interaction record</p>
                <h2 className="mt-2 text-3xl">What happened?</h2>
            </div>
            <div className="mt-6 grid min-w-0 gap-5 md:grid-cols-2">
              <CounterpartyPicker users={users} selectedWallet={toWallet} onSelect={setToWallet} loading={usersLoading} error={usersError} onRetry={() => void load()} />
              <InteractionTypePicker value={interactionType} onChange={setInteractionType} />
               <label className="grid min-w-0 gap-2 md:col-span-2">
                  <span className="kicker">03 / Arc transaction hash</span>
                  <input value={txHash} onChange={(event) => setTxHash(event.target.value.trim())} className="arc-input min-w-0 w-full border-linec px-4 py-3 font-mono text-sm outline-none focus:border-gold focus:ring-2 focus:ring-gold/20" placeholder="0x..." />
                 <span className="text-xs leading-5 text-mutedc">{toWallet ? "Use the transaction hash from the Arc transfer involving both wallets." : "Select a counterparty first so Kyro knows which wallets to verify."}</span>
              </label>
               {!formReady && formDisabledReason ? <p className="rounded-[2px] border border-linec bg-paper-deep px-3 py-2 text-xs leading-5 text-mutedc md:col-span-2">{formDisabledReason}</p> : null}
               <button onClick={sendRequest} disabled={!formReady || submitting} className="arc-button-primary w-full px-5 py-3 font-black disabled:cursor-not-allowed disabled:opacity-60 disabled:text-mutedc md:col-span-2">{verifyButtonLabel}</button>
            </div>
          </div>

           <div className="grid min-w-0 gap-6 md:gap-8">
              <div className="r4-panel p-6 sm:p-7">
                <div className="r4-panel-head -mx-6 -mt-6"><span>Verification preview</span><span className="chip amber"><span className="dot" />In progress</span></div>
                <div className="pt-5">
                <p className="kicker">New trust edge</p>
                <h2 className="mt-3 text-2xl">{identity.username ?? shortenAddress(wallet)} ↔ {selectedCounterparty?.profile.username ?? "counterparty"}</h2>
                <p className="mt-3 text-sm leading-7 text-mutedc">Context: <b className="text-ink">{interactionType ? interactionLabel(interactionType) : "Not chosen yet"}</b><br />Status: waiting for transaction evidence<br />Expected weight: recalculated after confirmation</p>
                </div>
              </div>
              <div className="verify-note">
                Only a transaction visible on Arc can become verified evidence. We never infer a relationship from a name alone.
              </div>
              <div className="r4-panel p-6 sm:p-7">
                <p className="kicker">How it works</p>
               <div className="mt-4 grid gap-3 text-sm leading-6 text-mutedc">
                 <p><span className="font-bold text-gold">1.</span> Select a registered counterparty.</p>
                 <p><span className="font-bold text-gold">2.</span> Choose the interaction type.</p>
                 <p><span className="font-bold text-gold">3.</span> Paste the Arc transaction hash involving both wallets.</p>
                 <p><span className="font-bold text-gold">4.</span> Kyro verifies the transaction before trust is created.</p>
              </div>
            </div>
              <div className="r4-panel border-limited bg-limited-bg p-6 sm:p-7">
                <p className="kicker text-limited">Anti-sybil guidance</p>
               <p className="mt-3 text-sm leading-6 text-limited">Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity or abusive verification behavior may reduce trust confidence and trigger anomaly detection.</p>
            </div>
          </div>
        </div>
        {message ? (
           <div className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-linec bg-paper-deep p-4 text-mutedc">
            <span>{message}</span>
             {wallet ? <button type="button" onClick={() => void load()} className="arc-button-secondary px-3 py-2 text-xs font-bold">Retry</button> : null}
          </div>
        ) : null}
         {submitSuccess ? <div className="rounded-[2px] border border-verified bg-verified-bg p-4 text-verified">{submitSuccess}</div> : null}
         {submitError ? <div className="rounded-[2px] border border-limited bg-limited-bg p-4 text-limited">{submitError}</div> : null}
           <section className="r4-panel">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
                <p className="kicker text-verified">Verified reputation history</p>
               <p className="mt-2 text-sm text-mutedc">Accepted transaction-backed attestations connected to this wallet.</p>
            </div>
             <span className="rounded-[2px] border border-linec bg-paper-deep px-3 py-2 font-mono text-xs text-mutedc">{history.length} records</span>
          </div>
          {historyLoading || !historyLoaded ? (
              <div className="mt-8 border-t border-linec pt-5">
                <p className="kicker">Ledger loading</p>
                <div className="mt-4 grid gap-3">
                  {[0, 1, 2].map((row) => (
                    <div key={row} className="rounded-[2px] border border-linec bg-bone p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <span className="skeleton h-4 w-56 max-w-full" />
                          <span className="skeleton mt-2 h-3 w-40 max-w-full" />
                        </div>
                        <span className="skeleton h-6 w-20" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
          ) : historyError ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded border border-amber-300/20 bg-amber-300/10 p-4 text-amber-50/85">
              <span>{historyError}</span>
              <button type="button" onClick={() => void retryHistoryLoad()} className="rounded border border-amber-200/20 px-3 py-2 text-xs font-bold text-amber-50 transition hover:bg-amber-200/10">Retry</button>
            </div>
           ) : history.length === 0 ? <div className="mt-8 border-t border-linec pt-5"><p className="kicker">Ledger is quiet</p><h3 className="mt-2 text-2xl">No verified attestations yet</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-mutedc">Complete your first transaction-backed attestation to start building portable trust.</p></div> : (
            <div className="mt-4 grid gap-3">
              {(showAllHistory ? history : history.slice(0, 3)).map((item) => {
                const from = formatIdentity(item.fromUsername, item.fromWallet);
                const to = formatIdentity(item.toUsername, item.toWallet);
                const expanded = Boolean(expandedHistory[item.id]);
                const highlighted = Boolean(item.txHash && item.txHash.toLowerCase() === highlightedTxHash);
                return (
                    <div key={item.id} className={`ledger-row !block ${highlighted ? "border-verified bg-verified-bg" : ""}`}>
                    <div className="grid gap-3 lg:grid-cols-[0.8fr_1.3fr_0.45fr_0.45fr_0.75fr_auto] lg:items-center">
                      <div className="flex flex-wrap items-center gap-2">
                         <span className="rounded-[2px] border border-gold bg-gold-bg px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-gold">{interactionLabel(item.type)}</span>
                         <span className="rounded-[2px] border border-verified bg-verified-bg px-2 py-1 font-mono text-[0.65rem] uppercase tracking-[0.12em] text-verified">Verified</span>
                      </div>
                      <div className="min-w-0">
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                          <div className="min-w-0">
                             <p className="truncate text-sm font-semibold text-ink">{from.primary}</p>
                             {item.fromUsername ? <p className="truncate font-mono text-xs text-mutedc">{from.secondary}</p> : null}
                          </div>
                           <span className="hidden font-mono text-xs uppercase tracking-[0.16em] text-quiet sm:block">to</span>
                          <div className="min-w-0">
                             <p className="truncate text-sm font-semibold text-ink">{to.primary}</p>
                             {item.toUsername ? <p className="truncate font-mono text-xs text-mutedc">{to.secondary}</p> : null}
                          </div>
                        </div>
                      </div>
                       <p><span className="arc-section-label block lg:hidden">Trust weight</span><span className="font-mono text-sm font-medium text-ink">{item.weight}</span></p>
                       <p><span className="arc-section-label block lg:hidden">Value</span><span className="font-mono text-sm font-medium text-ink">{item.txValue}</span></p>
                       <p><span className="arc-section-label block lg:hidden">Verified date</span><span className="text-sm font-medium text-mutedc">{formatTimestamp(item.txTimestamp ?? item.createdAt)}</span></p>
                      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap lg:justify-end">
                         <button type="button" onClick={() => setExpandedHistory((current) => ({ ...current, [item.id]: !expanded }))} className="inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[2px] border border-linec px-2.5 py-[5px] font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-gold hover:bg-gold/10">
                          {expanded ? "Hide details" : "View details"}
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`}><path d="M1.5 3.5L5 7L8.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" /></svg>
                        </button>
                        <TxLink txHash={item.txHash} />
                      </div>
                    </div>
                    {expanded ? (
                       <div className="mt-3 grid gap-3 border-t border-linec pt-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                         <p className="min-w-0"><span className="arc-section-label block">From wallet</span><span className="break-all font-mono text-xs text-ink">{item.fromWallet}</span></p>
                         <p className="min-w-0"><span className="arc-section-label block">To wallet</span><span className="break-all font-mono text-xs text-ink">{item.toWallet}</span></p>
                         <p className="min-w-0"><span className="arc-section-label block">Tx hash</span><span className="break-all font-mono text-xs text-ink">{item.txHash ?? "Unavailable"}</span></p>
                        <p><span className="arc-section-label block">Block number</span><span className="font-mono text-xs text-ink">{item.txBlockNumber ?? "Unavailable"}</span></p>
                        <p><span className="arc-section-label block">Timestamp</span><span className="font-mono text-xs text-ink">{formatTimestamp(item.txTimestamp ?? item.createdAt)}</span></p>
                         <p><span className="arc-section-label block">Verification status</span><span className="font-semibold text-verified">{item.verifiedTransaction ? "Verified transaction" : "Unverified"}</span></p>
                        <p><span className="arc-section-label block">From username</span><span className="text-sm text-ink">{item.fromUsername ?? "No public username"}</span></p>
                        <p><span className="arc-section-label block">To username</span><span className="text-sm text-ink">{item.toUsername ?? "No public username"}</span></p>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {history.length > 3 ? (
                 <button type="button" onClick={() => setShowAllHistory((current) => !current)} className="arc-button-secondary px-4 py-3 text-sm">
                  {showAllHistory ? "Show less" : "Show all attestations"}
                </button>
              ) : null}
            </div>
          )}
        </section>
          </>
        )}
         <section className="r4-panel">
            <p className="kicker text-gold">Upcoming verification layers</p>
          <div className="mt-4 flex flex-wrap items-center gap-y-2 text-sm font-semibold text-mutedc">
            {["Reciprocal attestations", "Trust confidence expansion", "Merchant reputation", "Advanced anomaly detection", "Multi-party verification"].map((item, index) => (
              <span key={item} className="flex items-center">
                {index > 0 ? <span aria-hidden className="mx-3 inline-block h-3 w-px bg-linec" /> : null}
                {item}
              </span>
            ))}
          </div>
        </section>
      </section>
    </ArcShell>
  );
}
