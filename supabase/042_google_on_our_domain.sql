-- ===========================================================================
-- FDAI — Google sign-in on our own domain
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHAT CHANGED IN THE APP ─────────────────────────────────────────────────
-- "Continue with Google" no longer goes through Supabase's OAuth redirect on
-- *.supabase.co. The app talks to Google itself, from foundersdoc.com, and
-- hands Google's signed ID token to Supabase (signInWithIdToken). Supabase
-- still creates and owns every account; only the handshake moved. Google's
-- consent screen now names our domain, and its free brand verification can
-- be granted, because the redirect is on a domain the firm owns.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
--   1. A question the callback can ask BEFORE anything is created: is there
--      an account for this email? On the sign-in screen, "no" means "sign up
--      first", and nothing is written. Callable only with the secret key.
--   2. Retires 039. That file answered the same question the only way it
--      could at the time — by letting Supabase create the account and then
--      deleting it. With the answer available up front, the undo is not
--      needed, and a function that deletes accounts should not stay around
--      without a caller.
--
-- ── WHAT DOES NOT CHANGE ────────────────────────────────────────────────────
-- 038's gate (registration paused) still runs on every insert into
-- auth.users and still refuses. 037/040 still announce new accounts in
-- Slack. 004 still grants trial credits. 041 still announces drafts.
-- ===========================================================================

-- ──────────────────────────────────────────────── 1. is there an account?
/*
 * SECURITY DEFINER so it may read auth.users; revoked from every role the
 * browser can hold, so the only caller is the server with the secret key.
 * A yes/no about an email is small, but it is still "does this person have
 * an account here", and that is not something anonymous traffic may ask.
 */
create or replace function public.account_exists(p_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(btrim(coalesce(p_email, '')))
      and u.deleted_at is null
  );
$$;

revoke all on function public.account_exists(text) from public, anon, authenticated;
grant execute on function public.account_exists(text) to service_role;

-- ───────────────────────────────────────────────────────── 2. retire 039
drop function if exists public.leave_without_an_account();

-- ────────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from pg_proc where proname = 'account_exists') then
    raise notice 'OK    account_exists() is in place';
  end if;
  if not exists (select 1 from pg_proc where proname = 'leave_without_an_account') then
    raise notice 'OK    039''s create-and-undo is retired';
  end if;
  raise notice 'NEXT  in Vercel, set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (server-only), then redeploy';
  raise notice 'NEXT  in Google Cloud, add the redirect URI  https://foundersdoc.com/auth/google/callback';
  raise notice 'NEXT  in Supabase > Authentication > Providers > Google, make sure the Client ID is listed';
end $$;
