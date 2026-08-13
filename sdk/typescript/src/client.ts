import { KyroApiError, KyroError, KyroRequestError } from "./errors";
import type { KyroRateLimitEvent, KyroRateLimitInfo, KyroResponse } from "./types";
import { ScoreResource } from "./resources/score";
import { ProfileResource } from "./resources/profile";
import { TrustResource } from "./resources/trust";
import { DecisionsResource } from "./resources/decisions";
import { ReceiptsResource } from "./resources/receipts";
import { IntakeResource } from "./resources/intake";

const DEFAULT_BASE_URL = "https://www.thekyro.co";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface KyroConfig {
  /**
   * Optional Kyro API key (kyro_live_...). Raises the rate budget to the key's plan.
   * Server-side only: a key shipped to a browser is handed to every visitor.
   * Omit for anonymous access.
   */
  apiKey?: string;
  /** API origin. Defaults to https://www.thekyro.co */
  baseUrl?: string;
  /** Per-request timeout in milliseconds. Defaults to 30000. */
  timeoutMs?: number;
  /** Custom fetch implementation (tests, polyfills). Defaults to globalThis.fetch. */
  fetch?: typeof globalThis.fetch;
  /** Called whenever a response carries X-RateLimit-* headers. Useful for pacing bulk work. */
  onRateLimit?: (event: KyroRateLimitEvent) => void;
}

/** Options for the low-level request escape hatch. */
export interface KyroRequestInit {
  /** Query parameters. Entries with undefined values are skipped. */
  query?: Record<string, string | undefined>;
  /** JSON body for POST requests. */
  body?: unknown;
  /** Cancel the request from the caller side. */
  signal?: AbortSignal;
  /** Override the client-level timeout for this call. */
  timeoutMs?: number;
}

function normalizeApiKey(apiKey: string | undefined): string | undefined {
  if (apiKey === undefined) return undefined;
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new TypeError("apiKey must be a non-empty string when provided");
  }
  return apiKey.trim();
}

