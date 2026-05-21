-- Transaction-backed attestations for ARC Identity.
-- Run after Phase 2 migration.

alter table attestations
  add column if not exists tx_block_number bigint,
  add column if not exists tx_timestamp timestamptz,
  add column if not exists tx_value numeric not null default 0,
  add column if not exists verified_participants jsonb not null default '[]'::jsonb,
  add column if not exists verified_transaction boolean not null default false,
  add column if not exists chain_id text;

update attestations
set verified_transaction = false
where verified_transaction is null;

create unique index if not exists idx_attestations_unique_verified_tx
  on attestations (lower(tx_hash))
  where tx_hash is not null and verified_transaction = true;

create index if not exists idx_attestations_verified_pair_recent
  on attestations (from_wallet, to_wallet, tx_timestamp desc)
  where verified_transaction = true;

create index if not exists idx_attestations_verified_participants
  on attestations using gin (verified_participants);
