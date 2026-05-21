-- ARC Identity Trust Graph V1A.
-- Trust edges are created only from accepted transaction-backed attestations.

create table if not exists trust_edges (
  id uuid primary key default gen_random_uuid(),
  source_wallet text not null,
  target_wallet text not null,
  interaction_count int not null default 0,
  total_verified_volume numeric not null default 0,
  first_interaction_at timestamptz,
  last_interaction_at timestamptz,
  interaction_types text[] not null default '{}',
  trust_weight numeric not null default 0,
  reciprocal boolean not null default false,
  shared_counterparty_count int not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint trust_edges_no_self check (lower(source_wallet) <> lower(target_wallet))
);

create unique index if not exists idx_trust_edges_source_target
  on trust_edges(lower(source_wallet), lower(target_wallet));

create index if not exists idx_trust_edges_source_weight
  on trust_edges(source_wallet, trust_weight desc);

create table if not exists trust_snapshots (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  trusted_peer_count int not null default 0,
  strongest_connection_wallet text,
  strongest_connection_weight numeric not null default 0,
  reciprocal_count int not null default 0,
  network_health text not null default 'isolated',
  total_trust_weight numeric not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists idx_trust_snapshots_wallet
  on trust_snapshots(lower(wallet_address));

create table if not exists trust_anomalies (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  anomaly_type text not null,
  severity text not null default 'low',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_trust_anomalies_wallet_created
  on trust_anomalies(wallet_address, created_at desc);