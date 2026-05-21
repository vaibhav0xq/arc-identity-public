import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ credits: [], activeCredit: null, removed: true });
}