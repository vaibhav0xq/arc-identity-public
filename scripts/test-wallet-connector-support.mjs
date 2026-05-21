import fs from "node:fs";

const walletConnectButton = fs.readFileSync("components/WalletConnectButton.tsx", "utf8");
const readme = fs.existsSync("README.md") ? fs.readFileSync("README.md", "utf8") : "";

function fail(message, details) {
  console.error(JSON.stringify({ ok: false, failure: message, details }, null, 2));
  process.exit(1);
}

const requiredSignals = [
  "eip6963:requestProvider",
  "eip6963:announceProvider",
  "isRabby",
  "isOkxWallet",
  "isOKExWallet",
  "isCoinbaseWallet",
  "isBlockedLaunchWallet",
  "providers?: Eip1193Provider[]",
  "role=\"dialog\"",
  "Connect Wallet",
  "Choose an EVM wallet to continue.",
  "arcIdentityWalletProvider",
  "No compatible EVM wallet found.",
  "Install or enable MetaMask, Rabby, OKX Wallet, or Coinbase Wallet to continue.",
  "Domain: arcidentity.in",
  "Purpose: Verify wallet ownership",
  "Nonce:",
  "This signature does not send a transaction.",
  "Wallet request rejected.",
  "Unsupported wallet provider.",
  "Signature rejected."
];

for (const signal of requiredSignals) {
  if (!walletConnectButton.includes(signal)) fail("Wallet connector support signal missing", { signal });
}

if (/install metamask/i.test(walletConnectButton)) {
  fail("Wallet connect copy should not imply MetaMask is the only supported wallet");
}

if (!/label\.includes\(\"phantom\"\)/.test(walletConnectButton) || !walletConnectButton.includes("Boolean(wallet.provider.isPhantom)")) {
  fail("Wallet connector should explicitly exclude Phantom providers for launch");
}

if (/another EVM wallet/i.test(walletConnectButton)) {
  fail("Wallet connector empty-state copy should recommend launch-supported wallets only");
}

if (!readme.includes("NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=")) {
  fail("README should include WalletConnect project ID placeholder");
}

console.log(JSON.stringify({
  ok: true,
  checked: "components/WalletConnectButton.tsx",
  connectors: ["MetaMask", "Rabby", "OKX Wallet", "Coinbase Wallet", "generic injected EIP-1193", "EIP-6963"],
  note: "Phantom is intentionally hidden for the EVM-only launch flow. MetaMask domain blocklist warnings are external and must be appealed separately; ARC Identity does not request transactions or token approvals."
}, null, 2));
