import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function expect(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${message}`);
  }
}

const scorer = read("lib/explainable-reputation.ts");
const scoreRoute = read("app/api/score/[wallet]/route.ts");
const profilePage = read("app/profile/[username]/page.tsx");
const card = read("components/ExplainableReputationCard.tsx");

expect(scorer.includes("walletAge: 20"), "wallet age weight is 20%");
expect(scorer.includes("activity: 25"), "activity quality weight is 25%");
expect(scorer.includes("attestations: 30"), "attestation weight is 30%");
expect(scorer.includes("network: 15"), "network diversity weight is 15%");
expect(scorer.includes("risk: 10"), "risk signal weight is 10%");
expect(/contribution:\s*-contribution\(normalized,\s*SCORE_WEIGHTS\.risk\)/.test(scorer), "risk contribution is negative");
expect(scorer.includes("canonicalScore?: number") && scorer.includes("scoreBasis"), "explainable reputation can anchor to canonical ARC Score");
expect(scorer.includes("canonicalBreakdown?:") && scorer.includes("canonicalBreakdownFromIdentity"), "explainable reputation can decompose the canonical ARC Score");
expect(scorer.includes("alignBreakdownToScore"), "canonical breakdown is aligned to the visible score");
expect(scorer.includes("scoreBasis: typeof input.canonicalScore") && scorer.includes("canonical_arc_score"), "visible reputation score prefers canonical ARC Score");
expect(scorer.includes("normalized: number") && scorer.includes("weighted point contribution") === false, "components expose normalized scores and contributions");
expect(scorer.includes("Active wallet for") && scorer.includes("Arc activity and transaction consistency are strong"), "human-readable insights are generated");
expect(scorer.includes("finalActivity.normalized >= 75") && scorer.includes("Arc activity and transaction consistency are strong"), "insights derive from canonical activity strength");
expect(scorer.includes("finalNetwork.normalized >= 70") && scorer.includes("Counterparty network shows healthy diversity"), "network insight derives from canonical network strength");
expect(scorer.includes("high reputation attester") && scorer.includes("verified transaction-backed attestation"), "attestations expose impact reasons");
expect(scorer.includes("id?: string") && scorer.includes("id: item.id"), "attestation impact rows carry stable ids");

expect(scoreRoute.includes("buildExplainableReputation"), "score API builds explainable reputation");
expect(scoreRoute.includes("reputation_v1: reputation"), "score API exposes a stable reputation_v1 alias");
expect(scoreRoute.includes("reputation,"), "score API exposes reputation payload");
expect(scoreRoute.includes("attestations: { acceptedCount"), "score API preserves legacy attestation summary shape");
expect(scoreRoute.includes("baselineExplainableReputation"), "baseline score API includes explainable reputation payload");
expect(scoreRoute.includes("canonicalScore: canonical.scoreValue"), "score API anchors reputation payload to canonical score value");

expect(profilePage.includes("ExplainableReputationCard"), "public profile renders explainable reputation card");
expect(profilePage.includes("reputationInputFromIdentity(identity, attestations)"), "profile uses visible attestation rows in the v1 score input");
expect(!card.includes("ScoreRing"), "profile explainability card does not render a second score ring");
expect(!card.includes("fetch(`/api/score/"), "profile explainability card does not independently refresh score state");
expect(card.includes("Last updated") && card.includes("seconds ago"), "profile card shows relative last-updated text");
expect(card.includes("key={item.id}"), "attestation impact rows use stable unique keys");
expect(card.includes("Score breakdown") && card.includes("Insights") && card.includes("Attestation impact"), "profile card shows required explanation sections");
expect(card.includes("Key signals behind this wallet&apos;s Kyro reputation."), "profile card uses polished product copy");
expect(card.includes("The main signals shaping this profile."), "profile breakdown copy is concise");
expect(card.includes("shortReason(key)"), "profile card uses short readable row reasons");
expect(!card.includes("canonical score") && !card.includes("Matches ARC Score") && !card.includes("breakdownTotal"), "profile card avoids defensive proof-style wording");
expect(card.includes("mounted ? relativeTime") && card.includes("suppressHydrationWarning"), "relative last-updated text is hydration-safe");
expect(card.includes("attestationRows") && card.includes("item.count > 1"), "attestation impact rows are grouped for a calmer UI");

if (process.exitCode) {
  process.exit(process.exitCode);
}
