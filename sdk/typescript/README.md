# @kyro/sdk

TypeScript SDK for the Kyro counterparty decision API. Wraps the 8 public v1
operations (score, profile, trust, decision, batch, receipts, intake) with
typed methods, a shared error model and rate limit metadata.

**Status: not yet published to npm.** The package is private while the name
and publish pipeline are settled. Types are generated from the frozen v1 spec
at `public/kyro-openapi.yaml`.

## Quick look

```ts
import { Kyro, KyroApiError } from "@kyro/sdk";

const kyro = new Kyro({ apiKey: process.env.KYRO_API_KEY });

const decision = await kyro.decisions.check("0x1234567890abcdef1234567890abcdef12345678", {
  useCase: "escrow",
});
```

API keys are server-side only. Anonymous access works on every endpoint at
the lower rate budget; just omit `apiKey`.

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
