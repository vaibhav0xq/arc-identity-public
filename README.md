<div align="center">

# Kyro

**Pre-transaction counterparty decisions for wallets. Powered by wallet intelligence and reputation evidence.**

[Website](https://www.thekyro.co) · [Live check](https://www.thekyro.co/check) · [Docs](https://docs.thekyro.co) · [API spec](./public/kyro-openapi.yaml) · [X](https://x.com/KyroIdentity)

</div>

---

Before you pay, escrow, lend to or onboard a wallet, Kyro answers one question: should you transact with this counterparty right now. Every check returns an allow, caution or block verdict with machine readable reason codes, a recommended USDC limit and the exact evidence the verdict was built on. Verdicts are deterministic and conservative by design: missing evidence never counts in a wallet's favor.

![The Kyro landing page](public/screenshots/landing.png)

## The platform

- **Counterparty check workbench** at [thekyro.co/check](https://www.thekyro.co/check). Paste a wallet or username, pick a use case and read the verdict. No account needed.
- **Decision API.** Anonymous access on every endpoint; API keys raise the rate budget. One `GET` call returns the verdict, reasons, limit, evidence and freshness.
- **Decision receipts.** Immutable, shareable snapshots of a verdict for audit trails.
- **Batch screening** for payroll runs, grant payouts, escrow batches and allowlists.
- **Identity layer.** Wallets claim a Kyro username, build a trust graph through attestations and carry a scored reputation across chains.

## What is in this repository

| Path | Contents |
| --- | --- |
| `app/`, `components/`, `lib/`, `hooks/` | The Next.js app surface: landing, check workbench, receipt pages, dashboard and developer pages |
| `public/kyro-openapi.yaml` | The frozen v1 API contract, also as a PDF in `public/docs/` |
| `sdk/typescript/` | TypeScript SDK generated from the spec |
| `docs-site/` | Source of [docs.thekyro.co](https://docs.thekyro.co) |
| `examples/` | Runnable scripts that call the public API |
| `scripts/` | Offline test suites for the published client logic |

The engine behind the API (the scoring pipeline, decision rules, data providers and persistence) runs in the hosted service and is not part of this repository. Everything here builds and runs against the hosted public API.

## Run the app locally

Node.js 20 or later.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. API calls are proxied to the hosted service, so the check workbench and receipt pages work out of the box. Set `KYRO_API_ORIGIN` to point the surface at a different deployment. Wallet bound flows such as claiming a username talk to the live service and follow the same rules as the website. Pages for public profiles and the wallet directory render only on the hosted deployment.

## Call the API

No key needed to start:

```bash
curl "https://www.thekyro.co/api/v1/decision/0x1234567890abcdef1234567890abcdef12345678?useCase=payment"
```

Rate budgets, API keys, reason codes and every endpoint are documented at [docs.thekyro.co](https://docs.thekyro.co). The complete contract lives in [`public/kyro-openapi.yaml`](./public/kyro-openapi.yaml) and more runnable calls live in [`examples/`](./examples).

## TypeScript SDK

```ts
import { Kyro } from "@kyro/sdk";

const kyro = new Kyro({ apiKey: process.env.KYRO_API_KEY });
const decision = await kyro.decisions.check("0x1234...5678", { useCase: "escrow" });
```

The SDK wraps all eight v1 operations with typed methods, a shared error model and rate limit metadata. It is not on npm yet; see [`sdk/typescript/README.md`](./sdk/typescript/README.md) to build it from source.

## Development checks

```bash
npm run typecheck
npm run test:intake-pacing
```

The SDK and the docs site are separate packages with their own commands, documented in their READMEs.

## Policies

[Privacy](./PRIVACY.md) · [Terms](./TERMS.md) · [Security policy](./SECURITY.md) · [Contributing](./CONTRIBUTING.md)

## License

Code and documentation in this repository are released under the [MIT License](./LICENSE). The Kyro name, the Kyro logo and the brand assets under `public/brand/` are not covered by the MIT grant and remain all rights reserved. Use of the hosted service and its API is governed by the [Terms](./TERMS.md).
