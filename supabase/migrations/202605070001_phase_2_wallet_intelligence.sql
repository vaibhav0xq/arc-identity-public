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
