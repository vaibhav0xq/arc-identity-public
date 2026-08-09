import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Legacy credit endpoints are disabled. Kyro uses Arc RPC plus verified attestations only." },
    { status: 410 }
  );
}