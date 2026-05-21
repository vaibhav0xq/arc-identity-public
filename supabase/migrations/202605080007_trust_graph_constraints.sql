-- Add column-level unique constraints so Supabase upserts/conflict handling
-- can target trust graph rows without relying on expression indexes.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trust_snapshots_wallet_address_key'
  ) then
    alter table trust_snapshots
      add constraint trust_snapshots_wallet_address_key unique (wallet_address);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trust_edges_source_wallet_target_wallet_key'
  ) then
    alter table trust_edges
      add constraint trust_edges_source_wallet_target_wallet_key unique (source_wallet, target_wallet);
  end if;
end $$;
