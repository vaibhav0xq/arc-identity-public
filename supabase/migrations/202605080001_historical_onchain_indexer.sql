-- Historical onchain indexing metadata for ARC Identity snapshots.
-- Run after previous migrations.

alter table wallet_activity_snapshots
  add column if not exists transfer_count integer not null default 0,
  add column if not exists contract_interaction_count integer not null default 0,
  add column if not exists indexer_source text not null default 'unknown';

create index if not exists idx_wallet_snapshots_indexer_source on wallet_activity_snapshots(indexer_source);
create index if not exists idx_wallet_snapshots_activity_counts on wallet_activity_snapshots(wallet_address, tx_count desc, active_days desc);
