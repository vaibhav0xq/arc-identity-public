import type { Kyro } from "../client";
import type {
  KyroInteractionGraphData,
  KyroInteractionGraphRefreshResult,
  KyroRequestOptions
} from "../types";
import { requirePathSegment } from "../internal";

export interface InteractionGraphGetOptions extends KyroRequestOptions {
  /** Counterparty nodes per page. Defaults to 25; the API caps it at 50. */
  limit?: number;
  /** Opaque next-page cursor from interactionGraph.pagination.nextCursor. */
  cursor?: string;
  /**
   * Opt-in observed-activity ranking: transaction count, then most recent
   * interaction, then address; metrics-null nodes trail with `rank: null`.
   * Single page only (`pagination.nextCursor` is null) and cannot be
   * combined with `cursor`. Observed activity is not endorsement or trust
   * and never affects score. Omit for the default address-ascending
   * enumeration.
   */
  sort?: "activity";
}

export class InteractionGraphResource {
  readonly #client: Kyro;

  constructor(client: Kyro) {
    this.#client = client;
  }

  /** Read persisted observed counterparties for a wallet without starting indexing. */
  async get(wallet: string, options: InteractionGraphGetOptions = {}): Promise<KyroInteractionGraphData> {
    const segment = requirePathSegment("wallet", wallet);
    const { limit, cursor, sort, ...requestOptions } = options;
    const { data } = await this.#client.request<KyroInteractionGraphData>(
      "GET",
      `/api/v1/interaction-graph/${segment}`,
      {
        ...requestOptions,
        query: {
          limit: limit === undefined ? undefined : String(limit),
          cursor,
          sort
        }
      }
    );
    return data;
  }

  /**
   * Ask Kyro to (re)index this wallet so its observed graph does not stay
   * not_indexed or stale forever. Requires an API key; an anonymous call
   * throws KyroApiError NOT_ALLOWED (a never-seen wallet can still be
   * indexed once via intake.start).
   *
   * Idempotent by state: fresh means the snapshot committed within the last
   * 60 minutes (free; retryAfterSeconds says when a re-index may start),
   * indexing joins an in-flight run for free and started begins a new run
   * for 5 rate units, drawing on the daily refresh cap (mode "reindex") or
   * the daily intake cap (mode "first_index"). Concurrent refreshes collapse
   * into a single run; poll get() for the persisted result. A wallet whose
   * last attempt failed within 10 minutes throws RATE_LIMITED with
   * retryAfterSeconds. Observed counterparties stay score-neutral.
   */
  async refresh(wallet: string, options?: KyroRequestOptions): Promise<KyroInteractionGraphRefreshResult> {
    const segment = requirePathSegment("wallet", wallet);
    const { data } = await this.#client.request<KyroInteractionGraphRefreshResult>(
      "POST",
      `/api/v1/interaction-graph/${segment}/refresh`,
      { ...options }
    );
    return data;
  }
}