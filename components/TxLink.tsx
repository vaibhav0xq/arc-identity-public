export function TxLink({ txHash, className }: { txHash: string | null; className?: string }) {
  const explorer = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL;
  if (!txHash || !explorer) return null;
  return (
    <a
      href={`${explorer.replace(/\/$/, "")}/tx/${txHash}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex w-fit items-center gap-1.5 rounded-[2px] border border-linec bg-transparent px-2.5 py-[5px] font-mono text-[0.625rem] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-gold hover:bg-gold/10 ${className ?? ""}`}
    >
      View transaction
      <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1.5 8.5L8.5 1.5M8.5 1.5H3.5M8.5 1.5V6.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="square" />
      </svg>
    </a>
  );
}
