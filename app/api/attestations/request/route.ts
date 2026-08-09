import { NextResponse } from "next/server";
import { createAttestation } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/supabase";
import { publicNoStoreHeaders } from "@/lib/api-contract";
import type { InteractionType } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const validWalletPattern = /^0x[a-f0-9]{40}$/;
const validTxHashPattern = /^0x[a-f0-9]{64}$/;
const allowedInteractionTypes = new Set<InteractionType>(["payment", "service_payment", "escrow_release", "trade_settlement"]);

function normalizeWallet(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeTxHash(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeInteractionType(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function attestationError(message: string, status = 400, error = "Attestation validation failed", extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, status: "error", error, message, ...extra }, { status, headers: publicNoStoreHeaders });
}

function duplicateResponse(attestation: any) {
  return NextResponse.json({
    ok: false,
    status: "duplicate",
    message: "This transaction has already been submitted for this relationship.",
    attestation: responseAttestation(attestation)
  }, { status: 409, headers: publicNoStoreHeaders });
}

function validateRequestBody(body: any) {
  const txHash = normalizeTxHash(body?.txHash);
  const fromWallet = normalizeWallet(body?.fromWallet);
  const toWallet = normalizeWallet(body?.toWallet);
  const interactionType = normalizeInteractionType(body?.interactionType);

  if (!validWalletPattern.test(fromWallet)) {
    return { error: attestationError("Connect a valid EVM wallet before submitting an attestation.", 400, "Invalid wallet") };
  }
  if (!validWalletPattern.test(toWallet)) {
    return { error: attestationError("Select a registered Kyro counterparty.", 400, "Invalid counterparty") };
  }
  if (fromWallet === toWallet) {
    return { error: attestationError("You cannot submit an attestation with your own wallet as the counterparty.", 400, "Self-attestation rejected") };
  }
  if (!allowedInteractionTypes.has(interactionType as InteractionType)) {
    return { error: attestationError("Choose a supported interaction type.", 400, "Unsupported interaction type") };
  }
  if (!validTxHashPattern.test(txHash)) {
    return { error: attestationError("Paste a valid Arc transaction hash.", 400, "Invalid transaction hash") };
  }

  return {
    value: {
      txHash,
      fromWallet,
      toWallet,
      interactionType: interactionType as InteractionType
    }
  };
}

async function findAttestationByTxHash(txHash: string) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("attestations")
    .select("id,from_wallet,to_wallet,type,weight,tx_hash,tx_block_number,tx_timestamp,tx_value,verified_transaction,chain_id,created_at")
    .eq("tx_hash", txHash)
    .maybeSingle();
  if (error) {
    console.warn("[arc-identity] attestation_duplicate_lookup_failed", { txHash, error: error.message });
    return null;
  }
  return data;
}

function responseAttestation(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    txHash: row.txHash ?? row.tx_hash ?? null,
    fromWallet: row.fromWallet ?? row.from_wallet ?? null,
    toWallet: row.toWallet ?? row.to_wallet ?? null,
    interactionType: row.type ?? null,
    amount: row.txValue ?? row.tx_value ?? null,
    token: "USDC",
    createdAt: row.createdAt ?? row.created_at ?? null,
    transactionTime: row.txTimestamp ?? row.tx_timestamp ?? null,
    blockNumber: row.txBlockNumber ?? row.tx_block_number ?? null,
    chainId: row.chainId ?? row.chain_id ?? null,
    verifiedTransaction: row.verifiedTransaction ?? row.verified_transaction ?? true
  };
}

function publicAttestationError(message: string) {
  if (/unsupported interaction/i.test(message)) return "Choose a supported interaction type.";
  if (/invalid tx hash|transaction hash required/i.test(message)) return "Paste a valid Arc transaction hash.";
  if (/self-attestation/i.test(message)) return "You cannot submit an attestation with your own wallet as the counterparty.";
  if (/verified claimed profile|counterparty must|connected wallet must/i.test(message)) return "Both wallets must be registered ARC identities.";
  if (/indexed activity|refresh intelligence/i.test(message)) return "Wallet intelligence must be ready before creating verified attestations. Refresh intelligence and try again.";
  if (/already has a verified transaction attestation/i.test(message)) return "This relationship already has a recent verified attestation. Try another transaction later.";
  if (/not found/i.test(message)) return "Transaction hash not found on Arc.";
  if (/involve|wallet|participant/i.test(message)) return "Transaction does not involve both selected wallets.";
  if (/wrong chain/i.test(message)) return "This transaction was not found on the supported Arc network.";
  if (/minimum|at least|within the last|timestamp|finalized|succeed/i.test(message)) return "This transaction is not eligible for Kyro reputation.";
  if (/temporar|timeout|rpc|network|unavailable/i.test(message)) return "Transaction could not be verified right now. Try again later.";
  return "Transaction could not be verified right now. Try again later.";
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json().catch(() => null);
    const parsed = validateRequestBody(body);
    if ("error" in parsed) return parsed.error;

    const { txHash, fromWallet, toWallet, interactionType } = parsed.value;
    console.log("[arc-identity] attestation_submit_started", { txHash, fromWallet, toWallet, interactionType });
    const existing = await findAttestationByTxHash(txHash);
    if (existing) {
      console.log("[arc-identity] attestation_duplicate_detected", { txHash, attestationId: existing.id, stage: "pre_verify" });
      console.log("[arc-identity] attestation_submit_final_state", { txHash, status: "duplicate" });
      return duplicateResponse(existing);
    }
    console.log("[arc-identity] attestation_rpc_verify_started", { txHash, fromWallet, toWallet });
    console.log("[arc-identity] attestation_db_insert_started", { txHash, fromWallet, toWallet });
    const attestation = await createAttestation(fromWallet, toWallet, txHash, interactionType);
    console.log("[arc-identity] attestation_rpc_verify_success", { txHash, fromWallet, toWallet });
    console.log("[arc-identity] attestation_db_insert_success", { txHash, attestationId: attestation.id });
    console.log("[arc-identity] attestation_submit_success", { txHash, fromWallet, toWallet, attestationId: attestation.id });
    console.log("[arc-identity] attestation_submit_final_state", { txHash, status: "success" });
    return NextResponse.json({ ok: true, status: "verified", attestation: responseAttestation(attestation) }, { headers: publicNoStoreHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transaction attestation failure";
    const txHash = normalizeTxHash(body?.txHash);
    if (/duplicate attestation|duplicate key|unique constraint/i.test(message)) {
      const existing = await findAttestationByTxHash(txHash);
      console.log("[arc-identity] attestation_duplicate_detected", { txHash, attestationId: existing?.id ?? null });
      console.log("[arc-identity] attestation_submit_final_state", { txHash, status: "duplicate" });
      return duplicateResponse(existing);
    }
    console.warn("[arc-identity] attestation request failed", {
      txHash: body?.txHash ?? null,
      fromWallet: body?.fromWallet ?? null,
      toWallet: body?.toWallet ?? null,
      interactionType: body?.interactionType ?? null,
      error: message
    });
    console.log("[arc-identity] attestation_submit_failed", { txHash, error: message });
    console.log("[arc-identity] attestation_submit_final_state", { txHash, status: "error" });
    const publicMessage = publicAttestationError(message);
    return NextResponse.json({
      ok: false,
      status: "error",
      message: publicMessage,
      error: "Attestation verification failed"
    }, { status: 400, headers: publicNoStoreHeaders });
  }
}
