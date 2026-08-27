import type { Metadata } from "next";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { DevelopersPageClient } from "@/components/DevelopersPageClient";
import { DECISION_MODEL_VERSION } from "@/lib/decision-engine";

export const metadata: Metadata = {
  title: "Kyro Developer API",
  description:
    "Decision API. Pre-transaction decisions powered by wallet intelligence and reputation evidence. Allow / caution / block verdicts, USDC limits, reason codes and receipts."
};

const DOCS_BASE = "https://docs.thekyro.co";

const coreEndpoints: {
  method: "GET" | "POST";
  path: string;
  purpose: string;
  docs: string;
}[] = [
  {
    method: "GET",
    path: "/api/v1/decision/:wallet",
    purpose: "Allow / caution / block verdict with a recommended USDC limit, reason codes and evidence.",
    docs: `${DOCS_BASE}/api-reference/getDecision`
  },
  {
    method: "POST",
    path: "/api/v1/decision/batch",
    purpose: "Screen many counterparties in one call. Rows fail individually, never the whole batch.",
    docs: `${DOCS_BASE}/api-reference/batchDecisions`
  },
  {
    method: "GET",
    path: "/api/v1/score/:wallet",
    purpose: "Committed reputation score for a wallet with component breakdown and freshness.",
    docs: `${DOCS_BASE}/api-reference/getScore`
  },
  {
    method: "GET",
    path: "/api/v1/trust/:wallet",
    purpose: "Verified trust graph for a wallet: transaction-backed relationship edges and graph metrics.",
    docs: `${DOCS_BASE}/api-reference/getTrustGraph`
  },
  {
    method: "GET",
    path: "/api/v1/interaction-graph/:wallet",
    purpose: "Observed onchain counterparties from saved snapshots, separate from verified trust and score.",
    docs: `${DOCS_BASE}/api-reference/getInteractionGraph`
  },
  {
    method: "GET",
    path: "/api/v1/profile/:username",
    purpose: "Public summary of a registered Kyro identity by username.",
    docs: `${DOCS_BASE}/api-reference/getProfile`
  },
  {
    method: "POST",
    path: "/api/v1/decision-receipts",
    purpose: "Mint an immutable, shareable receipt of a decision.",
    docs: `${DOCS_BASE}/api-reference/createDecisionReceipt`
  },
  {
    method: "GET",
    path: "/api/v1/decision-receipts/:id",
    purpose: "Fetch a receipt exactly as minted. Receipts never change after creation.",
    docs: `${DOCS_BASE}/api-reference/getDecisionReceipt`
  },
  {
    method: "POST",
    path: "/api/v1/intake/:wallet",
    purpose: "Start indexing a wallet Kyro has not seen yet. No signature from the owner is needed.",
    docs: `${DOCS_BASE}/api-reference/intakeWallet`
  }
];

const quickstartCurl = `curl https://www.thekyro.co/api/v1/decision/0x1234567890abcdef1234567890abcdef12345678`;

const thCls = "border-b-2 border-ink pb-2.5 pr-4 text-left font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-quiet";
const tdCls = "border-b border-linec py-3.5 pr-4 align-top";

const docsLinkCls = "font-bold text-ink underline decoration-gold decoration-2 underline-offset-4 transition hover:text-gold";

function MethodBadge({ method }: { method: "GET" | "POST" }) {
  return (
    <span
      className={
        method === "POST"
          ? "inline-flex shrink-0 items-center rounded-[2px] border border-ink bg-ink px-2 py-[3px] font-mono text-[0.6rem] font-bold tracking-[0.1em] text-bone"
          : "inline-flex shrink-0 items-center rounded-[2px] border border-ink px-2 py-[3px] font-mono text-[0.6rem] font-bold tracking-[0.1em] text-ink"
      }
    >
      {method}
    </span>
  );
}

function DocSection({
  id,
  num,
  label,
  title,
  tag,
  children
}: {
  id: string;
  num: string;
  label: string;
  title: string;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="r4-panel scroll-mt-40 pt-6 md:scroll-mt-44">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="arc-section-label">
          <span className="font-bold text-gold">{num}</span>
          <span className="px-2 text-linec-dark">/</span>
          {label}
        </p>
        {tag ? <p className="font-mono text-[0.6rem] uppercase tracking-[0.14em] text-quiet">{tag}</p> : null}
      </div>
      <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{title}</h2>
      <div className="mt-5 text-[0.95rem] leading-7 text-mutedc">{children}</div>
    </section>
  );
}

