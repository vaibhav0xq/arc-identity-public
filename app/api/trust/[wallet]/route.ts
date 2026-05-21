import { NextResponse } from "next/server";
import { getTrustGraph } from "@/lib/trust-graph";
import { isValidWalletAddress, publicApiError, publicNoStoreHeaders } from "@/lib/api-contract";

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet } = await params;
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet });
    }
    const trustGraph = await getTrustGraph(wallet);
    return NextResponse.json(trustGraph, { headers: publicNoStoreHeaders });
  } catch (error) {
    console.warn("[arc-identity] trust_api_failed", { error: error instanceof Error ? error.message : "Unable to load trust graph" });
    return publicApiError("Trust graph unavailable", "Could not load trust graph data. Please retry.", 500);
  }
}
