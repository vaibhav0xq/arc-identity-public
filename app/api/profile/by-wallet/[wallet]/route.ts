import { NextResponse } from "next/server";
import { getCanonicalWalletSnapshot } from "@/lib/canonical-snapshot";
import { getIdentityByWallet, normalizeWallet } from "@/lib/db";
import { getTrustGraph } from "@/lib/trust-graph";
import { profileRouteFor, usernameBase } from "@/lib/username";
import { getSupabaseAdmin } from "@/lib/supabase";
import { withTimeout } from "@/lib/timeouts";
import { isValidWalletAddress, publicApiError, publicNoStoreHeaders, sanitizeCanonicalSnapshot, sanitizeIdentityRecord } from "@/lib/api-contract";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function GET(_request: Request, { params }: { params: Promise<{ wallet: string }> }) {
  try {
    const { wallet: walletParam } = await params;
    const wallet = normalizeWallet(walletParam);
    if (!isValidWalletAddress(wallet)) {
      return publicApiError("Invalid wallet", "Provide a valid EVM wallet address.", 400, { walletAddress: wallet, usernameClaimed: false });
    }
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("*")
      .ilike("wallet_address", wallet)
      .not("username", "is", null)
      .limit(2);
    if (error) throw error;

    const profileRow = rows?.[0] ?? null;
    if (!profileRow?.username) {
      return publicApiError("Profile not found", "No claimed ARC Identity profile was found for this wallet.", 404, { walletAddress: wallet, usernameClaimed: false });
    }

    const identity = await getIdentityByWallet(profileRow.wallet_address, false);
    if (!identity?.profile.username) {
      return publicApiError("Profile not found", "No claimed ARC Identity profile was found for this wallet.", 404, { walletAddress: wallet, usernameClaimed: false });
    }

    const trustGraph = await withTimeout(getTrustGraph(identity.profile.walletAddress), 900, "profile trust graph summary").catch(() => null);
    const canonical = sanitizeCanonicalSnapshot(getCanonicalWalletSnapshot(identity));
    const publicIdentity = sanitizeIdentityRecord(identity);
    console.log("[arc-identity] profile_score_source", {
      wallet: publicIdentity.profile.walletAddress,
      username: publicIdentity.profile.username,
      score: canonical.arcIdentityScore,
      dataSource: canonical.dataSource,
      indexedTx: canonical.indexedTx,
      activeChainCount: canonical.activeChainCount,
      hasIndexedActivity: canonical.hasIndexedActivity
    });
    return NextResponse.json({
      ...publicIdentity,
      ...canonical,
      trustGraph,
      username: publicIdentity.profile.username,
      usernameBase: usernameBase(publicIdentity.profile.username),
      usernameClaimed: true,
      walletAddress: publicIdentity.profile.walletAddress,
      profileUrl: profileRouteFor(publicIdentity.profile.username),
      duplicateProfileCount: Math.max(0, (rows?.length ?? 0) - 1)
    }, { headers: publicNoStoreHeaders });
  } catch (error) {
    console.warn("[arc-identity] profile_by_wallet_failed", { error: error instanceof Error ? error.message : "Unable to load wallet profile" });
    return publicApiError("Profile unavailable", "Could not verify this wallet profile. Please retry.", 500);
  }
}
