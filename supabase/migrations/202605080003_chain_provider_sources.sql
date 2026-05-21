-- Store chain indexer provenance and limited-provider diagnostics.

alter table wallet_chain_snapshots
  add column if not exists provider_source text not null default 'unknown',
  add column if not exists error_message text;

create index if not exists idx_wallet_chain_snapshots_provider_source
  on wallet_chain_snapshots(provider_source, chain_name);