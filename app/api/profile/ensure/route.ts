import { NextResponse } from "next/server";
import { ensureWalletProfile } from "@/lib/db";
import { profileRouteFor, usernameBase } from "@/lib/username";
import { publicNoStoreHeaders, sanitizeUserProfile } from "@/lib/api-contract";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "Unable to ensure wallet profile";
}

function publicEnsureError(message: string) {
  if (/signature/i.test(message)) return { error: "Signature verification failed", message: "Could not verify wallet ownership. Please sign again." };
  if (/wallet/i.test(message)) return { error: "Invalid wallet", message: "Provide a valid EVM wallet address." };
  return { error: "Profile lookup failed", message: "Could not verify this wallet profile. Please retry." };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const profile = await ensureWalletProfile(body.walletAddress, body.signature, body.signatureMessage);
    const username = profile?.username ?? null;
    const publicProfile = profile ? sanitizeUserProfile(profile) : null;
    console.log("[arc-identity] ensure_lookup_result", {
      wallet: body.walletAddress,
      username,
      usernameClaimed: Boolean(username),
      verifiedWallet: Boolean(profile?.verifiedWallet)
    });
    return NextResponse.json({
      profile: publicProfile,
      username,
      usernameBase: username ? usernameBase(username) : null,
      usernameClaimed: Boolean(username),
      profileUrl: username ? profileRouteFor(username) : null
    });
  } catch (error) {
    const message = errorMessage(error);
    console.warn("[arc-identity] ensure_wallet_profile_failed", { error: message });
    return NextResponse.json(publicEnsureError(message), { status: 400, headers: publicNoStoreHeaders });
  }
}
