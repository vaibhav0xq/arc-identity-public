import type { components } from "./generated/openapi";

/**
 * Stable public aliases over the generated OpenAPI schema types.
 * The generated names stay internal so regeneration never breaks this surface.
 */

/** Known machine-readable error codes. The list can grow additively in v1; treat unknown codes as informational. */
export type KyroErrorCode = components["schemas"]["ErrorEnvelope"]["error"]["code"];

/** What the caller is about to do with the counterparty. Defaults to payment on the server. */
export type KyroUseCase = components["schemas"]["UseCase"];

/** Score read payload. A valid unknown wallet still answers 200 with a conservative baseline; cacheStatus "cached" marks a committed snapshot. */
export type KyroScore = components["schemas"]["ScoreData"];

/** Profile read payload for a Kyro username. */
export type KyroProfile = components["schemas"]["ProfileData"];

/** Trust read payload: the wallet plus its trust graph snapshot. */
export type KyroTrust = components["schemas"]["TrustData"];

/** Trust graph snapshot carried inside the trust read payload. */
export type KyroTrustGraph = components["schemas"]["TrustGraph"];

/** Observed Interaction Graph read payload. */
export type KyroInteractionGraphData = components["schemas"]["InteractionGraphData"];

/** Persisted, score-neutral observed counterparties and coverage metadata. */
export type KyroInteractionGraph = components["schemas"]["InteractionGraph"];

/**
 * Interaction graph refresh outcome, discriminated on status:
 * fresh (snapshot committed within the last 60 minutes; nothing started,
 * nothing charged), started (a new run began for 5 rate units; mode names
 * the daily cap it drew from) or indexing (an earlier run is still in
 * flight, free).
 */
export type KyroInteractionGraphRefreshResult =
  | components["schemas"]["RefreshFresh"]
  | components["schemas"]["RefreshStarted"]
  | components["schemas"]["IntakeIndexing"];

/** Single decision read payload. */
export type KyroDecision = components["schemas"]["DecisionData"];

/** Decision verdict values. */
export type KyroDecisionVerdict = components["schemas"]["DecisionVerdict"];

/** Batch decision payload: use case, model version, summary tally and one row per unique input. */
export type KyroBatchResult = components["schemas"]["BatchData"];

/** One batch row. Discriminate on status; rows include no_score and invalid outcomes. */
export type KyroBatchRow = components["schemas"]["BatchRow"];

/** Verdict tally across all batch rows. */
export type KyroBatchSummary = components["schemas"]["BatchSummary"];

/** An immutable decision receipt. */
export type KyroReceipt = components["schemas"]["DecisionReceipt"];

/** Receipt creation payload: the receipt, its site-relative share URL and whether it was deduped. */
export type KyroReceiptCreateResult = components["schemas"]["ReceiptCreateData"];

/** Receipt read payload. */
export interface KyroReceiptRead {
  receipt: KyroReceipt;
}

/**
 * Intake outcome, discriminated on status:
 * already_indexed (nothing to do), started (a new scan began, 5 rate units spent)
 * or indexing (an earlier scan is still in flight).
 */
export type KyroIntakeResult =
  | components["schemas"]["IntakeAlreadyIndexed"]
  | components["schemas"]["IntakeStarted"]
  | components["schemas"]["IntakeIndexing"];

/** Parsed X-RateLimit-* header values. Advisory; the enforced counter is server-side. */
export interface KyroRateLimitInfo {
  /** Total units allowed in the current 60-second window. */
  limit?: number;
  /** Units remaining in the current window. */
  remaining?: number;
}

/** Event passed to the onRateLimit hook whenever a response carries rate limit headers. */
export interface KyroRateLimitEvent extends KyroRateLimitInfo {
  /** Seconds until retry, when the server sent Retry-After. */
  retryAfterSeconds?: number;
  /** Request path, e.g. /api/v1/decision/0x... */
  path: string;
  /** HTTP status of the response that carried the headers. */
  status: number;
}

/** Per-call options accepted by every resource method. */
export interface KyroRequestOptions {
  /** Cancel the request from the caller side. */
  signal?: AbortSignal;
  /** Override the client-level timeout for this call. */
  timeoutMs?: number;
}

/** Full response returned by the low-level request escape hatch. */
export interface KyroResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  rateLimit: KyroRateLimitInfo | undefined;
}
