-- Normalize cached chain provider coverage restrictions to LIMITED.

update wallet_chain_snapshots
set status = 'limited',
    provider_source = coalesce(nullif(provider_source, 'unknown'), 'limited_provider_required'),
    error_message = coalesce(error_message, 'Provider access required')
where status = 'error'
  and (
    coalesce(error_message, '') ilike '%free api access is not supported%'
    or coalesce(error_message, '') ilike '%full chain coverage%'
    or coalesce(error_message, '') ilike '%upgrade your api plan%'
    or coalesce(error_message, '') ilike '%paid plan%'
    or coalesce(error_message, '') ilike '%BSCTrace%'
    or coalesce(error_message, '') ilike '%MegaNode%'
    or coalesce(error_message, '') ilike '%provider access required%'
    or coalesce(provider_source, '') = 'limited_provider_required'
  );