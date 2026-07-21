import assert from "node:assert/strict";
import {
  ARC_SCORE_COMPONENT_MAX,
  ARC_SCORE_MODEL_VERSION,
  buildScoreContract
} from "../lib/score-contract.ts";

const zero = {
  walletAgeDays: 0,
  activeChains: 0,
  indexedTx: 0,
  uniqueCounterparties: 0,
  arcTx: 0,
  arcWalletAgeDays: 0,
  arcBalance: 0,
  arcCounterparties: 0,
  arcActiveDays: 0,
  verifiedAttestations: 0,
  verifiedAttestationCounterparties: 0,
  attestationWeight: 0,
  propagatedTrustScore: 0,
  anomalyScore: 0,
  repeatedPairRatio: 0,
  providerLimited: false
};

function score(overrides = {}) {
  return buildScoreContract({ ...zero, ...overrides });
}

function componentTotal(result) {
  return Object.values(result.components).reduce((sum, component) => sum + component.points, 0);
}

function assertIntegrity(result) {
  assert.equal(
    result.score,
    Math.max(0, Math.min(100, Math.round(componentTotal(result) - result.riskPenalty))),
    "score must equal component points minus the disclosed risk penalty"
  );
  assert.ok(result.score >= 0 && result.score <= 100);
  for (const [key, component] of Object.entries(result.components)) {
    assert.ok(component.points >= 0, `${key} must not be negative`);
    assert.ok(component.points <= component.max, `${key} exceeded its cap`);
  }
}

assert.equal(ARC_SCORE_MODEL_VERSION, "arc_score_v2_2026_07");
assert.equal(score().score, 0, "a wallet with no verified evidence must score zero");
assert.equal(score({ providerLimited: true }).score, 0, "provider unavailability must not create points or penalties");
assert.equal(score({ arcWalletAgeDays: 365, arcBalance: 100, arcCounterparties: 20, arcActiveDays: 30 }).components.arcActivity.points, 0, "Arc activity requires a verified Arc transaction");

const full = score({
  walletAgeDays: 730,
  activeChains: 12,
  indexedTx: 1000,
  uniqueCounterparties: 100,
  arcTx: 500,
  arcWalletAgeDays: 400,
  arcBalance: 250,
  arcCounterparties: 50,
  arcActiveDays: 100,
  verifiedAttestations: 20,
  verifiedAttestationCounterparties: 20,
  attestationWeight: 100,
  propagatedTrustScore: 100
});
assertIntegrity(full);
assert.equal(full.components.walletAge.points, ARC_SCORE_COMPONENT_MAX.walletAge);
assert.equal(full.components.crossChain.points, ARC_SCORE_COMPONENT_MAX.crossChain);
assert.equal(full.components.transactionActivity.points, ARC_SCORE_COMPONENT_MAX.transactionActivity);
assert.equal(full.components.diversity.points, ARC_SCORE_COMPONENT_MAX.diversity);
assert.equal(full.components.arcActivity.points, ARC_SCORE_COMPONENT_MAX.arcActivity);
assert.equal(full.components.attestations.points, ARC_SCORE_COMPONENT_MAX.attestations);
assert.equal(full.components.propagatedTrust.points, ARC_SCORE_COMPONENT_MAX.propagatedTrust);

const monotonicCases = [
  ["wallet age", { walletAgeDays: 30 }, { walletAgeDays: 365 }],
  ["chain coverage", { activeChains: 1 }, { activeChains: 5 }],
  ["transaction activity", { indexedTx: 4 }, { indexedTx: 100 }],
  ["counterparty diversity", { uniqueCounterparties: 2 }, { uniqueCounterparties: 30 }],
  ["Arc activity", { arcTx: 2, arcCounterparties: 1, arcActiveDays: 1 }, { arcTx: 50, arcCounterparties: 10, arcActiveDays: 15, arcWalletAgeDays: 60, arcBalance: 1 }],
  ["verified attestations", { verifiedAttestations: 1, verifiedAttestationCounterparties: 1 }, { verifiedAttestations: 8, verifiedAttestationCounterparties: 4, attestationWeight: 10 }],
  ["propagated trust", { propagatedTrustScore: 3 }, { propagatedTrustScore: 30 }]
];

for (const [label, lower, higher] of monotonicCases) {
  const lowResult = score(lower);
  const highResult = score(higher);
  assert.ok(highResult.score >= lowResult.score, `${label} must be monotonic`);
  assertIntegrity(lowResult);
  assertIntegrity(highResult);
}

const normalRelationship = score({ indexedTx: 10, repeatedPairRatio: 0.7 });
const concentratedRelationship = score({ indexedTx: 10, repeatedPairRatio: 0.71 });
assert.equal(normalRelationship.riskPenalty, 0);
assert.ok(concentratedRelationship.riskPenalty > 0);

const anomaly = score({ indexedTx: 10, anomalyScore: 60 });
assert.ok(anomaly.riskPenalty > 0);
assertIntegrity(anomaly);

const deterministicInput = {
  walletAgeDays: 457,
  activeChains: 4,
  indexedTx: 19,
  uniqueCounterparties: 12,
  arcTx: 8,
  arcWalletAgeDays: 70,
  arcBalance: 2.5,
  arcCounterparties: 5,
  arcActiveDays: 6,
  verifiedAttestations: 2,
  verifiedAttestationCounterparties: 2,
  attestationWeight: 7,
  propagatedTrustScore: 9,
  anomalyScore: 0,
  repeatedPairRatio: 0.5,
  providerLimited: true
};
const expected = score(deterministicInput);
for (let index = 0; index < 100; index += 1) {
  assert.deepEqual(score(deterministicInput), expected, "identical evidence must always produce the same score");
}

console.log("ARC Score V2 contract tests passed.");
