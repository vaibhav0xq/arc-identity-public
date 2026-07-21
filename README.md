# Arc Identity

Wallet intelligence and reputation infrastructure for apps built on Arc.

![License](https://img.shields.io/badge/license-MIT-f59e0b)
![Next.js](https://img.shields.io/badge/Next.js-15-111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5-2563eb)
![Arc Testnet](https://img.shields.io/badge/Arc-Testnet-d4af37)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-16a34a)
![EVM Wallets](https://img.shields.io/badge/EVM-Wallets-8b5cf6)
![Reputation Graph](https://img.shields.io/badge/Reputation-Graph-06b6d4)

Arc Identity turns wallet history, Arc activity, transaction-backed attestations, and trust graph evidence into a portable wallet reputation score.

[Live app](https://arcidentity.in)

Arc Identity is an independent builder project. It supports Arc Network infrastructure and is not an official Arc or Circle product.

## Problem

Stablecoin apps still need a practical way to answer a simple question before payments, lending, escrow, or high-value interactions: does this wallet have credible history?

Arc Identity gives wallets a public reputation surface based on indexed evidence instead of social claims or manually entered trust data.

## Features

- EVM wallet connection and signature verification
- Public `.arcid` identity profiles
- Deterministic Arc Identity Score
- Arc Testnet activity indexing
- Multichain wallet history across supported EVM chains
- Transaction-backed attestations
- Trust graph relationships
- Public identity directory
- Developer API for wallet reputation checks

## Screenshots

### Homepage

![Homepage](./public/screenshots/homepage.png)

### Dashboard

![Dashboard](./public/screenshots/dashboard.png)

### Directory

![Directory](./public/screenshots/directory.png)

### Verified Attestations

![Verified Attestations](./public/screenshots/verified_attestations.png)

## Scoring Model

Current scoring model:

```txt
arc_score_v2_2026_07
```

The score is deterministic. If the committed evidence for a wallet has not changed, refreshes should not randomly move the score.

The 100 available points are capped by evidence category:

- Global wallet age: 20
- Active chain coverage: 5
- Indexed transaction activity: 15
- Counterparty diversity: 15
- Arc activity: 25
- Verified transaction attestations: 15
- Propagated trust: 5

Risk and anomaly evidence can apply a disclosed penalty of up to 10 points. Profile creation has no score value, so a wallet with no indexed or verified evidence starts at 0.

Transaction count is one bounded input, not the whole reputation result. Arc footprint, counterparties, verified attestations, trust graph evidence, provider coverage, and risk signals also affect the final score.

## Verified Attestations

Attestations are transaction-backed. A submitted transaction must be found, validated, and linked to the participating wallets before it can affect reputation or trust graph data.

Attestation strength considers transaction verification, counterparty identity, relationship diversity, repeated-pair concentration, and trust graph context.

## Trust Graph

Accepted transaction-backed attestations create wallet-to-wallet trust edges. These edges power trusted peer counts, strongest connection, reciprocal relationship signals, network maturity labels, anomaly warnings, and propagated trust contribution.

Social claims and usernames do not create trust edges by themselves.

## Chain Intelligence

Supported indexing targets:

- Arc Testnet
- Ethereum
- Base
- Arbitrum
- Polygon
- BNB Chain

Provider availability is shown explicitly. Limited provider coverage is not treated as proof of no activity, and temporary provider failures do not erase previously committed score evidence.

## API

```http
GET /api/score/:wallet
```

Returns wallet intelligence, score breakdown, risk level, chain coverage, evidence summaries, and trust graph context.

```http
GET /api/profile/:username
```

Returns a public identity profile for a claimed username.

```http
GET /api/users
```

Returns claimed public identities sorted by reputation data.

## Project Structure

```txt
app/          Next.js app router pages and API routes
components/   UI components and dashboard modules
hooks/        Client-side wallet/session helpers
lib/          Scoring, indexing, trust graph, Supabase, API contracts
public/       Static assets and screenshots
scripts/      Verification, audit, and maintenance scripts
```

Production database migrations and deployment operations are kept private.

## Stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase PostgreSQL
- Arc Testnet RPC
- EVM wallet signatures
- Etherscan-compatible indexers
- Blockscout fallback indexing
- Vercel

## Local Development

```bash
git clone https://github.com/vaibhav0xq/arc-identity-public.git
cd arc-identity-public
npm install
npm run dev
```

Create `.env.local` before running the app with real providers:

```env
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ARC_RPC_URL=
NEXT_PUBLIC_ARC_CHAIN_ID=
NEXT_PUBLIC_ARC_EXPLORER_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ETHERSCAN_API_KEY=
BASESCAN_API_KEY=
ARBISCAN_API_KEY=
POLYGONSCAN_API_KEY=
BSCSCAN_API_KEY=
```

## Validation

```bash
npm run typecheck
npm run build
```

Score contract and production audit scripts live in `scripts/`.

## Security

Do not commit secrets, private keys, production logs, database exports, or user private data.

Security reports: `arcidentity.build@gmail.com`

## License

MIT. See [LICENSE](./LICENSE).

## Author

Built by [Vaibhav](https://github.com/vaibhav0xq).
