import { refreshWalletProfile, normalizeWallet } from "@/lib/db";
import type { IdentityRecord } from "@/lib/types";

const refreshLocks = new Map<string, Promise<IdentityRecord | null>>();

export function isRefreshInProgress(walletAddress: string) {
  return refreshLocks.has(normalizeWallet(walletAddress));
}

export function triggerWalletRefresh(walletAddress: string): { started: boolean; promise: Promise<IdentityRecord | null> } {
  const wallet = normalizeWallet(walletAddress);
  const existing = refreshLocks.get(wallet);
  if (existing) return { started: false, promise: existing };

  const job = refreshWalletProfile(wallet)
    .catch((error) => {
      console.warn("[arc-identity] background score refresh failed", {
        wallet,
        message: error instanceof Error ? error.message : "unknown"
      });
      throw error;
    })
    .finally(() => {
      refreshLocks.delete(wallet);
    });

  refreshLocks.set(wallet, job);
  return { started: true, promise: job };
}

export async function runWalletRefresh(walletAddress: string) {
  const { promise } = triggerWalletRefresh(walletAddress);
  return await promise;
}