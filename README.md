# Arc Identity

Wallet identity and reputation layer for the Arc ecosystem.

Live: https://arcidentity.in  
Docs: https://arcidentity.in/docs  
Developer API: https://arcidentity.in/developers

## Overview

Arc Identity helps users claim a readable identity, inspect wallet reputation, create verified attestations and share public profiles.

The project focuses on making wallet activity easier to understand before users or builders interact with an address.

## Screenshots

### Homepage

![Arc Identity Homepage](./public/screenshots/homepage.png)

### Dashboard

![Arc Identity Dashboard](./public/screenshots/dashboard.png)

### Directory

![Arc Identity Directory](./public/screenshots/directory.png)

### Verified Attestations

![Arc Identity Verified Attestations](./public/screenshots/verified_attestations.png)

## What it does

Arc Identity lets users:

- Connect an EVM wallet
- Verify wallet ownership
- Claim a readable `.arcid` identity
- View reputation context
- Create verified transaction-backed attestations
- Share public identity profiles
- Discover registered identities
- Query reputation data through a Developer API

## Core features

### Identity claiming

Users can connect an EVM wallet, verify ownership and claim a readable `.arcid` identity.

### Reputation context

Arc Identity turns wallet activity, verified interactions and ecosystem participation into a readable reputation profile.

The reputation layer focuses on:

- Arc activity
- Verified attestations
- Trusted counterparties
- Wallet maturity
- Activity consistency
- Risk and anomaly checks

### Verified attestations

Registered users can create transaction-backed attestations with other registered users.

Current safeguards include:

- Valid transaction hash required
- Registered counterparty required
- Self-attestations rejected
- Duplicate submissions guarded
- Invalid or unverified transactions rejected

### Public profiles

Each claimed identity has a public profile page that makes wallet reputation easier to inspect and share.

Example route:

```txt
/profile/example.arcid
```

### Developer API

Arc Identity exposes public API routes for builders who want to query wallet or username reputation context.

Example routes:

```http
GET /api/score/:wallet
GET /api/profile/:username
GET /api/profile/by-wallet/:wallet
GET /api/users
```

## Supported chains

Arc Identity currently supports EVM-compatible wallet intelligence across:

- Arc Testnet
- Ethereum
- Base
- Polygon
- Arbitrum
- BNB Chain

Some chains may have limited coverage depending on indexing or provider support.

## Tech stack

- Next.js
- React
- TypeScript
- Tailwind CSS
- EVM wallet connection
- API routes
- Vercel

## Project structure

```txt
app/          Application routes and API routes
components/   Reusable UI components
lib/          Reputation, wallet, onboarding, scoring and trust logic
data/         Local supporting data
supabase/     Database schema and migrations
public/       Public assets and screenshots
scripts/      Test and verification scripts
```

## Local development

Clone the repository:

```bash
git clone https://github.com/vaibhav0xq/arc-identity-public.git
cd arc-identity-public
```

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Add the required local environment values, then run the development server:

```bash
npm run dev
```

Open:

```txt
http://localhost:3000
```

## Build verification

```bash
npm run typecheck
npm run build
```

Some test scripts require a local server to be running.

## Current status

Arc Identity is live in Phase 1.

Current focus areas:

- Onboarding reliability
- Reputation explainability
- Verified attestation UX
- Trust graph quality
- Developer API stability
- Arc ecosystem feedback

## Roadmap

### Phase 1: Public release

- Identity claiming
- Public profiles
- Dashboard
- Reputation score
- Verified attestations
- Directory
- Docs
- Developer API

### Phase 2: Reputation clarity

- Better score explanations
- Clearer history views
- Improved trust context
- More readable public profiles

### Phase 3: Developer tooling

- Cleaner API examples
- Improved response formats
- Stronger documentation
- Builder-focused integrations

## Security notes

Do not commit real secrets.

Never commit:

- `.env.local`
- API secrets
- Service role keys
- RPC credentials
- Private keys
- Deployment tokens

This public repository does not include production environment values.

## Author

Built by **Vaibhav Gangani**  
X: [@vaibhav_0xq](https://x.com/vaibhav_0xq)

Arc Identity is an independent builder project for the Arc ecosystem.
