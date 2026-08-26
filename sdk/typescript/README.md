# @kyrodev/sdk

TypeScript SDK for the Kyro counterparty decision API. Wraps all 10 public v1
operations (score, profile, trust, interaction graph read + refresh, decision,
batch, receipts, intake) with typed methods, a shared error model and rate
limit metadata.

## Install

```sh
npm install @kyrodev/sdk
```

Types are generated from the frozen v1 spec at `public/kyro-openapi.yaml`.

## Quick look

```ts
import { Kyro, KyroApiError } from "@kyrodev/sdk";

const kyro = new Kyro({ apiKey: process.env.KYRO_API_KEY });

const decision = await kyro.decisions.check("0x1234567890abcdef1234567890abcdef12345678", {
  useCase: "escrow",
});
```

API keys are server-side only. Anonymous access works on every endpoint at
the lower rate budget except `interactionGraph.refresh`, which requires a
key; just omit `apiKey` for the rest.

### Keyed interaction graph refresh

```ts
const refresh = await kyro.interactionGraph.refresh(wallet);
if (refresh.status === "started") {
  // A run began (5 units, mode "reindex" or "first_index").
  // Poll kyro.interactionGraph.get(wallet) for the persisted graph.
} else if (refresh.status === "indexing") {
  // Joined a run already in flight. Free.
} else {
  // "fresh": the snapshot is younger than 60 minutes; nothing started.
  // refresh.retryAfterSeconds says when a re-index may begin.
}
```

## Development

```bash
npm install          # dev dependencies only; the SDK has zero runtime deps
npm run generate:types   # regenerate src/generated/openapi.ts from the spec
npm run check:generated  # fail if the committed types drift from the spec
npm run typecheck
npm test             # mocked fetch only, no network
npm run build        # dist/: ESM + CJS + d.ts via tsup
npm run test:dist    # smoke test both dist formats
```

Any change to `public/kyro-openapi.yaml` must regenerate the types in the
same commit. Full usage documentation lives on https://docs.thekyro.co.
