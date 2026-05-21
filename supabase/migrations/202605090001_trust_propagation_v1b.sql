-- ARC Identity Trust Propagation + Sybil Resistance V1B.
-- Adds cached trust intelligence fields without changing the rule that only
-- transaction-backed attestations create trust edges.

alter table trust_snapshots
  add column if not exists propagated_trust_score numeric not null default 0,
  add column if not exists trust_confidence numeric not null default 0,
  add column if not exists anomaly_score numeric not null default 0,
  add column if not exists maturity_reason text,
  add column if not exists top_trusted_peers jsonb not null default '[]'::jsonb;

alter table trust_anomalies
  add column if not exists anomaly_score numeric not null default 0,
  add column if not exists anomaly_reason text,
  add column if not exists cluster_size int,
  add column if not exists suspicious_wallets text[] not null default '{}';

create index if not exists idx_trust_snapshots_maturity
  on trust_snapshots(network_health, trust_confidence desc);

create index if not exists idx_trust_anomalies_score
  on trust_anomalies(wallet_address, anomaly_score desc, created_at desc);
