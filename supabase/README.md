# Supabase Setup

ARC Identity uses Supabase PostgreSQL as its primary production storage. There are no fake users, no local JSON database, and no score-farming tables.

## Option A: Supabase Dashboard

1. Open your Supabase project.
2. Go to SQL Editor.
3. Open `supabase/migrations/202605060001_arc_identity_schema.sql` from this repo.
4. Paste the full SQL into the editor.
5. Click Run.
6. Restart `npm run dev`.

## Option B: Supabase CLI

```powershell
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

## Required Environment Variables

```env
NEXT_PUBLIC_ARC_RPC_URL=https://rpc.testnet.arc.network
NEXT_PUBLIC_ARC_CHAIN_ID=5042002
NEXT_PUBLIC_ARC_EXPLORER_URL=https://testnet.arcscan.app
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The service role key is used only inside Next.js API routes. Do not expose it in client components.
## Phase 2 migration

Run the Phase 2 wallet intelligence migration in the Supabase SQL editor after the base schema:

```sql
-- paste and run:
-- supabase/migrations/202605070001_phase_2_wallet_intelligence.sql
```

This adds `risk_flags`, `score_trend`, `activity_level`, richer wallet snapshot analytics, and trust-weighted attestation metadata. The application does not seed profiles; users appear only after connecting a wallet, signing, and claiming a username.

## Transaction-backed attestations migration

Run this after the Phase 2 migration:

```sql
-- paste and run:
-- supabase/migrations/202605070002_transaction_backed_attestations.sql
```

This makes reputation attestations transaction-backed by storing verified tx metadata, enforcing duplicate transaction prevention with a unique index, and marking older self-reported rows as non-verifying for score purposes.

## Historical onchain indexer migration

Run this after transaction-backed attestations:

```sql
-- paste and run:
-- supabase/migrations/202605080001_historical_onchain_indexer.sql
```

This stores the history indexer source plus detected transfer and contract-interaction counts in wallet snapshots.

## Multi-chain credential migration

Run this after the historical onchain indexer migration:

```sql
-- paste and run:
-- supabase/migrations/202605080002_multichain_credentials.sql
```

This adds per-chain snapshots, global wallet profile aggregates, and credential score fields on `profiles`.