function normalizeBaseUrl(baseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new TypeError(`baseUrl is not a valid URL: ${baseUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TypeError("baseUrl must use http or https");
  }
  return baseUrl.replace(/\/+$/, "");
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * An API key sent over plain http is readable by anyone on the network path.
 * Refuse that combination outright, with a loopback exception so local
 * development against a dev server keeps working.
 */
function assertKeyTransport(apiKey: string | undefined, baseUrl: string): void {
  if (apiKey === undefined) return;
  const parsed = new URL(baseUrl);
  if (parsed.protocol !== "http:") return;
  if (LOOPBACK_HOSTNAMES.has(parsed.hostname)) return;
  throw new TypeError(
    `Refusing to send an API key over plain http (${parsed.hostname}). Use an https baseUrl, or omit apiKey for anonymous access.`,
  );
}

function normalizeTimeoutMs(timeoutMs: number | undefined, fallback: number): number {
  if (timeoutMs === undefined) return fallback;
  if (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("timeoutMs must be a positive finite number");
  }
  return timeoutMs;
}

function readIntHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw === null) return undefined;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : undefined;
}

function readRateLimit(headers: Headers): KyroRateLimitInfo | undefined {
  const limit = readIntHeader(headers, "x-ratelimit-limit");
  const remaining = readIntHeader(headers, "x-ratelimit-remaining");
  if (limit === undefined && remaining === undefined) return undefined;
  const info: KyroRateLimitInfo = {};
  if (limit !== undefined) info.limit = limit;
  if (remaining !== undefined) info.remaining = remaining;
  return info;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("This operation was aborted", "AbortError");
}

/**
 * Reads the JSON body while honoring the request's abort signal. Custom fetch
 * implementations may hand back Response objects whose body streams ignore
 * the signal, so the read is raced against it; the losing body promise gets a
 * no-op handler so it cannot surface as an unhandled rejection.
 */
async function readJsonBody(response: Response, signal: AbortSignal): Promise<unknown> {
  if (signal.aborted) {
    throw abortReason(signal);
  }
  const bodyPromise = response.json();
  bodyPromise.catch(() => {});
  let onAbort: (() => void) | undefined;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => {
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
  try {
    return await Promise.race([bodyPromise, abortPromise]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
}

/**
 * Client for the Kyro counterparty decision API.
 *
 * Every resource method returns the unwrapped data payload and throws
 * KyroApiError on error envelopes or KyroRequestError on transport failures.
 * The SDK never retries on its own; rate units are real spend, so retry
 * policy stays with the caller. KyroApiError.retryAfterSeconds says when.
 */
export class Kyro {
  /** Reputation score reads. */
  readonly score: ScoreResource;
  /** Profile reads by Kyro username. */
  readonly profile: ProfileResource;
  /** Trust graph reads. */
  readonly trust: TrustResource;
  /** Single and batch decision checks. */
  readonly decisions: DecisionsResource;
  /** Decision receipt creation and reads. */
  readonly receipts: ReceiptsResource;
  /** On-demand indexing for wallets Kyro has not seen yet. */
  readonly intake: IntakeResource;

  readonly #apiKey: string | undefined;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof globalThis.fetch;
  readonly #onRateLimit: ((event: KyroRateLimitEvent) => void) | undefined;

  constructor(config: KyroConfig = {}) {
    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new KyroError(
        "No fetch implementation available. Node 18+ and modern browsers provide one; otherwise pass fetch in the Kyro constructor.",
      );
    }
    this.#fetch = (input, init) => fetchImpl(input, init);
    this.#apiKey = normalizeApiKey(config.apiKey);
    this.#baseUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_BASE_URL);
    assertKeyTransport(this.#apiKey, this.#baseUrl);
    this.#timeoutMs = normalizeTimeoutMs(config.timeoutMs, DEFAULT_TIMEOUT_MS);
    this.#onRateLimit = config.onRateLimit;

    this.score = new ScoreResource(this);
    this.profile = new ProfileResource(this);
    this.trust = new TrustResource(this);
    this.decisions = new DecisionsResource(this);
    this.receipts = new ReceiptsResource(this);
    this.intake = new IntakeResource(this);
  }

  /**
   * Low-level escape hatch used by every resource method. Returns the full
   * response (data, status, headers, parsed rate limit info) instead of the
   * unwrapped payload. Path must start with a slash.
   */
  async request<T = unknown>(
    method: "GET" | "POST",
    path: string,
    options: KyroRequestInit = {},
  ): Promise<KyroResponse<T>> {
    if (typeof path !== "string" || !path.startsWith("/")) {
      throw new TypeError("path must be a string starting with /");
    }

    const url = this.#buildUrl(path, options.query);
    const headers: Record<string, string> = { accept: "application/json" };
    if (this.#apiKey !== undefined) {
      headers.authorization = `Bearer ${this.#apiKey}`;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, this.#timeoutMs);
    const callerSignal = options.signal;
    if (callerSignal?.aborted) {
      throw abortReason(callerSignal);
    }

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = callerSignal
      ? () => {
          controller.abort(callerSignal.reason);
        }
      : undefined;
    if (callerSignal && onCallerAbort) {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      let response: Response;
      try {
        response = await this.#fetch(url, { method, headers, body, signal: controller.signal });
      } catch (error) {
        if (timedOut) {
          throw new KyroRequestError("TIMEOUT", `Kyro API request timed out after ${timeoutMs}ms`, {
            cause: error,
          });
        }
        if (callerSignal?.aborted) {
          throw callerSignal.reason ?? error;
        }
        throw new KyroRequestError("NETWORK", "Network failure while calling the Kyro API", {
          cause: error,
        });
      }

      const rateLimit = readRateLimit(response.headers);
      const retryAfterSeconds = readIntHeader(response.headers, "retry-after");
      if (rateLimit && this.#onRateLimit) {
        const event: KyroRateLimitEvent = { ...rateLimit, path, status: response.status };
        if (retryAfterSeconds !== undefined) event.retryAfterSeconds = retryAfterSeconds;
        this.#onRateLimit(event);
      }

      let parsed: unknown;
      try {
        parsed = await readJsonBody(response, controller.signal);
      } catch (error) {
        if (timedOut) {
          throw new KyroRequestError("TIMEOUT", `Kyro API request timed out after ${timeoutMs}ms`, {
            status: response.status,
            cause: error,
          });
        }
        if (callerSignal?.aborted) {
          throw callerSignal.reason ?? error;
        }
        throw new KyroRequestError(
          "BAD_RESPONSE",
          `The Kyro API answered HTTP ${response.status} without a JSON body`,
          { status: response.status, cause: error },
        );
      }

      const envelope =
        typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>)
          : undefined;
      if (envelope === undefined || typeof envelope.ok !== "boolean" || envelope.version !== "v1") {
        throw new KyroRequestError(
          "BAD_RESPONSE",
          `The Kyro API answered HTTP ${response.status} without a valid v1 response envelope`,
          { status: response.status },
        );
      }

      if (envelope.ok !== true) {
        const errorField =
          typeof envelope.error === "object" && envelope.error !== null
            ? (envelope.error as Record<string, unknown>)
            : undefined;
        const code =
          errorField && typeof errorField.code === "string" && errorField.code !== ""
            ? errorField.code
            : undefined;
        const message =
          errorField && typeof errorField.message === "string" ? errorField.message : undefined;
        if (code === undefined || message === undefined) {
          throw new KyroRequestError(
            "BAD_RESPONSE",
            `The Kyro API answered HTTP ${response.status} with a malformed error envelope`,
            { status: response.status },
          );
        }
        const apiErrorArgs: ConstructorParameters<typeof KyroApiError>[0] = {
          code,
          message: message === "" ? `Kyro API error ${code} (HTTP ${response.status})` : message,
          status: response.status,
          envelope: parsed,
          headers: response.headers,
        };
        if (retryAfterSeconds !== undefined) apiErrorArgs.retryAfterSeconds = retryAfterSeconds;
        if (rateLimit !== undefined) apiErrorArgs.rateLimit = rateLimit;
        throw new KyroApiError(apiErrorArgs);
      }

      if (!response.ok) {
        throw new KyroRequestError(
          "BAD_RESPONSE",
          `The Kyro API answered HTTP ${response.status} with a success envelope`,
          { status: response.status },
        );
      }
      if (!("data" in envelope) || envelope.data === undefined || envelope.data === null) {
        throw new KyroRequestError("BAD_RESPONSE", "The Kyro API success envelope carried no data", {
          status: response.status,
        });
      }

      return {
        data: envelope.data as T,
        status: response.status,
        headers: response.headers,
        rateLimit,
      };
    } finally {
      clearTimeout(timer);
      if (callerSignal && onCallerAbort) {
        callerSignal.removeEventListener("abort", onCallerAbort);
      }
    }
  }

  #buildUrl(path: string, query?: Record<string, string | undefined>): string {
    const url = new URL(this.#baseUrl + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined) url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }
}
