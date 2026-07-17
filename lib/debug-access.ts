import { NextResponse } from "next/server";

export function debugRouteDisabled() {
  if (process.env.NODE_ENV !== "production") return null;
  if (process.env.ARC_ENABLE_DEBUG_ROUTES === "true") return null;
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
