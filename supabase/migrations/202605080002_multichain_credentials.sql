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
create index if not exists idx_wallet_global_profiles_score on wallet_global_profiles(global_wallet_age_days desc, total_tx_count desc);
create index if not exists idx_profiles_credential_score on profiles(credential_score desc);
