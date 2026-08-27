/* Canonical wallet address validation, shared by API routes and query
   builders. Audit finding F-03: several trust graph queries interpolate
   wallet strings into PostgREST .or() filters, so every value that reaches
   a filter must first pass this shape check. */

export const WALLET_ADDRESS_PATTERN = /^0x[a-f0-9]{40}$/;

export function isValidWalletAddress(wallet: string | null | undefined) {
  return WALLET_ADDRESS_PATTERN.test((wallet ?? "").trim().toLowerCase());
}

/* Normalizes and validates in one step for internal query boundaries.
   Throws instead of returning a flag: a malformed wallet reaching a query
   builder is a bug or an injection attempt, and both should fail loudly. */
export function assertQueryWallet(wallet: string | null | undefined, context: string): string {
  const normalized = (wallet ?? "").trim().toLowerCase();
  if (!WALLET_ADDRESS_PATTERN.test(normalized)) {
    throw new Error(`Invalid wallet address in ${context}`);
  }
  return normalized;
}
