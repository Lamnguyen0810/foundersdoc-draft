-- ===========================================================================
-- FDAI — the waitlist starts handing out accounts
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- Until now, joining the waitlist put a row in a table and nothing else. The
-- firm then made accounts by hand. This changes what joining means: the same
-- form now also creates the account, and the trigger from 004 grants it three
-- credits for fourteen days the moment the row appears.
--
-- ── WHAT ACTUALLY GUARDS THE DOOR ──────────────────────────────────────────
-- Supabase's own sign-up stays OFF, and that is the point. Accounts are made
-- by one route on our server, using the admin key, only for an address that is
-- already on this list. Nobody can create an account by talking to Supabase
-- directly, which is what makes "only people who registered" a fact rather
-- than a label.
--
-- ── THREE THINGS ───────────────────────────────────────────────────────────
--   1. A switch: does joining create the account at once, or does FD press
--      Invite? It is a row, not a constant, so changing it is one UPDATE and
--      no deploy — which matters at 2am.
--   2. waitlist.account_at: when this address got an account. Deliberately a
--      NEW COLUMN rather than a new `status`, so every count the admin console
--      already makes — waiting, invited, joined this week — keeps meaning what
--      it meant yesterday.
--   3. The two functions the route calls, both SECURITY DEFINER, both
--      answering one narrow question each.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────────── 1. the switch
create table if not exists public.signup_config (
  id           boolean primary key default true check (id),
  auto_account boolean not null default true,
  updated_at   timestamptz not null default now()
);
insert into public.signup_config (id) values (true) on conflict (id) do nothing;

comment on column public.signup_config.auto_account is
  'true: joining the waitlist creates the account immediately. '
  'false: it creates only the waitlist row, and FD presses Invite.';

/*
 * Nobody reads this as a person. The sign-up route reads it with the admin
 * key, which bypasses policies; leaving the table with RLS on and no policy
 * at all means a browser that finds the name learns nothing from it.
 */
alter table public.signup_config enable row level security;

-- ──────────────────────────────────────────────────── 2. when the account came
alter table public.waitlist
  add column if not exists account_at timestamptz;

comment on column public.waitlist.account_at is
  'When an account was created for this address. Null means there is not one yet.';

create index if not exists waitlist_account_idx
  on public.waitlist (account_at)
  where account_at is not null;

-- ───────────────────────────────────────────────────────────── 3. the functions

/*
 * Is this address on the list?
 *
 * The sign-up route asks before it creates anything, and the admin Invite
 * button asks again — because "only people who registered" has to be checked
 * where the account is made, not where the button is drawn.
 *
 * It answers only yes or no. It does not return the row, so it cannot become a
 * way to read the list, and it is granted to nobody: the callers hold the
 * admin key.
 */
create or replace function public.waitlist_has(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.waitlist where lower(email) = lower(btrim(p_email))
  );
$$;

revoke all on function public.waitlist_has(text) from public, anon, authenticated;

/*
 * This address now has an account.
 *
 * Recorded against the waitlist row so the admin table can say so, and so a
 * second attempt — a refresh, a Stripe-style retry, somebody pressing Invite
 * on a person who already joined — is a no-op rather than a second account.
 *
 * `status` is moved to 'invited' only if it was still 'waiting'. An address FD
 * had already declined is not quietly re-admitted by a form submission.
 *
 * It returns the time the account was FIRST made — not the time of this call —
 * so a repeat is visibly a repeat, and no row matched at all reads as null
 * rather than as a confident timestamp for something that did not happen.
 */
create or replace function public.waitlist_account_made(p_email text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now  timestamptz := now();
  v_when timestamptz;
begin
  update public.waitlist
  set account_at = coalesce(account_at, v_now),
      status     = case when status = 'waiting' then 'invited' else status end,
      invited_at = coalesce(invited_at, v_now)
  where lower(email) = lower(btrim(p_email))
  returning account_at into v_when;

  return v_when;
end;
$$;

revoke all on function public.waitlist_account_made(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────────── the check
do $$
declare v_auto boolean; v_col integer;
begin
  select auto_account into v_auto from public.signup_config where id;
  select count(*) into v_col
  from information_schema.columns
  where table_schema = 'public' and table_name = 'waitlist' and column_name = 'account_at';

  if v_col = 1 then
    raise notice 'OK    waitlist.account_at is in place (% of % addresses have an account)',
      (select count(*) from public.waitlist where account_at is not null),
      (select count(*) from public.waitlist);
    raise notice 'OK    joining the waitlist creates an account: %',
      case when v_auto then 'YES, at once' else 'NO — FD presses Invite' end;
  else
    raise notice 'FAIL  waitlist.account_at was not added';
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- THE SWITCH, FOR LATER
--
-- If the free credits are being farmed, close it. Takes effect on the next
-- sign-up; nothing needs redeploying:
--
--   update public.signup_config set auto_account = false, updated_at = now() where id;
--
-- And to open it again:
--
--   update public.signup_config set auto_account = true, updated_at = now() where id;
-- ═══════════════════════════════════════════════════════════════════════════
