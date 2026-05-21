import { NextResponse } from "next/server";
import { claimUsername } from "@/lib/db";
import { profileRouteFor, usernameBase } from "@/lib/username";
import { publicNoStoreHeaders } from "@/lib/api-contract";

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return "Unable to claim profile";
}

function publicClaimError(message: string) {
  if (/already taken/i.test(message)) return { error: "Username unavailable", message: "This ARC Identity username is already claimed.", status: 409 };
  if (/signature/i.test(message)) return { error: "Signature verification failed", message: "Could not verify wallet ownership. Please sign again.", status: 400 };
  if (/wallet/i.test(message)) return { error: "Invalid wallet", message: "Provide a valid EVM wallet address.", status: 400 };
  if (/username|required|lowercase|letters|numbers|underscore|hyphen/i.test(message)) return { error: "Invalid username", message, status: 400 };
  return { error: "Claim failed", message: "Could not claim this ARC Identity. Please retry.", status: 400 };
}

function profileResponse(profile: Awaited<ReturnType<typeof claimUsername>>) {
  const username = profile.username;
  return {
    success: Boolean(username && profile.verifiedWallet),
    username,
    usernameBase: usernameBase(username),
    wallet_address: profile.walletAddress,
    verified_wallet: profile.verifiedWallet,
    usernameClaimed: Boolean(username),
    profileUrl: username ? profileRouteFor(username) : null,
    profile,
    user: profile
  };
}

export async function POST(request: Request) {
  let body: any = null;
  try {
    body = await request.json();
    console.log("[arc-identity] username_claim_started", { wallet: body.walletAddress, username: body.username });
    const profile = await claimUsername(body.walletAddress, body.username, body.signature);
    console.log("[arc-identity] username_claim_success", { wallet: profile.walletAddress, username: profile.username });
    const response = profileResponse(profile);
    console.log("[arc-identity] profile_create_response", {
      wallet: response.wallet_address,
      username: response.username,
      usernameBase: response.usernameBase,
      profileUrl: response.profileUrl,
      usernameClaimed: response.usernameClaimed,
      verifiedWallet: response.verified_wallet
    });
    return NextResponse.json(response);
  } catch (error) {
    const message = errorMessage(error);
    console.warn("[arc-identity] username_claim_failed", { wallet: body?.walletAddress ?? null, username: body?.username ?? null, error: message });
    const publicError = publicClaimError(message);
    return NextResponse.json({ success: false, error: publicError.error, message: publicError.message }, { status: publicError.status, headers: publicNoStoreHeaders });
  }
}
