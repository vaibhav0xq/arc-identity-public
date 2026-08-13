/* Public surface of the Kyro score contract.

   The scoring math runs in the hosted service. This module publishes the
   model identifiers, the component structure and the per-component caps
   that the app surface renders. */

export const ARC_SCORE_MODEL_VERSION = "identity_score_v1";

// Older rows and cached snapshots may still carry a legacy model label. The
// math is identical, so those labels stay readable and never invalidate a
// stored score on their own.
export const LEGACY_SCORE_MODEL_VERSIONS: readonly string[] = ["arc_score_v2_2026_07"];

export function isCurrentScoreModel(version: unknown) {
  const value = String(version ?? "");
  return value === ARC_SCORE_MODEL_VERSION || LEGACY_SCORE_MODEL_VERSIONS.includes(value);
}

export type ScoreComponentKey =
  | "walletAge"
  | "crossChain"
  | "transactionActivity"
  | "diversity"
  | "arcActivity"
  | "attestations"
  | "propagatedTrust";

export type ScoreComponent = {
  points: number;
  max: number;
  reason: string;
  sourceValue: number | string;
};

export type ScoreComponents = Record<ScoreComponentKey, ScoreComponent>;

export const ARC_SCORE_COMPONENT_MAX = {
  walletAge: 20,
  crossChain: 5,
  transactionActivity: 15,
  diversity: 15,
  arcActivity: 25,
  attestations: 15,
  propagatedTrust: 5
} as const satisfies Record<ScoreComponentKey, number>;
