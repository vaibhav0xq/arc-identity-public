/* Client-safe map of the networks Kyro reads. Mirrors the `chains` config in
   lib/multichain.ts (server side); keep the two lists in sync when coverage
   changes. The wallet's selected network never changes what gets scored and
   personal_sign verification works from any chain, so consumers treat a
   foreign network as advisory information, never as an error state. */

export type WalletNetworkInfo = {
  chainId: number;
  /** Human name when known, otherwise null. */
  name: string | null;
  /** True when Kyro indexes this chain. */
  supported: boolean;
  /** Short label safe for UI: the name, or "chain <id>" when unknown. */
  label: string;
};

const arcChainId = Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID || 0);

export const kyroNetworks: ReadonlyArray<{ chainId: number; name: string }> = [
  { chainId: 1, name: "Ethereum" },
  { chainId: 8453, name: "Base" },
  { chainId: 42161, name: "Arbitrum" },
  { chainId: 137, name: "Polygon" },
  { chainId: 56, name: "BNB Chain" },
  ...(Number.isInteger(arcChainId) && arcChainId > 0 ? [{ chainId: arcChainId, name: "Arc Testnet" }] : [])
];

/* Display names for networks Kyro does not read, so the notice can say
   "Sepolia" instead of "chain 11155111". Purely cosmetic; an id missing here
   simply falls back to the numeric label. */
const foreignNetworkNames: Record<number, string> = {
  10: "OP Mainnet",
  25: "Cronos",
  100: "Gnosis",
  130: "Unichain",
  250: "Fantom",
  324: "zkSync Era",
  1329: "Sei",
  5000: "Mantle",
  43114: "Avalanche",
  59144: "Linea",
  81457: "Blast",
  534352: "Scroll",
  7777777: "Zora",
  97: "BNB Testnet",
  17000: "Holesky",
  80002: "Polygon Amoy",
  84532: "Base Sepolia",
  421614: "Arbitrum Sepolia",
  560048: "Hoodi",
  10143: "Monad Testnet",
  11155111: "Sepolia"
};

/** Accepts the raw eth_chainId / chainChanged payload (hex string, decimal
    string or number) and returns a positive integer chain id, or null. */
export function parseChainId(raw: unknown): number | null {
  let value: number | null = null;
  if (typeof raw === "number") {
    value = raw;
  } else if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return null;
    value = text.toLowerCase().startsWith("0x") ? Number.parseInt(text, 16) : Number.parseInt(text, 10);
  }
  if (value === null || !Number.isSafeInteger(value) || value <= 0) return null;
  return value;
}

export function describeWalletNetwork(chainId: number): WalletNetworkInfo {
  const known = kyroNetworks.find((network) => network.chainId === chainId);
  if (known) return { chainId, name: known.name, supported: true, label: known.name };
  const foreign = foreignNetworkNames[chainId] ?? null;
  return { chainId, name: foreign, supported: false, label: foreign ?? `chain ${chainId}` };
}

/** "Ethereum, Base, Arbitrum, Polygon and BNB Chain". Arc stays out of this
    reputation-sources sentence until Arc is a first-class indexed reputation
    network; it remains in kyroNetworks above so the notice stays quiet for
    wallets on Arc. */
export function kyroNetworkList(): string {
  const names = kyroNetworks.filter((network) => network.chainId !== arcChainId).map((network) => network.name);
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const switchTarget = { chainIdHex: "0x1", name: "Ethereum" } as const;
