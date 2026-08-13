import type { Kyro } from "../client";
import type { KyroIntakeResult, KyroRequestOptions } from "../types";
import { requirePathSegment } from "../internal";

export class IntakeResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /**
   * Start indexing a wallet Kyro has not seen yet.
   *
   * Idempotent by state: already_indexed answers with no work done, indexing
   * joins an in-flight scan for free and started begins a new scan for 5 rate
   * units. Intake never invents a verdict; poll score.get until the snapshot
   * commits (cacheStatus "cached"), then run the decision read. One indexing
   * attempt per wallet per 10 minutes; a recent failed attempt throws
   * RATE_LIMITED with retryAfterSeconds.
   */
  async start(wallet: string, options?: KyroRequestOptions): Promise<KyroIntakeResult> {
    const segment = requirePathSegment("wallet", wallet);
    const { data } = await this.#client.request<KyroIntakeResult>(
      "POST",
      `/api/v1/intake/${segment}`,
      { ...options },
    );
    return data;
  }
}
