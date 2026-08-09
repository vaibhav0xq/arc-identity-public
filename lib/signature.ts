import { verifyMessage } from "viem";

const validWalletPattern = /^0x[a-f0-9]{40}$/i;
const validSignaturePattern = /^0x[a-f0-9]+$/i;

export function normalizeSignatureWallet(walletAddress: string) {
  return String(walletAddress ?? "").trim().toLowerCase();
}

export async function verifyWalletSignature({
  walletAddress,
  signature,
  message
}: {
  walletAddress: string;
  signature: string;
  message: string;
}) {
  const wallet = normalizeSignatureWallet(walletAddress);
  const signedMessage = String(message ?? "");
  const signatureValue = String(signature ?? "").trim();

  if (!validWalletPattern.test(wallet)) throw new Error("Invalid wallet address");
  if (!signatureValue || !validSignaturePattern.test(signatureValue)) throw new Error("Signature required to verify wallet ownership");
  if (!signedMessage) throw new Error("Signed message required to verify wallet ownership");
  if (!signedMessage.includes("Kyro")) throw new Error("Signature message is not an Kyro verification message");
  if (!signedMessage.toLowerCase().includes(wallet)) throw new Error("Signature message wallet mismatch");

  const verified = await verifyMessage({
    address: wallet as `0x${string}`,
    message: signedMessage,
    signature: signatureValue as `0x${string}`
  });

  if (!verified) throw new Error("Signature does not match wallet address");
}
