-- ============================================================================
-- 131 — FD Sign plans sold through Stripe, beside FD AI memberships (0225)
--
-- FD Sign Personal / Standard / Business are a monthly Stripe subscription of
-- their own (tier sign_personal / sign_standard / sign_business). They sit in
-- the same subscriptions table as FD AI memberships, so:
--
--   1. subscriptions.tier accepts the three FD Sign tiers.
--   2. active_membership() keeps to FD AI tiers (basic / pro / unlimited), so an
--      FD Sign plan never unlocks FD AI drafting, member top-ups or Unlimited.
--   3. cancel_membership() ends FD AI memberships only.
--   4. admin_accounts() shows the FD AI membership, as before.
--   5. cancel_sign_plan() ends the caller's FD Sign plan (the /billing cancel).
--
-- 2-4 are patched in place on the live functions (only the one WHERE line is
-- added), so nothing else in them changes. Each says OK / SKIP / FAIL.
--
-- Run once in Supabase (SQL editor), after 010-013 and 130. Safe to run twice.
-- ============================================================================

-- 1. The tier check: drop whichever check names the tiers, add the wider one.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.subscriptions'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%tier%' and pg_get_constraintdef(oid) ilike '%unlimited%'
  loop
    execute format('alter table public.subscriptions drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.subscriptions add constraint subscriptions_tier_check
  check (tier in ('basic', 'pro', 'unlimited', 'sign_personal', 'sign_standard', 'sign_business'));

-- 2-4. One line added to each live function, guarded.
do $$
declare
  r record;
  fn regprocedure;
  def text;
  patched text;
begin
  for r in
    select * from (values
      ('active_membership', 'public.active_membership(uuid)'::regprocedure,
        $a$and s.status in ('trialing', 'active', 'past_due')$a$,
        $b$and s.status in ('trialing', 'active', 'past_due')
    and s.tier in ('basic', 'pro', 'unlimited')$b$,
        $c$s.tier in ('basic', 'pro', 'unlimited')$c$),
      ('cancel_membership', 'public.cancel_membership(text, text)'::regprocedure,
        $a$and status in ('trialing', 'active', 'past_due');$a$,
        $b$and status in ('trialing', 'active', 'past_due')
     and tier in ('basic', 'pro', 'unlimited');$b$,
        $c$and tier in ('basic', 'pro', 'unlimited')$c$),
      ('admin_accounts', null::regprocedure,
        $a$and sub.status in ('trialing','active','past_due')$a$,
        $b$and sub.status in ('trialing','active','past_due')
      and sub.tier in ('basic','pro','unlimited')$b$,
        $c$sub.tier in ('basic','pro','unlimited')$c$)
    ) as t(name, fn, find, repl, done)
  loop
    fn := r.fn;
    if fn is null then
      select p.oid::regprocedure into fn from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = r.name limit 1;
    end if;
    if fn is null then
      raise notice 'SKIP  % not found', r.name;
      continue;
    end if;
    def := pg_get_functiondef(fn);
    if position(r.done in def) > 0 then
      raise notice 'SKIP  % already keeps to FD AI tiers', r.name;
    elsif position(r.find in def) = 0 then
      raise notice 'FAIL  % has changed since 010-013: add the FD AI tier filter by hand', r.name;
    else
      patched := replace(def, r.find, r.repl);
      execute patched;
      raise notice 'OK    % keeps to FD AI tiers', r.name;
    end if;
  end loop;
end $$;

-- 5. Cancel the caller's FD Sign plan (the Stripe side is done by /api/billing/cancel first).
create or replace function public.cancel_sign_plan(
  p_reason text default null,
  p_note   text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user  uuid := auth.uid();
  v_ended integer;
begin
  if v_user is null then
    raise exception 'cancel_sign_plan: not signed in';
  end if;

  update public.subscriptions
     set status        = 'canceled',
         cancelled_at  = coalesce(cancelled_at, now()),
         cancel_reason = coalesce(p_reason, cancel_reason),
         cancel_note   = coalesce(nullif(trim(p_note), ''), cancel_note),
         cancel_at_period_end = false,
         current_period_end   = least(coalesce(current_period_end, now()), now())
   where user_id = v_user
     and status in ('trialing', 'active', 'past_due')
     and tier in ('sign_personal', 'sign_standard', 'sign_business');

  get diagnostics v_ended = row_count;
  return coalesce(v_ended, 0);
end;
$$;

revoke all on function public.cancel_sign_plan(text, text) from public;
grant execute on function public.cancel_sign_plan(text, text) to authenticated;

do $$ begin
  raise notice 'OK    FD Sign plans ready · % running', (
    select count(*) from public.subscriptions
     where tier like 'sign\_%' and status in ('trialing', 'active', 'past_due'));
end $$;

-- Check (read-only):
--   select tier, status, count(*) from public.subscriptions group by 1, 2 order by 1, 2;
