import type { Kyro } from "../client";
import type { KyroRequestOptions, KyroTrust } from "../types";
import { requirePathSegment } from "../internal";

export class TrustResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /** Read the trust graph snapshot for a wallet. */
  async get(wallet: string, options?: KyroRequestOptions): Promise<KyroTrust> {
    const segment = requirePathSegment("wallet", wallet);
    const { data } = await this.#client.request<KyroTrust>("GET", `/api/v1/trust/${segment}`, {
      ...options,
    });
    return data;
  }
}
