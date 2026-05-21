import { NextResponse } from "next/server";
import { getWalletAnalytics } from "@/lib/onchain";
import { isValidWalletAddress, publicApiError, publicNoStoreHeaders } from "@/lib/api-contract";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ wallet: string }> }
) {
  try {
    const { wallet } = await params;
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet });
    }
    const analytics = await getWalletAnalytics(wallet, 2400);
    return NextResponse.json({ ...analytics, indexerSource: "arc_identity_indexer" }, { headers: publicNoStoreHeaders });
  } catch (error) {
    console.warn("[arc-identity] onchain_api_failed", { error: error instanceof Error ? error.message : "Unable to load wallet activity" });
    return publicApiError("Wallet activity unavailable", "Could not load wallet activity. Please retry.", 500);
  }
}
