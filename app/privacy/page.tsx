import type { Metadata } from "next";
import Link from "next/link";
import { ARC_SUPPORT_EMAIL } from "@/lib/links";

export const metadata: Metadata = {
  title: "Privacy policy · Kyro",
  description: "How Kyro collects, uses and protects data."
};

const serif = { fontFamily: "var(--font-newsreader), serif" };

const glance = [
  "Public chain data powers the product",
  "No private keys or seed phrases, ever",
  "No third-party ad trackers",
  "Claimed data removed on request"
];

const sections = [
  {
    title: "What we collect",
    body: [
      "Kyro works with information that is already public on supported blockchains. This includes wallet addresses, transaction history, counterparty relationships and on-chain attestations.",
      "When you claim a profile we also store your chosen username, the wallet signature used to verify ownership and the score data computed for your wallet.",
      "We do not collect private keys, seed phrases, passwords or custody of any funds. We never ask for them and no legitimate Kyro surface will."
    ]
  },
  {
    title: "How we use it",
    body: [
      "Indexed activity is used to compute your Identity Score, build your trust graph and display your public credential. Scores are derived from evidence, not sold or shared as marketing data.",
      "Support emails are used only to respond to your request. We do not sell personal information to third parties."
    ]
  },
  {
    title: "Where it lives",
    body: [
      "Claimed profiles, scores and attestation records are stored in a managed database. Public credential pages display information that is either derived from public chain data or that you chose to publish by claiming a username."
    ]
  },
  {
    title: "Third parties",
    body: [
      "We read from blockchain RPC providers, block explorers and indexing services to compute scores. Requests to those providers may include wallet addresses, which are already public on-chain. Their handling of data is governed by their own policies."
    ]
  },
  {
    title: "Cookies and local storage",
    body: [
      "We use browser storage to keep your session and cached score data so the app loads quickly. We do not run third-party advertising trackers."
    ]
  },
  {
    title: "Your choices",
    body: [
      "On-chain data is public by nature and remains visible on the blockchain regardless of Kyro. If you want your claimed username or cached profile data removed from our systems, contact us and we will process the request."
    ]
  },
  {
    title: "Changes",
    body: [
      "We may update this policy as the product evolves. Material changes will be reflected on this page with a new effective date."
    ]
  }
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen w-full md:grid md:grid-cols-[minmax(300px,380px)_1fr]">
      <aside className="bg-[#252827] px-6 py-10 text-[#e9e5db] md:sticky md:top-0 md:flex md:h-screen md:flex-col md:px-10 md:py-12">
        <Link href="/" className="font-mono text-[0.66rem] uppercase tracking-[0.18em] text-[#e9e5db]/70 hover:text-[#e9e5db]">
          ← Kyro
        </Link>
        <div className="mt-12 md:mt-16">
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[color:var(--gold)]">Legal / Privacy</p>
          <h1 className="mt-4 text-5xl leading-none text-[#e9e5db] md:text-6xl" style={serif}>Privacy<br />policy</h1>
          <p className="mt-6 max-w-[300px] text-[0.84rem] leading-relaxed text-[#e9e5db]/60">
            Most of what powers Kyro is data that is already public on-chain. This page covers what we hold beyond that and the choices you have.
          </p>
        </div>
        <div className="mt-10 border-t border-[#e9e5db]/15 pt-6 md:mt-auto">
          <p className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.18em] text-[#e9e5db]/50">At a glance</p>
          <ul className="mt-4 space-y-3">
            {glance.map((g) => (
              <li key={g} className="flex items-start gap-3 text-[0.8rem] leading-snug text-[#e9e5db]/85">
                <span className="mt-[0.4em] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--gold)]" />
                {g}
              </li>
            ))}
          </ul>
          <p className="mt-6 font-mono text-[0.64rem] uppercase tracking-[0.16em] text-[#e9e5db]/50">Effective Aug 6, 2026</p>
        </div>
      </aside>

      <div className="px-6 pb-24 pt-10 md:px-14 md:pt-14">
        {sections.map((s, i) => (
          <section
            key={s.title}
            className={`grid gap-3 py-9 md:grid-cols-[72px_1fr] md:gap-8 ${i === 0 ? "pt-2" : "border-t border-[color:var(--line,#d6d1c4)]"}`}
          >
            <p className="pt-1 font-mono text-[0.7rem] font-bold text-[color:var(--gold)]">{String(i + 1).padStart(2, "0")}</p>
            <div>
              <h2 className="text-[1.4rem] text-[color:var(--ink)]" style={serif}>{s.title}</h2>
              <div className="mt-3 max-w-[660px]">
                {s.body.map((p) => (
                  <p key={p.slice(0, 32)} className="mb-3 text-[0.86rem] leading-relaxed text-slate-600 last:mb-0">{p}</p>
                ))}
              </div>
            </div>
          </section>
        ))}

        <section className="grid gap-3 border-t border-[color:var(--line,#d6d1c4)] py-9 md:grid-cols-[72px_1fr] md:gap-8">
          <p className="pt-1 font-mono text-[0.7rem] font-bold text-[color:var(--gold)]">{String(sections.length + 1).padStart(2, "0")}</p>
          <div>
            <h2 className="text-[1.4rem] text-[color:var(--ink)]" style={serif}>Contact</h2>
            <p className="mt-3 max-w-[660px] text-[0.86rem] leading-relaxed text-slate-600">
              Questions or removal requests:{" "}
              <a className="font-semibold text-[color:var(--ink)] underline decoration-[color:var(--gold)] underline-offset-4" href={`mailto:${ARC_SUPPORT_EMAIL}`}>{ARC_SUPPORT_EMAIL}</a>
            </p>
          </div>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t-2 border-[color:var(--ink)] pt-5">
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.18em] text-slate-500">Kyro · Independent project · Not affiliated with Circle</p>
          <Link href="/terms" className="landing-text-link">Terms of use <span>→</span></Link>
        </div>
      </div>
    </main>
  );
}
