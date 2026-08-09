import { NextResponse } from "next/server";
import { getCanonicalWalletSnapshot } from "@/lib/canonical-snapshot";
import { getIdentityByUsername, listAttestations, listReputationEvents, listTrustConnections } from "@/lib/db";
import { getTrustGraph } from "@/lib/trust-graph";
import { maybeArcUsername } from "@/lib/username";
import { publicApiError, publicNoStoreHeaders, sanitizeCanonicalSnapshot, sanitizeIdentityRecord } from "@/lib/api-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const { username: usernameParam } = await params;
    const normalizedUsername = maybeArcUsername(usernameParam);
    console.log("[arc-identity] profile_route_param_received", { username: usernameParam });
    console.log("[arc-identity] profile_route_normalized_username", { username: normalizedUsername });
    const identity = await getIdentityByUsername(usernameParam);
    console.log("[arc-identity] profile_lookup_result", { username: normalizedUsername, found: Boolean(identity), wallet: identity?.profile.walletAddress ?? null });
    if (!identity) {
      console.warn("[arc-identity] profile_route_not_found_reason", { username: usernameParam, normalizedUsername, reason: normalizedUsername ? "no_profile_row" : "invalid_username" });
      return publicApiError("Profile not found", "This Kyro profile could not be found.", 404, { username: normalizedUsername });
    }
    const [attestations, reputationEvents, trustConnections, trustGraph] = await Promise.all([
      listAttestations(identity.profile.walletAddress),
      listReputationEvents(identity.profile.walletAddress),
      listTrustConnections(identity.profile.walletAddress),
      getTrustGraph(identity.profile.walletAddress)
    ]);
    const canonical = sanitizeCanonicalSnapshot(getCanonicalWalletSnapshot(identity));
    const publicIdentity = sanitizeIdentityRecord(identity);
    console.log("[arc-identity] score_snapshot_read_profile", {
      username: publicIdentity.profile.username,
      wallet: publicIdentity.profile.walletAddress,
      score: canonical.arcIdentityScore,
      totalTx: canonical.totalTx,
      activeChains: canonical.activeChainCount,
      globalWalletAgeDays: canonical.globalWalletAgeDays,
      scoreUpdatedAt: canonical.scoreUpdatedAt,
      dataSource: canonical.dataSource
    });
    return NextResponse.json({
      ...publicIdentity,
      ...canonical,
      attestations,
      reputationEvents,
      trustConnections,
      trustGraph
    }, { headers: publicNoStoreHeaders });
  } catch (error) {
    console.warn("[arc-identity] profile_api_failed", { error: error instanceof Error ? error.message : "Unable to load profile" });
    return publicApiError("Profile unavailable", "Could not load this profile. Please retry.", 500);
  }
}
