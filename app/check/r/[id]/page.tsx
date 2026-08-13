import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ArcShell } from "@/components/ArcShell";
import { CopyButton } from "@/components/CopyButton";
import {
  EvidenceSection,
  FindingsSection,
  ReportSectionHead,
  SpecRow,
  VERDICT_META,
  VerdictPlate,
  formatUtc,
  shortWallet,
  useCaseLabel
} from "@/components/VerdictReport";
import type { ReasonLike, SnapshotLike } from "@/components/VerdictReport";
import { publicAppUrl } from "@/lib/links";

export const dynamic = "force-dynamic";

const API_ORIGIN = (process.env.KYRO_API_ORIGIN || "https://www.thekyro.co").replace(/\/$/, "");
const RECEIPT_ID_PATTERN = /^rcp_[A-Za-z0-9_-]{16}$/;

/* Shape served by GET /api/v1/decision-receipts/:id (public/kyro-openapi.yaml). */
type ReceiptRecord = SnapshotLike & {
  id: string;
  createdAt: string;
  payloadHash: string;
  warnings: ReasonLike[];
};

type ReceiptLookup = { data: ReceiptRecord | null; missing: boolean };

/* One API read per request, shared by generateMetadata and the page body.
   Obviously malformed ids are answered locally without a network call. */
const loadReceipt = cache(async (id: string): Promise<ReceiptLookup> => {
  if (!RECEIPT_ID_PATTERN.test(id)) return { data: null, missing: true };
  try {
    const response = await fetch(`${API_ORIGIN}/api/v1/decision-receipts/${encodeURIComponent(id)}`, {
      cache: "no-store",
      headers: { accept: "application/json" }
    });
    if (response.status === 404 || response.status === 400) return { data: null, missing: true };
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok || !payload?.data?.receipt) return { data: null, missing: false };
    return { data: payload.data.receipt as ReceiptRecord, missing: false };
  } catch {
    return { data: null, missing: false };
  }
});

