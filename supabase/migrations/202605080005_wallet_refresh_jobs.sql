-- Refresh lifecycle tracking for atomic wallet intelligence refreshes.

create table if not exists wallet_refresh_jobs (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  status text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  chains_total int,
  chains_completed int,
  indexed_count int,
  limited_count int,
  no_activity_count int,
  error_count int,
  refresh_version uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_wallet_refresh_jobs_wallet_created
  on wallet_refresh_jobs(wallet_address, created_at desc);

create index if not exists idx_wallet_refresh_jobs_status
  on wallet_refresh_jobs(status, wallet_address);