import type { KyroErrorCode, KyroRateLimitInfo } from "./types";

/** Base class for every error the SDK throws. */
export class KyroError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The API answered with an error envelope ({ ok: false, error: { code, message } }).
 * message carries the server's human-readable explanation.
 */
export class KyroApiError extends KyroError {
  /** Stable machine-readable code. Unknown codes can appear additively; branch on the ones you handle. */
  readonly code: KyroErrorCode | (string & {});
  /** HTTP status of the response. */
  readonly status: number;
  /** Seconds until retry, when the server sent Retry-After (429 responses). */
  readonly retryAfterSeconds: number | undefined;
  /** Parsed X-RateLimit-* headers, when present. */
  readonly rateLimit: KyroRateLimitInfo | undefined;
  /** The raw parsed error envelope. */
  readonly envelope: unknown;
  /** Response headers. The body is already consumed into envelope. */
  readonly headers: Headers;

  constructor(args: {
    code: string;
    message: string;
    status: number;
    retryAfterSeconds?: number;
    rateLimit?: KyroRateLimitInfo;
    envelope: unknown;
    headers: Headers;
  }) {
    super(args.message);
    this.code = args.code;
    this.status = args.status;
    this.retryAfterSeconds = args.retryAfterSeconds;
    this.rateLimit = args.rateLimit;
    this.envelope = args.envelope;
    this.headers = args.headers;
  }
}

/** Why a request failed before a valid Kyro envelope arrived. */
export type KyroRequestErrorCode = "TIMEOUT" | "NETWORK" | "BAD_RESPONSE";

/**
 * The request failed at the transport layer: it timed out, the network failed
 * or the response was not a valid Kyro envelope.
 */
export class KyroRequestError extends KyroError {
  readonly code: KyroRequestErrorCode;
  /** HTTP status when a response arrived but its body was not a valid envelope. */
  readonly status: number | undefined;

  constructor(
    code: KyroRequestErrorCode,
    message: string,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.code = code;
    this.status = options?.status;
  }
}
