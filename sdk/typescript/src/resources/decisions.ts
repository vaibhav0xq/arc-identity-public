import type { Kyro } from "../client";
import type { KyroBatchResult, KyroDecision, KyroRequestOptions, KyroUseCase } from "../types";
import { requirePathSegment } from "../internal";

export interface DecisionCheckOptions extends KyroRequestOptions {
  /** What you are about to do with this counterparty. Defaults to payment on the server. */
  useCase?: KyroUseCase;
}

export interface DecisionBatchOptions extends KyroRequestOptions {
  /** Applied to every row. Defaults to payment on the server. */
  useCase?: KyroUseCase;
}

export class DecisionsResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /**
   * Pre-transaction decision for one wallet.
   *
   * A valid wallet without a committed score still answers 200 with a
   * conservative baseline; this read never throws NOT_FOUND for a valid wallet.
   */
  async check(wallet: string, options?: DecisionCheckOptions): Promise<KyroDecision> {
    const segment = requirePathSegment("wallet", wallet);
    const { useCase, ...requestOptions } = options ?? {};
    const { data } = await this.#client.request<KyroDecision>(
      "GET",
      `/api/v1/decision/${segment}`,
      { ...requestOptions, query: { useCase } },
    );
    return data;
  }

  /**
   * Decisions for a list of wallet addresses and/or Kyro usernames.
   *
   * The server trims and dedupes entries case-insensitively. Unique rows are
   * capped by plan: 10 anonymous, 50 developer, 250 pro, 500 partner by
   * default. A batch of N unique rows costs N rate units; size-rejected
   * batches cost nothing.
   */
  async batch(inputs: string[], options?: DecisionBatchOptions): Promise<KyroBatchResult> {
    if (!Array.isArray(inputs) || inputs.length === 0) {
      throw new TypeError("inputs must be a non-empty array of wallet addresses or usernames");
    }
    if (inputs.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      throw new TypeError("every inputs entry must be a non-empty string");
    }
    const { useCase, ...requestOptions } = options ?? {};
    const body: { inputs: string[]; useCase?: KyroUseCase } = { inputs };
    if (useCase !== undefined) body.useCase = useCase;
    const { data } = await this.#client.request<KyroBatchResult>(
      "POST",
      "/api/v1/decision/batch",
      { ...requestOptions, body },
    );
    return data;
  }
}
