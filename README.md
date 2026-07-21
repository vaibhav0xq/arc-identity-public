# ARC Identity

Wallet intelligence and reputation infrastructure for the Arc ecosystem.

![License](https://img.shields.io/badge/license-MIT-f59e0b)
![Next.js](https://img.shields.io/badge/Next.js-15-111827)
![TypeScript](https://img.shields.io/badge/TypeScript-5-2563eb)
![Arc](https://img.shields.io/badge/Arc-Testnet-d4af37)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-16a34a)
![Wallets](https://img.shields.io/badge/EVM-Wallets-8b5cf6)
![Reputation](https://img.shields.io/badge/Reputation-Graph-06b6d4)

ARC Identity is a wallet-first credential layer for Arc users. It turns onchain wallet activity, transaction-backed attestations, multichain history, and trust graph evidence into one portable ARC Identity Score for stablecoin apps.

[Live app](https://arcidentity.in)

---

## Why It Exists

Stablecoin payments are fast, but trust is still fragmented. Apps, merchants, lenders, escrow flows, and high-value counterparties often need a simple way to understand whether a wallet has credible history before interacting with it.

ARC Identity gives wallets a public reputation surface without relying on social claims or manually entered trust data. Scores are built from indexed evidence and verified transaction relationships.

---

## What It Does

ARC Identity provides:

- Wallet connection and signature verification
- Public `.arcid` identity profiles
- ARC Identity Score from verified wallet evidence
- Arc Testnet activity indexing
- Multichain wallet history across supported EVM chains
- Transaction-backed attestations
- Trust graph intelligence
- Directory discovery for registered identities
- Developer API responses for wallet reputation checks

The product is designed so other Arc applications can check wallet credibility before payments, lending, escrow, protected deals, or high-value stablecoin interactions.

---

## Screenshots

### Homepage

![Homepage](./public/screenshots/homepage.png)

### Dashboard

![Dashboard](./public/screenshots/dashboard.png)

### Directory

![Directory](./public/screenshots/directory.png)

### Verified Attestations

![Verified Attestations](./public/screenshots/verified_attestations.png)

---

## Reputation Model

The current scoring engine is versioned as:

```txt
arc_score_v2_2026_07
```

The score is deterministic. If the committed evidence for a wallet has not changed, repeated refreshes should not randomly move the score.

The 100 available points are capped by evidence category:

- Global wallet age: 20
- Active chain coverage: 5
- Indexed transaction activity: 15
- Counterparty diversity: 15
- Arc activity: 25
- Verified transaction attestations: 15
- Propagated trust: 5

Risk and anomaly evidence can apply a disclosed penalty of up to 10 points. Profile creation has no score value, so a wallet with no indexed or verified evidence starts at 0.

Transaction count is one bounded input, not the entire score. Two wallets with different raw activity can rank differently based on Arc footprint, counterparties, verified attestations, trust evidence, provider coverage, and risk signals.

---

## Verified Attestations

ARC Identity does not treat arbitrary claims as reputation.

Verified attestations require transaction evidence. The submitted transaction must be found, validated, and linked to the participating wallets before it can affect trust graph data or reputation scoring.

Attestation signals are weighted by:

- Transaction verification
- Counterparty identity
- Relationship diversity
- Trust graph context
- Repeated-pair concentration

---

## Trust Graph

Accepted transaction-backed attestations create wallet-to-wallet trust edges. The trust graph is used to explain relationship strength and network maturity without allowing social claims or usernames to create reputation.

Trust graph data powers:

- Trusted peer count
- Strongest verified connection
- Reciprocal relationship signals
- Network maturity labels
- Anomaly warnings
- Propagated trust contribution

---

## Chain Intelligence

ARC Identity indexes wallet evidence from:

- Arc Testnet
- Ethereum
- Base
- Arbitrum
- Polygon
- BNB Chain

Provider availability is surfaced clearly. A limited provider is not treated as proof of no activity, and provider failures are not allowed to erase previously committed score evidence.

---

## Developer API

### Wallet Score

```http
GET /api/score/:wallet
```

Returns wallet intelligence, score breakdown, risk level, chain coverage, evidence summaries, and trust graph context.

### Public Profile

```http
GET /api/profile/:username
```

Returns a public ARC Identity profile for a claimed username.

### Directory

```http
GET /api/users
```

Returns claimed public identities sorted by reputation data.

---

## Architecture

```txt
app/          Next.js app router pages and API routes
components/   UI components and dashboard modules
hooks/        Client-side wallet/session helpers
lib/          Scoring, indexing, trust graph, Supabase, API contracts
public/       Static assets and screenshots
scripts/      Verification, audit, and maintenance scripts
```

Production database migrations and deployment operations are managed privately for the live environment.

---

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

---

## Local Development

Clone the repository:

```bash
git clone https://github.com/vaibhav0xq/arc-identity-public.git
cd arc-identity-public
```

Install dependencies:

```bash
npm install
```

Create `.env.local`:

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

Run locally:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

---

## Validation

```bash
npm run typecheck
npm run build
```

The production score pipeline is also covered by audit and regression scripts in `scripts/`.

---

## Security Notes

Never commit:

- `.env.local`
- API keys
- Supabase service role keys
- private keys
- production logs
- database exports
- user private data

Public responses are designed to expose reputation evidence and public profile metadata, not private operational secrets.

---

## Status

ARC Identity is live and actively evolving.

Current focus:

- Score stability
- Evidence-backed reputation
- Arc activity indexing
- Verified attestations
- Trust graph credibility
- Developer-facing wallet intelligence APIs

---

## Author

Built by [Vaibhav](https://github.com/vaibhav0xq).

Web3 builder focused on wallet intelligence, trust systems, and blockchain identity infrastructure.
