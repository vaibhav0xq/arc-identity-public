import type { Kyro } from "../client";
import type {
  KyroReceiptCreateResult,
  KyroReceiptRead,
  KyroRequestOptions,
  KyroUseCase,
} from "../types";
import { requirePathSegment } from "../internal";

/** Provide exactly one of wallet or username. */
export type ReceiptCreateParams =
  | { wallet: string; username?: undefined; useCase?: KyroUseCase }
  | { username: string; wallet?: undefined; useCase?: KyroUseCase };

export class ReceiptsResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /**
   * Mint an immutable decision receipt for a wallet or username.
   *
   * Creation has its own budget of 5 receipts per minute on top of the
   * standard rate budget. An identical decision state already minted today
   * answers with that receipt and deduped: true.
   */
  async create(
    params: ReceiptCreateParams,
    options?: KyroRequestOptions,
  ): Promise<KyroReceiptCreateResult> {
    const wallet = typeof params.wallet === "string" ? params.wallet.trim() : "";
    const username = typeof params.username === "string" ? params.username.trim() : "";
    if ((wallet !== "") === (username !== "")) {
      throw new TypeError("Provide exactly one of wallet or username");
    }
    const body: { wallet?: string; username?: string; useCase?: KyroUseCase } = {};
    if (wallet !== "") body.wallet = wallet;
    if (username !== "") body.username = username;
    if (params.useCase !== undefined) body.useCase = params.useCase;
    const { data } = await this.#client.request<KyroReceiptCreateResult>(
      "POST",
      "/api/v1/decision-receipts",
      { ...options, body },
    );
    return data;
  }

  /** Read a receipt by id (rcp_ followed by 16 URL-safe characters). */
  async get(id: string, options?: KyroRequestOptions): Promise<KyroReceiptRead> {
    const segment = requirePathSegment("id", id);
    const { data } = await this.#client.request<KyroReceiptRead>(
      "GET",
      `/api/v1/decision-receipts/${segment}`,
      { ...options },
    );
    return data;
  }
}
