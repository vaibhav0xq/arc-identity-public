export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { unstable_noStore as noStore } from "next/cache";
import { listUsers, isMissingSchemaError, normalizeDirectoryLimit, normalizeDirectorySort } from "@/lib/db";
import { publicNoStoreHeaders, sanitizeIdentityRecord } from "@/lib/api-contract";

export async function GET(request: Request) {
  noStore();
  const started = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const sort = normalizeDirectorySort(searchParams.get("sort"));
    const limit = normalizeDirectoryLimit(searchParams.get("limit"));
    const query = searchParams.get("q") ?? searchParams.get("search") ?? "";
    console.log("[arc-identity] directory_fetch_started", { endpoint: "/api/users", sort, limit, hasSearch: Boolean(query.trim()) });
    const users = (await listUsers(sort, limit, query)).map((user) => sanitizeIdentityRecord(user));
    console.log("[arc-identity] directory_fetch_success", { endpoint: "/api/users", count: users.length, durationMs: Date.now() - started });
    console.log("[arc-identity] directory_fetch_duration", { endpoint: "/api/users", durationMs: Date.now() - started });
    console.log("[arc-identity] directory_result_count", { count: users.length });
    return NextResponse.json(
      {
        users,
        source: "arc_identity_profiles",
        count: users.length,
        queriedAt: new Date().toISOString()
      },
      {
        headers: {
          ...publicNoStoreHeaders,
          "Pragma": "no-cache",
          "Expires": "0"
        }
      }
    );
  } catch (error) {
    const setupRequired = isMissingSchemaError(error);
    console.warn("[arc-identity] directory_fetch_failed", { endpoint: "/api/users", durationMs: Date.now() - started, error: error instanceof Error ? error.message : "Unknown error" });
    return NextResponse.json(
      {
        users: [],
        error: setupRequired
          ? "ARC Identity records are not available yet. Please retry shortly."
          : "Could not load registered identities. Please retry.",
        message: setupRequired
          ? "Registered identities are not available yet. Please retry shortly."
          : "Could not load registered identities. Please retry.",
        setupRequired
      },
      {
        status: setupRequired ? 200 : 500,
        headers: {
          ...publicNoStoreHeaders,
          "Pragma": "no-cache",
          "Expires": "0"
        }
      }
    );
  }
}
