import { NextResponse } from "next/server";
import { publicNoStoreHeaders } from "@/lib/api-contract";

export async function POST(request: Request) {
  await request.json().catch(() => null);
  return NextResponse.json({
    ok: false,
    status: "error",
    error: "Endpoint unavailable",
    message: "Use /api/attestations/request to create transaction-backed attestations."
  }, { status: 410, headers: publicNoStoreHeaders });
}