/* Receipts are permanent public snapshots about third-party wallets, so they
   are deliberately kept out of search engines: a months-old CAUTION must
   never rank in Google for a wallet that has since improved. Anyone with the
   link still sees it — noindex, not access control.

   Status-code reality: the root app/loading.tsx makes every page stream, so
   browsers get HTTP 200 with the 404 UI + noindex arriving in-stream. Doing
   the lookup here (deduped via cache()) still helps: Next blocks metadata for
   HTML-limited crawlers, so those receive a genuine 404 status for dead
   receipt links. The API route always returns real status codes. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await loadReceipt(id);
  if (!result.data && result.missing) notFound();
  const receipt = result.data;
  const verdictLabel = receipt ? (VERDICT_META[receipt.decision] ?? VERDICT_META.caution).label : null;
  return {
    title: receipt ? `${verdictLabel}: ${useCaseLabel(receipt.useCase)} decision receipt | Kyro` : "Decision receipt | Kyro",
    description: receipt
      ? `Kyro Decision Engine verdict recorded ${formatUtc(receipt.createdAt)}. Immutable snapshot. Run a fresh check before relying on it.`
      : "A point-in-time snapshot of a Kyro Decision Engine verdict. Receipts never update. Run a fresh check before relying on one.",
    robots: { index: false, follow: false },
    openGraph: receipt
      ? {
          title: `Kyro verdict: ${verdictLabel} (${useCaseLabel(receipt.useCase).toLowerCase()})`,
          description: `Point-in-time decision receipt recorded ${formatUtc(receipt.createdAt)}. It never updates.`,
          type: "article"
        }
      : undefined
  };
}

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await loadReceipt(id);

  if (!result.data) {
    if (result.missing) notFound();
    /* Transient read failure: say so honestly instead of a misleading 404 —
       the receipt may exist. */
    return (
      <ArcShell variant="marketing">
        <div className="fade-in mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6 lg:px-8">
          <header className="border-b border-linec pb-7 pt-8 sm:pb-9 sm:pt-12">
            <p className="kicker">Decision Engine / Receipt</p>
            <h1 className="mt-4 font-heading text-5xl font-semibold text-ink sm:text-6xl">Receipt unavailable.</h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-mutedc sm:text-lg">
              This receipt could not be read right now. Refresh the page to retry.
            </p>
          </header>
        </div>
      </ArcShell>
    );
  }

  const receipt = result.data;
  const recordedAt = formatUtc(receipt.createdAt);

  return (
    <ArcShell variant="marketing">
      <div className="fade-in mx-auto w-full max-w-[1100px] px-4 pb-20 sm:px-6 lg:px-8">
        <header className="pb-10 pt-8 sm:pb-14 sm:pt-12">
          <p className="kicker">Decision Engine / Receipt</p>
          <h1 className="mt-4 max-w-3xl font-heading text-5xl font-semibold text-ink sm:text-7xl">
            Decision receipt.
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-7 text-mutedc sm:text-lg">
            A point-in-time snapshot of a Kyro verdict, recorded{" "}
            <b className="font-medium text-ink">{recordedAt}</b>. It never updates. Wallet reputations change,
            so run a fresh check before relying on it.
          </p>
        </header>

        <div className="subject-strip">
          <div className="min-w-0">
            <p className="kicker">01 / Decision report / snapshot</p>
            <p className="subject-name mt-3">{receipt.username ?? shortWallet(receipt.wallet)}</p>
          </div>
          <div className="subject-meta">
            <span>{useCaseLabel(receipt.useCase)} check</span>
            <span>{receipt.decisionModelVersion}</span>
            <span className="text-limited">immutable snapshot</span>
          </div>
        </div>

        <div className="mt-9 sm:mt-12">
          <VerdictPlate
            snapshot={receipt}
            subline={`As of ${recordedAt}. Not a live verdict.`}
            kickerSuffix=" / snapshot"
            headingId="receipt-verdict"
          />
        </div>

        {/* Snapshot record */}
        <section className="rpt-section" aria-labelledby="receipt-provenance-title">
          <ReportSectionHead
            index="02"
            kicker="Record"
            title="Snapshot record"
            titleId="receipt-provenance-title"
            meta="GET /api/v1/decision-receipts/:id"
          />
          <dl className="spec-list">
            <SpecRow label="Recorded" value={recordedAt} />
            <SpecRow label="Receipt id" value={receipt.id} action={<CopyButton value={receipt.id} label="Copy id" />} />
            <SpecRow label="Wallet" value={receipt.wallet} action={<CopyButton value={receipt.wallet} label="Copy wallet" />} />
            <SpecRow label="Use case" value={useCaseLabel(receipt.useCase)} mono={false} />
            <SpecRow
              label="Integrity hash (sha256)"
              value={receipt.payloadHash}
              action={<CopyButton value={receipt.payloadHash} label="Copy hash" />}
            />
            <SpecRow label="Score model" value={receipt.scoreModelVersion ?? "unknown"} />
            <SpecRow label="Decision model" value={receipt.decisionModelVersion} />
            <SpecRow
              label="Freshness at snapshot"
              value={`${receipt.freshness.cacheStatus ?? "unknown"} · indexed ${formatUtc(receipt.freshness.lastIndexedAt)}`}
            />
          </dl>
        </section>

        <FindingsSection
          index="03"
          title="Reasons at snapshot time"
          sectionId="receipt-reasons-title"
          reasons={receipt.reasons}
          warnings={receipt.warnings}
        />

        <EvidenceSection
          index="04"
          title="What the verdict was built on"
          sectionId="receipt-evidence-title"
          evidence={receipt.evidence}
          conservativeNote
        />

        {/* Currency notice + fresh check */}
        <section className="rpt-section" aria-labelledby="receipt-next-title">
          <ReportSectionHead index="05" kicker="Currency" title="Before you rely on this" titleId="receipt-next-title" />
          <div className="report-note">
            <b>Snapshots age</b>
            This snapshot was correct when it was recorded. The wallet&apos;s reputation may have changed since.
            Always run a fresh check before transacting.
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-end gap-x-7 gap-y-3">
            {receipt.username ? (
              <Link
                href={publicAppUrl(`/profile/${encodeURIComponent(receipt.username)}`)}
                className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-quiet transition-colors duration-150 hover:text-ink"
              >
                View full profile →
              </Link>
            ) : null}
            <Link
              href="/check"
              className="font-mono text-[0.72rem] uppercase tracking-[0.1em] text-gold transition-colors duration-150 hover:text-ink"
            >
              Run a fresh check →
            </Link>
          </div>
        </section>
      </div>
    </ArcShell>
  );
}
