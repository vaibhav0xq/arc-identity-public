-- Align transaction-backed attestation types with the application enum.
-- NOT VALID keeps legacy rows from blocking the migration while enforcing
-- the new allowed values for future inserts and updates.

alter table attestations
  drop constraint if exists attestations_type_check;

alter table attestations
  add constraint attestations_type_check
  check (type in (
    'payment',
    'service_payment',
    'escrow_release',
    'trade_settlement'
  ))
  not valid;
