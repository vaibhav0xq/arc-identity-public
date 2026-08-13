/* Public contract surface of the Kyro Decision Engine.

   The engine itself (thresholds, limits and evidence rules) runs in the
   hosted service; this module publishes the identifiers the app surface
   needs to talk about decisions. The full request and response contract
   lives in public/kyro-openapi.yaml. */

export const DECISION_MODEL_VERSION = "decision_v0.4.1";

export const USE_CASES = ["payment", "escrow", "lending", "marketplace"] as const;
export type UseCase = (typeof USE_CASES)[number];
export const DEFAULT_USE_CASE: UseCase = "payment";

export type DecisionVerdict = "allow" | "caution" | "block";
