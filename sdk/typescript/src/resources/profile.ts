import type { Kyro } from "../client";
import type { KyroProfile, KyroRequestOptions } from "../types";
import { requirePathSegment } from "../internal";

export class ProfileResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /**
   * Read a public profile by Kyro username, e.g. "amara.kyro".
   * An unknown username throws KyroApiError with code NOT_FOUND.
   */
  async get(username: string, options?: KyroRequestOptions): Promise<KyroProfile> {
    const segment = requirePathSegment("username", username);
    const { data } = await this.#client.request<KyroProfile>("GET", `/api/v1/profile/${segment}`, {
      ...options,
    });
    return data;
  }
}