function CodeBlock({ title, tag, code }: { title?: string; tag?: string; code: string }) {
  return (
    <div className="mt-4 min-w-0 overflow-hidden rounded-[2px] border border-graphite-2 bg-[#272a28]">
      {title || tag ? (
        <div className="flex items-baseline justify-between gap-3 border-b border-[#3a3e3a] px-4 py-2">
          <span className="min-w-0 font-mono text-[0.62rem] uppercase tracking-[0.14em] text-[#9aa093]">{title}</span>
          {tag ? <span className="shrink-0 font-mono text-[0.6rem] font-bold uppercase tracking-[0.14em] text-[#c0a36a]">{tag}</span> : null}
        </div>
      ) : null}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-6" style={{ color: "#e6e2d4" }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <ArcShell>
      <div className="fade-in w-full py-10 lg:py-14">
        <header className="border-b-2 border-ink pb-10">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-linec pb-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-mutedc">Kyro Developer Platform · Reference No. KY-API-01</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip green"><span className="dot" />Live</span>
              <span className="chip">v1 · frozen contract</span>
            </div>
          </div>
          <h1 className="mt-8 max-w-4xl font-heading text-5xl font-semibold tracking-tight text-ink sm:text-6xl lg:text-[4.4rem] lg:leading-[1.02]">
            Decision API
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-mutedc">
            Pre-transaction decisions powered by wallet intelligence and reputation evidence.
          </p>
          <p className="mt-3 max-w-3xl text-base leading-7 text-mutedc">
            Check a wallet before funds move. Kyro returns an <b className="text-ink">allow / caution / block</b> verdict
            with a recommended USDC limit, machine-readable reason codes and the evidence behind it. Built for agents,
            payment apps, escrow, marketplaces, lending and USDC workflows.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-px border border-linec bg-linec lg:grid-cols-4">
            {[
              ["Base URL", "www.thekyro.co"],
              ["Surface", "8 core endpoints"],
              ["Score model", "identity_score_v1"],
              ["Decision model", DECISION_MODEL_VERSION]
            ].map(([label, value]) => (
              <div key={label} className="bg-bone px-4 py-3.5">
                <p className="font-mono text-[0.58rem] uppercase tracking-[0.16em] text-quiet">{label}</p>
                <p className="mt-1.5 break-all font-mono text-[0.78rem] font-bold text-ink">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href="https://docs.thekyro.co"
              target="_blank"
              rel="noopener noreferrer"
              className="border-2 border-ink bg-ink px-4 py-2.5 text-sm font-bold text-bone transition hover:bg-[#3a3e3a]"
            >
              Full documentation at docs.thekyro.co <span aria-hidden="true">↗</span>
            </a>
            <a href="/kyro-openapi.yaml" className="border border-linec bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink">
              OpenAPI 3.1.0 spec
            </a>
            <a href="/docs/Kyro-OpenAPI-Spec.pdf" className="border border-linec bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink">
              PDF summary
            </a>
            <Link href="/check" className="border border-linec bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink">
              Counterparty Check (no code)
            </Link>
            <Link href="/pricing" className="border border-linec bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink">
              View pricing
            </Link>
          </div>
        </header>

        <article className="mt-12 grid min-w-0 max-w-5xl gap-14">
          <DocSection id="overview" num="01" label="Overview" title="What Kyro is">
            <div className="grid gap-4">
              <p className="max-w-[75ch]">
                Kyro is a pre-transaction counterparty decision layer powered by wallet intelligence and reputation
                evidence. The decision endpoints are the product surface. Wallet intelligence and the reputation graph
                are the evidence layer underneath them.
              </p>
              <p className="max-w-[75ch]">
                Kyro is not AML or sanctions screening and it does not provide legal, regulatory or compliance
                determinations. Verdicts, scores and receipts are advisory signals for your own decision process. When
                evidence is missing, Kyro reports a conservative baseline and tells you what was missing instead of
                guessing.
              </p>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[540px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${thCls} w-[230px]`}>Property</th>
                    <th className={`${thCls} pr-0`}>Behavior</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["One envelope", "{ ok, version, data } on success, { ok, version, error } on failure. On every endpoint."],
                    ["Anonymous by default", "Every endpoint works without a key. A key raises the rate budget."],
                    ["Conservative on missing evidence", "Unknown wallets get a baseline verdict. Batch rows report no_score instead of a guessed verdict."]
                  ].map(([title, body]) => (
                    <tr key={title}>
                      <td className={`${tdCls} text-sm font-extrabold text-ink`}>{title}</td>
                      <td className={`${tdCls} pr-0 text-sm leading-6`}>{body}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 max-w-[75ch] text-sm leading-6">
              Everything on this page is a summary. The canonical reference for authentication, rate limits, response
              schemas, reason codes and integration patterns lives at{" "}
              <a href={DOCS_BASE} target="_blank" rel="noopener noreferrer" className={docsLinkCls}>docs.thekyro.co</a>.
            </p>
          </DocSection>

          <DocSection id="verdicts" num="02" label="Decisions" title="Three possible verdicts" tag={DECISION_MODEL_VERSION}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[2px] border border-linec border-l-2 border-l-verified bg-bone p-4">
                <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-verified">allow</p>
                <p className="mt-2 text-sm leading-6">No caution or block reasons remain.</p>
              </div>
              <div className="rounded-[2px] border border-linec border-l-2 border-l-gold bg-bone p-4">
                <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-gold">caution</p>
                <p className="mt-2 text-sm leading-6">Soft risk or missing evidence. Proceed with limits or review.</p>
              </div>
              <div className="rounded-[2px] border border-linec border-l-2 border-l-risk bg-bone p-4">
                <p className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.14em] text-risk">block</p>
                <p className="mt-2 text-sm leading-6">Reserved for strong negative evidence: suspicious trust graph, high trust anomaly or high risk penalty.</p>
              </div>
            </div>
            <p className="mt-3 max-w-[75ch] text-sm leading-6">
              Missing evidence alone never produces a block. Verdict thresholds are tuned per use case: payment,
              marketplace, escrow and lending. The full model behavior is documented in the{" "}
              <a href={`${DOCS_BASE}/decision-api`} target="_blank" rel="noopener noreferrer" className={docsLinkCls}>Decision API guide</a>.
            </p>
          </DocSection>

          <DocSection id="quickstart" num="03" label="Quickstart" title="First call in one minute">
            <p className="max-w-[75ch]">
              No SDK and no API key needed. Call the decision endpoint with any wallet address:
            </p>
            <CodeBlock title="Decision" tag="curl" code={quickstartCurl} />
            <p className="mt-4 max-w-[75ch] text-sm leading-6">
              The response is a JSON envelope with the verdict, a recommended USDC limit, reason codes and the evidence
              behind them. The step-by-step walkthrough, including unknown wallets and batch screening, is the{" "}
              <a href={`${DOCS_BASE}/quickstart`} target="_blank" rel="noopener noreferrer" className={docsLinkCls}>quickstart guide</a>.
            </p>
          </DocSection>

          <DocSection id="endpoints" num="04" label="Reference" title="The 8 core endpoints" tag="v1 · frozen contract">
            <p className="max-w-[75ch]">
              All paths are relative to <span className="font-mono text-[0.85rem] font-bold text-ink">https://www.thekyro.co</span>.
              Every endpoint answers the same versioned JSON envelope and works anonymously.
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[680px] border-collapse">
                <thead>
                  <tr>
                    <th className={`${thCls} w-[70px]`}>Method</th>
                    <th className={`${thCls} w-[260px]`}>Path</th>
                    <th className={`${thCls} pr-0`}>Purpose</th>
                    <th className={`${thCls} w-[90px] pr-0`}>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {coreEndpoints.map((ep) => (
                    <tr key={ep.path}>
                      <td className={tdCls}><MethodBadge method={ep.method} /></td>
                      <td className={`${tdCls} break-all font-mono text-[0.8rem] font-bold text-ink`}>{ep.path}</td>
                      <td className={`${tdCls} pr-4 text-sm leading-6`}>{ep.purpose}</td>
                      <td className={`${tdCls} pr-0 text-sm`}>
                        <a href={ep.docs} target="_blank" rel="noopener noreferrer" className={docsLinkCls}>
                          Docs <span aria-hidden="true">↗</span>
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-5 max-w-[75ch] text-sm leading-6">
              Field-level request and response schemas for every endpoint are generated from the OpenAPI contract in the{" "}
              <a href={`${DOCS_BASE}/api-reference`} target="_blank" rel="noopener noreferrer" className={docsLinkCls}>API reference</a>, so
              they cannot drift from live behavior.
            </p>
          </DocSection>

          <div className="flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-ink pt-4">
            <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-quiet">End of document · Decision API · v1</p>
            <a href="/kyro-openapi.yaml" className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-quiet underline decoration-linec underline-offset-4 transition hover:text-ink">
              kyro-openapi.yaml
            </a>
          </div>
        </article>

        <div className="mt-14">
          <DevelopersPageClient />
        </div>
      </div>
    </ArcShell>
  );
}
