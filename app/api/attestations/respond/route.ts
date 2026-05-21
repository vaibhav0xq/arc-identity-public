import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Attestations are saved by connected wallets through /api/attestations/request." }, { status: 410 });
}