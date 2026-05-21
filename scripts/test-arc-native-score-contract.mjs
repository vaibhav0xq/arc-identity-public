import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const sourceUrl = new URL("../lib/score-contract.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true
  }
}).outputText;

const module = { exports: {} };
vm.runInNewContext(transpiled, {
  module,
  exports: module.exports,
  require: () => ({}),
  console
}, { filename: "score-contract.js" });

const { buildScoreContract, ARC_SCORE_COMPONENT_MAX } = module.exports;
const failures = [];

function expect(condition, message, details = {}) {
  if (!condition) failures.push({ message, details });
}

function score(input) {
  return buildScoreContract({
    walletAgeDays: 0,
    activeChains: 0,
    indexedTx: 0,
    uniqueCounterparties: 0,
    arcTx: 0,
    arcCounterparties: 0,
    arcActiveDays: 0,
    verifiedAttestations: 0,
    verifiedAttestationCounterparties: 0,
    propagatedTrustScore: 0,
    anomalyScore: 0,
    repeatedPairRatio: 0,
    providerLimited: false,
    ...input
  });
}

const genericWhale = score({
  walletAgeDays: 900,
  activeChains: 6,
  indexedTx: 5000,
  uniqueCounterparties: 200
});

const arcNativeTrusted = score({
  walletAgeDays: 90,
  activeChains: 1,
  indexedTx: 20,
  uniqueCounterparties: 4,
  arcTx: 36,
  arcCounterparties: 6,
  arcActiveDays: 35,
  verifiedAttestations: 5,
  verifiedAttestationCounterparties: 4,
  propagatedTrustScore: 24
});

const oldWalletOnly = score({
  walletAgeDays: 1200
});

const chainExplorerContext = score({
  walletAgeDays: 420,
  activeChains: 4,
  indexedTx: 116,
  uniqueCounterparties: 42,
  providerLimited: false
});

expect(ARC_SCORE_COMPONENT_MAX.arcActivity === 35, "Arc activity should be a primary score component", ARC_SCORE_COMPONENT_MAX);
expect(ARC_SCORE_COMPONENT_MAX.attestations === 30, "Verified attestations should be a primary score component", ARC_SCORE_COMPONENT_MAX);
expect(ARC_SCORE_COMPONENT_MAX.crossChain + ARC_SCORE_COMPONENT_MAX.transactionActivity <= 10, "Generic chain activity should be secondary", ARC_SCORE_COMPONENT_MAX);
expect(ARC_SCORE_COMPONENT_MAX.walletAge <= 10, "Global wallet age should support confidence without dominating", ARC_SCORE_COMPONENT_MAX);

expect(genericWhale.score < 56, "Generic non-Arc transaction volume alone must not produce a high ARC Score", genericWhale);
expect(arcNativeTrusted.score >= 75, "Arc activity plus verified attestations and trusted counterparties should produce a high ARC Score", arcNativeTrusted);
expect(oldWalletOnly.score <= ARC_SCORE_COMPONENT_MAX.walletAge, "Global wallet age alone cannot dominate score", oldWalletOnly);
expect(chainExplorerContext.components.crossChain.points > 0 && chainExplorerContext.components.transactionActivity.points > 0, "Chain explorer/global intelligence should still contribute context", chainExplorerContext);
expect(chainExplorerContext.score < 56, "Global intelligence context alone should not create a high ARC Score", chainExplorerContext);

if (failures.length) {
  console.error(JSON.stringify({
    ok: false,
    failures,
    scenarios: { genericWhale, arcNativeTrusted, oldWalletOnly, chainExplorerContext }
  }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    weights: ARC_SCORE_COMPONENT_MAX,
    scenarios: {
      genericWhale,
      arcNativeTrusted,
      oldWalletOnly,
      chainExplorerContext
    }
  }, null, 2));
}
