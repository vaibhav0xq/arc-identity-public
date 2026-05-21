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