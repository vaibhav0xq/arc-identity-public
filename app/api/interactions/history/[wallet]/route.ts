import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  const { wallet: walletParam } = await params;
  const wallet = decodeURIComponent(walletParam).trim().toLowerCase();
  console.log("[arc-identity] history_fetch_started", { wallet });
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("attestations")
      .select("id,from_wallet,to_wallet,type,weight,sender_score_at,pair_history_count,tx_hash,tx_block_number,tx_timestamp,tx_value,verified_participants,verified_transaction,chain_id,created_at")
      .or(`from_wallet.eq.${wallet},to_wallet.eq.${wallet}`)
      .not("tx_hash", "is", null)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[arc-identity] history_fetch_failed", {
        wallet,
        table: "attestations",
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint
        }
      });
      return NextResponse.json({ attestations: [], error: "Could not load attestation history. Please retry." }, { status: 500 });
    }

    console.log("[arc-identity] history_fetch_result_count", { wallet, count: data?.length ?? 0 });
    return NextResponse.json({ attestations: data ?? [] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load attestations";
    console.error("[arc-identity] history_fetch_failed", { wallet, error: message });
    return NextResponse.json({ attestations: [], error: "Could not load attestation history. Please retry." }, { status: 500 });
  }
}
