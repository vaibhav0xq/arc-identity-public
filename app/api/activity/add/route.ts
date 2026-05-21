import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Manual activity writes are disabled. Reputation changes require verified attestations or Arc RPC data." },
    { status: 410 }
  );
}