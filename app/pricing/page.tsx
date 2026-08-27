import type { Metadata } from "next";
import Link from "next/link";
import { ArcShell } from "@/components/ArcShell";
import { ARC_SUPPORT_EMAIL } from "@/lib/links";
import {
  ANONYMOUS_LIMITS,
  DEVELOPER_LIMITS,
  PARTNER_DEFAULT_LIMITS,
  PLUS_LIMITS,
  PRO_LIMITS,
  type PlanLimits
} from "@/lib/portal-plans";

/* Public, display-only pricing page. It explains the plan ladder to visitors
   who have no portal account. Nothing here mutates anything: no checkout, no
   billing provider and no enforcement changes. All numbers are imported from
   lib/portal-plans.ts, which reads the enforcement source of truth, so the
   page cannot drift from what the API actually meters. The signed-in surface
   with applications and API keys stays at /business/plans on the portal host. */

export const metadata: Metadata = {
  title: "Kyro Plans and Pricing",
  description:
    "Kyro API plans: Free, Developer, Plus, Pro and Partner. Plus and Pro are available on request; activation is managed by the Kyro team."
};

const nf = (n: number) => n.toLocaleString("en-US");

const LIMITS: PlanLimits[] = [
  ANONYMOUS_LIMITS,
  DEVELOPER_LIMITS,
  PLUS_LIMITS,
  PRO_LIMITS,
  PARTNER_DEFAULT_LIMITS
];

/* Availability wording matches the portal comparison table, with one
   public-context change: Free reads "Everyone" because anonymous calls
   need no account at all. */
const PLAN_HEADS: { name: string; availability: string }[] = [
  { name: "Free", availability: "Everyone" },
  { name: "Developer", availability: "By review" },
  { name: "Plus", availability: "$49 monthly" },
  { name: "Pro", availability: "$149 monthly" },
  { name: "Partner", availability: "By contract" }
];

const TABLE_ROWS: { label: string; hint: string | null; cells: string[]; mono: boolean }[] = [
  {
    label: "Rate budget",
    hint: "units per minute",
    cells: LIMITS.map((l) => nf(l.unitsPerMinute)),
    mono: true
  },
  {
    label: "Batch decisions",
    hint: "wallets per call",
    cells: LIMITS.map((l) => nf(l.batchMaxRows)),
    mono: true
  },
  {
    label: "New wallet scans",
    hint: "starts per day",
    cells: LIMITS.map((l) => nf(l.intakeStartsPerDay)),
    mono: true
  },
  {
    label: "API keys",
    hint: "active per organization",
    cells: ["None", "Up to 2", "Up to 5", "Up to 8", "12 default"],
    mono: false
  },
  {
    label: "Activation",
    hint: null,
    cells: ["Automatic", "By review", "Admin grant", "Admin grant", "By contract"],
    mono: false
  }
];

const thCls =
  "border-b-2 border-ink pb-2.5 pr-4 text-left align-bottom";
const tdCls = "border-b border-linec py-3.5 pr-4 align-top";

const CTA_PRIMARY =
  "inline-flex items-center justify-center gap-2 border-2 border-ink bg-ink px-4 py-2.5 text-sm font-bold text-bone transition hover:bg-[#3a3e3a]";
const CTA_SECONDARY =
  "inline-flex items-center justify-center gap-2 border border-linec bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:border-ink";
const CTA_ON_DARK =
  "inline-flex items-center justify-center gap-2 border-2 border-bone bg-bone px-4 py-2.5 text-sm font-bold text-ink transition hover:bg-transparent hover:text-bone";

/* Structured mailto links so requests arrive labeled and complete.
   No form, no new route and no storage behind this. */
const ACCESS_BODY = [
  "Plan:",
  "Name:",
  "Work email:",
  "Company/project:",
  "Website:",
  "Expected monthly wallet checks:",
  "Use case:",
  "Wallet/account, if any:",
  "Message:"
].join("\n");

const accessMailto = (subject: string) =>
  `mailto:${ARC_SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(ACCESS_BODY)}`;

