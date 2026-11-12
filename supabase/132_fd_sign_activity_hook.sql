-- ============================================================================
-- 132 — FD Sign's own Slack Zap address (0235)
--
-- FD Sign's step-by-step lines (#fdai-signing) go to the Zap "FD Sign – activity
-- to Slack". Its Catch Hook address is kept here, in the locked webhooks table
-- (only the server can read it), so no Vercel change is needed.
--
-- 1. Replace PASTE_THE_ZAP_URL_HERE below with the Zap's webhook URL
--    (starts https://hooks.zapier.com/hooks/catch/...). Keep it private.
-- 2. Run in Supabase (SQL editor). Safe to run again with a new URL.
-- The site picks it up within 5 minutes.
-- ============================================================================

do $$
declare
  v_url text := 'PASTE_THE_ZAP_URL_HERE';
begin
  if v_url !~ '^https://hooks\.zapier\.com/' then
    raise exception 'Paste the Zap''s webhook URL in place of PASTE_THE_ZAP_URL_HERE first. Nothing was changed.';
  end if;
  insert into public.webhooks (name, url, enabled, updated_at)
  values ('fd_sign_activity', btrim(v_url), true, now())
  on conflict (name) do update set url = excluded.url, enabled = true, updated_at = now();
  raise notice 'OK    FD Sign activity Zap saved. Lines start reaching #fdai-signing within 5 minutes.';
end $$;

-- Check (read-only, shows only the start of the address):
--   select name, enabled, left(url, 40) || '…' as url, updated_at from public.webhooks where name = 'fd_sign_activity';
