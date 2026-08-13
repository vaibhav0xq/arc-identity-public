import type { Metadata } from "next";
import Link from "next/link";
import { ARC_SUPPORT_EMAIL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Terms of use · Kyro",
  description: "The terms that govern use of Kyro."
};

const serif = { fontFamily: "var(--font-newsreader), serif" };

const clauses = [
  {
    title: "What Kyro is",
    body: [
      "Kyro is a wallet intelligence service. It indexes public blockchain activity, verifies transactions and presents an Identity Score, trust graph and attestation history for wallets on supported networks.",
      "Kyro is informational. It is not financial advice, not a credit bureau, not a payment service and it never takes custody of funds. Decisions you make based on a score or credential are your own."
    ]
  },
  {
    title: "Your wallet, your responsibility",
    body: [
      "You connect with your own wallet and prove ownership by signature. You are responsible for keeping your keys secure. We will never ask for private keys or seed phrases.",
      "Claiming a username publishes a public credential page for your wallet. Only claim a wallet you control."
    ]
  },
  {
    title: "Acceptable use",
    body: [
      "Only submit attestations for legitimate economic interactions. Circular trust farming, fake activity, sybil networks or abusive verification behavior may reduce trust confidence, trigger anomaly detection and result in removal of records or access.",
      "Do not use the service to harass, impersonate or defraud others or to scrape and resell credential data at scale."
    ]
  },
  {
    title: "Scores and accuracy",
    body: [
      "Identity Scores are computed from available evidence and are estimates, not guarantees. Coverage varies by network and provider. Where data is limited the product marks it as such, but we do not warrant that any score, attestation or graph is complete, current or error free."
    ]
  },
  {
    title: "Third-party networks",
    body: [
      "The service reads from public blockchains and third-party infrastructure we do not control. Kyro is an independent project built on the Arc network and is not affiliated with, endorsed by or sponsored by Circle or any network operator."
    ]
  },
  {
    title: "Limitation of liability",
    body: [
      "The service is provided as is, without warranties of any kind. To the maximum extent permitted by law, Kyro and its contributors are not liable for losses arising from use of the service, including losses tied to decisions made in reliance on scores or credentials."
    ]
  },
  {
    title: "Changes and termination",
    body: [
      "We may update these terms or change the service as it evolves. Continued use after a change means you accept the updated terms. We may suspend records or access that violate the acceptable use rules above."
    ]
  }
];

export default function TermsPage() {
  return (
    <main className="page-enter min-h-screen w-full pb-24">
      <div className="flex items-center justify-between border-b border-[color:var(--line,#d6d1c4)] px-6 py-5 md:px-14">
        <Link href="/" className="landing-text-link">Kyro <span>→</span></Link>
        <p className="hidden font-mono text-[0.62rem] uppercase tracking-[0.18em] text-slate-500 md:block">Instrument · Terms of use</p>
      </div>

      <header className="border-b-2 border-[color:var(--ink)] px-6 pb-12 pt-14 md:px-14">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <div>
            <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[color:var(--gold)]">Legal / Terms</p>
            <h1 className="mt-3 text-6xl text-[color:var(--ink)] md:text-7xl" style={serif}>Terms of use</h1>
          </div>
          <div className="max-w-[420px]">
            <p className="text-[0.88rem] leading-relaxed text-slate-600">
              By using Kyro you agree to these terms. If you do not agree, do not use the service.
            </p>
            <div className="mt-5 flex items-center gap-6 border-t border-[color:var(--line,#d6d1c4)] pt-4">
              <p className="font-mono text-[0.64rem] uppercase tracking-[0.16em] text-slate-500">Effective Aug 6, 2026</p>
              <p className="font-mono text-[0.64rem] uppercase tracking-[0.16em] text-slate-500">{clauses.length} clauses</p>
            </div>
          </div>
        </div>
      </header>

      <div className="px-6 md:px-14">
        {clauses.map((c, i) => (
          <section
            key={c.title}
            id={`clause-${i + 1}`}
            className="grid gap-4 border-b border-[color:var(--line,#d6d1c4)] py-10 md:grid-cols-[110px_minmax(240px,380px)_1fr] md:gap-10"
          >
            <p className="text-4xl text-[color:var(--gold)] md:text-5xl" style={serif}>
              {String(i + 1).padStart(2, "0")}
            </p>
            <h2 className="text-[1.45rem] leading-tight text-[color:var(--ink)]" style={serif}>{c.title}</h2>
            <div className="max-w-[640px]">
              {c.body.map((p) => (
                <p key={p.slice(0, 32)} className="mb-3 text-[0.86rem] leading-relaxed text-slate-600 last:mb-0">{p}</p>
              ))}
            </div>
          </section>
        ))}

        <section className="grid gap-4 py-10 md:grid-cols-[110px_minmax(240px,380px)_1fr] md:gap-10">
          <p className="text-4xl text-[color:var(--gold)] md:text-5xl" style={serif}>{String(clauses.length + 1).padStart(2, "0")}</p>
          <h2 className="text-[1.45rem] leading-tight text-[color:var(--ink)]" style={serif}>Contact</h2>
          <p className="max-w-[640px] text-[0.86rem] leading-relaxed text-slate-600">
            Questions about these terms:{" "}
            <a className="font-semibold text-[color:var(--ink)] underline decoration-[color:var(--gold)] underline-offset-4" href={`mailto:${ARC_SUPPORT_EMAIL}`}>{ARC_SUPPORT_EMAIL}</a>
          </p>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[color:var(--ink)] pt-5">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Kyro · Independent project · Not affiliated with Circle</p>
          <Link href="/privacy" className="landing-text-link">Privacy policy <span>→</span></Link>
        </div>
      </div>
    </main>
  );
}