function PlanCard({
  name,
  chip,
  price,
  priceNote,
  description,
  cta,
  dark = false
}: {
  name: string;
  chip: string;
  price: string;
  priceNote: string;
  description: string;
  cta: React.ReactNode;
  dark?: boolean;
}) {
  return (
    <section
      className={
        dark
          ? "flex h-full flex-col rounded-[2px] bg-graphite p-5 text-bone shadow-[0_2px_4px_rgba(37,40,39,0.15),0_24px_48px_-24px_rgba(37,40,39,0.55)]"
          : "flex h-full flex-col rounded-[2px] border border-linec bg-bone p-5"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className={`font-heading text-[1.05rem] font-semibold ${dark ? "text-bone" : "text-ink"}`}>{name}</h3>
        <span className="chip">
          <span className="dot" />
          {chip}
        </span>
      </div>
      <p className={`mt-4 font-heading text-2xl font-semibold tracking-tight ${dark ? "text-bone" : "text-ink"}`}>
        {price}
      </p>
      <p className={`mt-1 font-mono text-[0.6rem] uppercase tracking-[0.14em] ${dark ? "text-bone/60" : "text-quiet"}`}>
        {priceNote}
      </p>
      <p className={`mt-4 text-sm leading-6 ${dark ? "text-bone/75" : "text-mutedc"}`}>{description}</p>
      <div className="mt-auto pt-5">{cta}</div>
    </section>
  );
}

export default function PricingPage() {
  return (
    <ArcShell>
      <div className="fade-in w-full py-10 lg:py-14">
        <header className="border-b-2 border-ink pb-10">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-linec pb-4">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.2em] text-mutedc">
              Kyro API · Reference No. KY-PLAN-01
            </p>
            <span className="chip amber">
              <span className="dot" />
              Testnet beta
            </span>
          </div>
          <h1 className="mt-8 max-w-4xl font-heading text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
            Plans and pricing
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-mutedc">
            Five plans, from public wallet checks to contract partnerships.
          </p>
          <p className="mt-6 max-w-3xl border-l-2 border-gold bg-bone px-4 py-3 text-sm leading-6 text-ink">
            Plus and Pro are available on request. Contact the Kyro team to activate a paid
            plan for your organization. Partner access is arranged by contract.
          </p>
        </header>

        <div className="mt-12 grid max-w-6xl gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PlanCard
            name="Free"
            chip="Everyone"
            price="$0"
            priceNote="No account needed"
            description="Public wallet checks for anyone. Call the API or run a counterparty check without an account or a key."
            cta={
              <Link href="/check" className={`${CTA_SECONDARY} w-full`}>
                Run a counterparty check
              </Link>
            }
          />
          <PlanCard
            name="Developer"
            chip="By review"
            price="$0"
            priceNote="Free during testnet"
            description="For builders testing the API. Access is granted by application and manual review. It covers every API key your wallet creates."
            cta={
              <a href={`mailto:${ARC_SUPPORT_EMAIL}`} className={`${CTA_ON_DARK} w-full`}>
                Request access
              </a>
            }
            dark
          />
          <PlanCard
            name="Plus"
            chip="By request"
            price="$49"
            priceNote="USD / month"
            description="The first paid tier, built for independent builders and small teams shipping on Arc. Activated by the Kyro team on request."
            cta={
              <a href={accessMailto("[Plan request] Plus")} className={`${CTA_SECONDARY} w-full`}>
                Request Plus access
              </a>
            }
          />
          <PlanCard
            name="Pro"
            chip="By request"
            price="$149"
            priceNote="USD / month"
            description="For production teams that need more headroom and priority support. Activated by the Kyro team on request."
            cta={
              <a href={accessMailto("[Plan request] Pro")} className={`${CTA_SECONDARY} w-full`}>
                Request Pro access
              </a>
            }
          />
        </div>

        <section className="mt-6 flex max-w-6xl flex-col gap-5 rounded-[2px] border border-linec bg-bone px-6 py-6 md:flex-row md:items-center md:justify-between md:gap-8">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h2 className="font-heading text-[1.05rem] font-semibold text-ink">Need more?</h2>
              <span className="chip">
                <span className="dot" />
                Design partners
              </span>
            </div>
            <p className="mt-2 text-sm leading-6 text-mutedc">
              Become our partner today and get custom rate limits, batch sizes and support built
              around your integration. A limited number of design partner slots are open during
              testnet for exchanges, OTC desks and payment applications building on Arc.
            </p>
          </div>
          <a href={accessMailto("[Access request] Partner")} className={`${CTA_PRIMARY} shrink-0 md:w-auto`}>
            Contact us about Partner
          </a>
        </section>

        <section className="mt-14 max-w-6xl">
          <p className="arc-section-label">
            <span className="font-bold text-gold">01</span>
            <span className="px-2 text-linec-dark">/</span>
            Limits
          </p>
          <h2 className="mt-3 font-heading text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Compare the plans
          </h2>
          <p className="mt-5 max-w-3xl text-[0.95rem] leading-7 text-mutedc">
            Every plan covers the full API: decisions, batch screening, receipts, scores, trust
            graph and profiles. What changes between plans is rate, batch size, daily scans and
            API keys.
          </p>
          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={`${thCls} w-[200px]`}>
                    <span className="sr-only">Limit</span>
                  </th>
                  {PLAN_HEADS.map((plan) => (
                    <th key={plan.name} className={thCls}>
                      <span className="block text-sm font-extrabold text-ink">{plan.name}</span>
                      <span className="mt-1 block font-mono text-[0.6rem] font-medium uppercase tracking-[0.14em] text-quiet">
                        {plan.availability}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((row) => (
                  <tr key={row.label} className="transition-colors hover:bg-bone">
                    <td className={`${tdCls} text-sm font-extrabold text-ink`}>
                      {row.label}
                      {row.hint ? (
                        <span className="mt-0.5 block font-mono text-[0.6rem] font-normal uppercase tracking-[0.14em] text-quiet">
                          {row.hint}
                        </span>
                      ) : null}
                    </td>
                    {row.cells.map((cell, i) => (
                      <td
                        key={`${row.label}-${PLAN_HEADS[i].name}`}
                        className={`${tdCls} text-sm leading-6 ${row.mono ? "font-mono text-[0.85rem] font-bold text-ink" : "text-mutedc"}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-5 max-w-3xl text-xs leading-5 text-quiet">
            Free calls need no key and share one budget per IP address. API keys unlock with a
            granted plan and all keys share the organization&apos;s budget. Partner figures are
            contract defaults and can be customized. Plus and Pro are activated by the Kyro
            team on request. Partner access is arranged by contract.
          </p>
        </section>

        <div className="mt-14 flex flex-wrap items-baseline justify-between gap-3 border-t-2 border-ink pt-4">
          <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-quiet">
            End of document · Plans and pricing
          </p>
          <Link
            href="/developers"
            className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-quiet underline decoration-linec underline-offset-4 transition hover:text-ink"
          >
            Developer API
          </Link>
        </div>
      </div>
    </ArcShell>
  );
}
