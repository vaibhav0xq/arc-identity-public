import type { Kyro } from "../client";
import type { KyroRequestOptions, KyroScore } from "../types";
import { requirePathSegment } from "../internal";

export class ScoreResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /**
   * Read the reputation score snapshot for a wallet.
   *
   * A valid wallet Kyro has not indexed still answers 200 with a conservative
   * baseline payload; data.cacheStatus === "cached" marks a committed snapshot.
   * After intake.start, poll this read until the snapshot commits.
   */
  async get(wallet: string, options?: KyroRequestOptions): Promise<KyroScore> {
    const segment = requirePathSegment("wallet", wallet);
    const { data } = await this.#client.request<KyroScore>("GET", `/api/v1/score/${segment}`, {
      ...options,
    });
    return data;
  }
}
