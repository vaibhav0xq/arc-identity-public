-- ARC Identity production schema
-- Run this in the Supabase SQL editor or with:
-- supabase db push

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null unique,
  username text unique,
  signature text,
  verified_wallet boolean not null default false,
  arc_score numeric not null default 0,
  risk_level text not null default 'New / Unproven',
  tx_count integer not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_arcid check (username is null or username like '%.arcid')
);

create table if not exists attestations (
  id uuid primary key default gen_random_uuid(),
  from_wallet text not null references profiles(wallet_address) on delete cascade,
  to_wallet text not null references profiles(wallet_address) on delete cascade,
  type text not null check (type = 'successful_deal'),
  weight numeric not null default 1,
  tx_hash text,
  created_at timestamptz not null default now(),
  constraint no_self_attestation check (lower(from_wallet) <> lower(to_wallet))
);

create table if not exists wallet_activity_snapshots (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references profiles(wallet_address) on delete cascade,
  tx_count integer not null default 0,
  volume numeric not null default 0,
  counterparties integer not null default 0,
  active_days integer not null default 0,
  calculated_score numeric not null default 0,
  latest_block bigint not null default 0,
  native_balance numeric not null default 0,
  last_activity_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists reputation_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references profiles(wallet_address) on delete cascade,
  event_type text not null,
  score_delta numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists profiles_arc_score_idx on profiles(arc_score desc);
create index if not exists profiles_wallet_idx on profiles(wallet_address);
create index if not exists attestations_pair_created_idx on attestations(from_wallet, to_wallet, created_at desc);
create index if not exists attestations_to_wallet_idx on attestations(to_wallet);
create index if not exists wallet_activity_wallet_created_idx on wallet_activity_snapshots(wallet_address, created_at desc);
create index if not exists reputation_events_wallet_created_idx on reputation_events(wallet_address, created_at desc);
-- Phase 2 wallet intelligence additions

-- Phase 2 wallet intelligence fields for ARC Identity.
-- Run this after 202605060001_arc_identity_schema.sql.

alter table profiles
  add column if not exists risk_flags jsonb not null default '[]'::jsonb,
  add column if not exists score_trend numeric not null default 0,
  add column if not exists activity_level text not null default 'Dormant';

alter table wallet_activity_snapshots
  add column if not exists recent_activity_count integer not null default 0,
  add column if not exists wallet_age_days integer not null default 0,
  add column if not exists activity_frequency numeric not null default 0;

alter table attestations
  add column if not exists sender_score_at numeric not null default 0,
  add column if not exists pair_history_count integer not null default 0;

create index if not exists idx_profiles_claimed_score on profiles (arc_score desc) where username is not null;
create index if not exists idx_profiles_activity on profiles (tx_count desc, last_seen desc) where username is not null;
create index if not exists idx_profiles_risk_flags on profiles using gin (risk_flags);
create index if not exists idx_wallet_snapshots_recent on wallet_activity_snapshots (wallet_address, created_at desc);
create index if not exists idx_attestations_pair_recent on attestations (from_wallet, to_wallet, created_at desc);
create index if not exists idx_reputation_events_wallet_recent on reputation_events (wallet_address, created_at desc);

-- Transaction-backed attestation additions

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

-- Historical onchain indexer additions

-- Historical onchain indexing metadata for ARC Identity snapshots.
-- Run after previous migrations.

alter table wallet_activity_snapshots
  add column if not exists transfer_count integer not null default 0,
  add column if not exists contract_interaction_count integer not null default 0,
  add column if not exists indexer_source text not null default 'unknown';

create index if not exists idx_wallet_snapshots_indexer_source on wallet_activity_snapshots(indexer_source);
create index if not exists idx_wallet_snapshots_activity_counts on wallet_activity_snapshots(wallet_address, tx_count desc, active_days desc);

-- Multi-chain credential additions

-- Multi-chain credential snapshots for ARC Identity.

create table if not exists wallet_chain_snapshots (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null references profiles(wallet_address) on delete cascade,
  chain_name text not null,
  chain_id bigint not null,
  status text not null,
  tx_count integer not null default 0,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  wallet_age_days integer not null default 0,
  native_balance numeric not null default 0,
  unique_counterparties integer not null default 0,
  contract_interaction_count integer not null default 0,
  active_days integer not null default 0,
  recent_activity_count integer not null default 0,
  explorer_url text,
  provider_source text not null default 'unknown',
  error_message text,
  indexed_at timestamptz not null default now()
);

create table if not exists wallet_global_profiles (
  wallet_address text primary key references profiles(wallet_address) on delete cascade,
  global_first_seen_at timestamptz,
  global_wallet_age_days integer not null default 0,
  total_tx_count integer not null default 0,
  active_chain_count integer not null default 0,
  active_chains jsonb not null default '[]'::jsonb,
  total_unique_counterparties integer not null default 0,
  total_contract_interactions integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table profiles
  add column if not exists global_wallet_age_days integer not null default 0,
  add column if not exists arc_wallet_age_days integer not null default 0,
  add column if not exists active_chain_count integer not null default 0,
  add column if not exists credential_score numeric not null default 0,
  add column if not exists credential_level text not null default 'New / Unproven',
  add column if not exists indexed_chains jsonb not null default '[]'::jsonb;

create index if not exists idx_wallet_chain_snapshots_wallet_indexed on wallet_chain_snapshots(wallet_address, indexed_at desc);
create index if not exists idx_wallet_chain_snapshots_status on wallet_chain_snapshots(status, chain_name);
create index if not exists idx_wallet_chain_snapshots_provider_source on wallet_chain_snapshots(provider_source, chain_name);
create index if not exists idx_wallet_global_profiles_score on wallet_global_profiles(global_wallet_age_days desc, total_tx_count desc);
create index if not exists idx_profiles_credential_score on profiles(credential_score desc);
