-- Finalized identity onboarding model.
-- Wallet connection alone must not create a persisted ARC Identity.
-- Keep completed identities, remove unfinished rows, and preserve uniqueness.

delete from profiles
where username is null;

create unique index if not exists profiles_wallet_address_unique_idx
  on profiles (wallet_address);

create unique index if not exists profiles_username_unique_idx
  on profiles (username)
  where username is not null;
