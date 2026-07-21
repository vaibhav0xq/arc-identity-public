-- Versioned ARC Score evidence and single-flight refresh integrity.

alter table profiles
  add column if not exists score_model_version text,
  add column if not exists score_inputs jsonb,
  add column if not exists score_breakdown jsonb,
  add column if not exists score_calculated_at timestamptz;

alter table wallet_chain_snapshots
  add column if not exists counterparty_addresses jsonb not null default '[]'::jsonb;

alter table wallet_activity_snapshots
  add column if not exists counterparty_addresses jsonb not null default '[]'::jsonb,
  add column if not exists evidence_version text;

create index if not exists idx_profiles_score_model_version
  on profiles(score_model_version);

with ranked_active_jobs as (
  select
    id,
    started_at,
    row_number() over (
      partition by wallet_address
      order by started_at desc, created_at desc
    ) as active_rank
  from wallet_refresh_jobs
  where status in ('started', 'indexing_chains', 'recomputing_score')
)
update wallet_refresh_jobs
set
  status = 'failed',
  completed_at = coalesce(completed_at, now()),
  error_message = coalesce(error_message, 'Refresh superseded or expired before score commit')
where id in (
  select id
  from ranked_active_jobs
  where active_rank > 1
     or started_at < now() - interval '15 minutes'
);

create unique index if not exists idx_wallet_refresh_jobs_one_active_wallet
  on wallet_refresh_jobs(wallet_address)
  where status in ('started', 'indexing_chains', 'recomputing_score');
