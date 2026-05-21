import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Attestation approval workflow was removed. Use /api/attestations/request." }, { status: 410 });
}