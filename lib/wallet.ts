export function shortenAddress(address: string) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/* Collision-aware truncation for a SET of addresses rendered together.
   Two different wallets can share shortenAddress output (same leading
   and trailing hex), which would read as a duplicate entry. For display
   lists we widen ONLY the colliding labels, two hex chars per side per
   round, until every distinct address reads distinctly; identical full
   addresses (the same wallet) always share one label, and widening
   falls back to the full address when the hex runs out. Keys are
   lowercase full addresses. */
export function collisionFreeAddressLabels(addresses: readonly string[]): Map<string, string> {
  const unique = Array.from(
    new Set(
      addresses
        .filter((address) => typeof address === "string" && address.length > 0)
        .map((address) => address.toLowerCase())
    )
  );
  const extraByAddress = new Map<string, number>(unique.map((address) => [address, 0]));

  const labelFor = (address: string) => {
    const extra = extraByAddress.get(address) ?? 0;
    const prefix = 6 + extra;
    const suffix = 4 + extra;
    if (prefix + suffix >= address.length) return address;
    return `${address.slice(0, prefix)}...${address.slice(-suffix)}`;
  };

  /* Each round widens every still-colliding label; 24 rounds covers a
     full 42-char EVM address even in the worst case. */
  for (let round = 0; round < 24; round += 1) {
    const groups = new Map<string, string[]>();
    for (const address of unique) {
      const label = labelFor(address);
      const group = groups.get(label);
      if (group) group.push(address);
      else groups.set(label, [address]);
    }
    let widened = false;
    for (const group of Array.from(groups.values())) {
      if (group.length < 2) continue;
      for (const address of group) {
        const extra = extraByAddress.get(address) ?? 0;
        if (6 + extra + 4 + extra < address.length) {
          extraByAddress.set(address, extra + 2);
          widened = true;
        }
      }
    }
    if (!widened) break;
  }

  return new Map(unique.map((address) => [address, labelFor(address)]));
}
