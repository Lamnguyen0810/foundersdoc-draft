-- ===========================================================================
-- FDAI — granting and revoking credits from the admin workspace
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHY THIS IS NOT JUST AN INSERT ─────────────────────────────────────────
-- Handing out credits is handing out money. Three things follow from that:
--
--   IT IS AUDITED. Every grant and every revocation records who did it, to
--   whom, how many, and why. Not for compliance theatre — for the afternoon
--   somebody asks "who gave this account 500 documents", and the honest answer
--   has to be available. The log is append-only to admins and invisible to
--   everyone else.
--
--   IT CANNOT BE REACHED BY A NON-ADMIN. Each function checks is_admin() as
--   its first statement and raises if it fails. These are SECURITY DEFINER, so
--   they run with the owner's rights and bypass row-level security — which
--   makes that check the only thing standing between a signed-in lawyer and
--   an unlimited supply of credits. It is written first, deliberately.
--
--   REVOKING CANNOT GO NEGATIVE OR TOUCH WHAT IS SPENT. It reduces what is
--   LEFT on existing grants, newest first, and stops at zero. A document
--   already drafted stays drafted; you are correcting a balance, not
--   confiscating work.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- The audit log.
-- ---------------------------------------------------------------------------
create table if not exists public.admin_credit_actions (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),

  -- Who did it. Not null: an action with no author is not an audit record.
  actor_id    uuid not null references auth.users (id),
  actor_email text,

  -- Who it was done to.
  subject_id    uuid not null references auth.users (id) on delete cascade,
  subject_email text,

  action      text not null check (action in ('grant', 'revoke')),

  -- Always positive. `action` carries the direction, so a stray minus sign
  -- cannot quietly turn a revocation into a grant.
  credits     integer not null check (credits > 0),

  -- What the balance actually became. Recorded rather than recomputed later,
  -- because the point of an audit line is what was true at the time.
  balance_after integer not null,

  reason      text
);

comment on table public.admin_credit_actions is
  'Append-only record of credits handed out or taken back by an administrator.';

create index if not exists admin_credit_actions_subject_idx
  on public.admin_credit_actions (subject_id, created_at desc);

alter table public.admin_credit_actions enable row level security;

-- Admins read it. Nobody writes it directly — only the functions below do,
-- and they are SECURITY DEFINER, so they are not bound by this policy.
drop policy if exists "admin_credit_actions: admin read" on public.admin_credit_actions;
create policy "admin_credit_actions: admin read" on public.admin_credit_actions
  for select using (public.is_admin());


-- ---------------------------------------------------------------------------
-- Find a user by email.
--
-- Deliberately exact-match and case-insensitive rather than a fuzzy search:
-- this is the step where an administrator confirms they have the right person
-- before moving their balance. A list of near-matches invites picking the
-- wrong one. If the address is wrong, the honest answer is "no such user".
-- ---------------------------------------------------------------------------
create or replace function public.admin_lookup_user(p_email text)
returns table (user_id uuid, email text, full_name text, balance integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.email,
         p.full_name,
         public.credit_balance(p.id)
  from public.profiles p
  where lower(p.email) = lower(trim(p_email))
  limit 1;
end;
$$;


-- ---------------------------------------------------------------------------
-- Give credits.
--
-- source = 'gift' and expires_at = null: an administrator's grant behaves like
-- a purchase, because to the person receiving it that is what it is. A gift
-- that quietly evaporates is worse than no gift.
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_credits(
  p_user_id uuid,
  p_credits integer,
  p_reason  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
  v_actor   uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  -- An upper bound so a slipped keystroke — 5000 where 500 was meant — is
  -- caught here rather than discovered in the ledger next week.
  if p_credits is null or p_credits < 1 or p_credits > 1000 then
    raise exception 'credits must be between 1 and 1000' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'no_such_user' using errcode = '22023';
  end if;

  insert into public.credit_grants (user_id, credits, remaining, source, expires_at)
  values (p_user_id, p_credits, p_credits, 'gift', null);

  v_balance := public.credit_balance(p_user_id);

  insert into public.admin_credit_actions
    (actor_id, actor_email, subject_id, subject_email, action, credits, balance_after, reason)
  values (
    v_actor,
    (select email from public.profiles where id = v_actor),
    p_user_id,
    (select email from public.profiles where id = p_user_id),
    'grant',
    p_credits,
    v_balance,
    nullif(trim(coalesce(p_reason, '')), '')
  );

  return v_balance;
end;
$$;


-- ---------------------------------------------------------------------------
-- Take credits back.
--
-- Newest grant first, which is what makes this an undo: the mistake you are
-- correcting is almost always the thing you just did. Spent credits are
-- untouchable — `remaining` only ever goes down to zero, never below, and the
-- drafts those credits bought are not affected.
--
-- If the balance is smaller than the number asked for, it removes what is
-- there and reports it, rather than failing. An administrator who types 500
-- against a balance of 300 means "take it all back".
-- ---------------------------------------------------------------------------
create or replace function public.admin_revoke_credits(
  p_user_id uuid,
  p_credits integer,
  p_reason  text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left    integer := p_credits;
  v_take    integer;
  v_row     record;
  v_removed integer := 0;
  v_balance integer;
  v_actor   uuid := auth.uid();
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_credits is null or p_credits < 1 or p_credits > 1000 then
    raise exception 'credits must be between 1 and 1000' using errcode = '22023';
  end if;

  -- Same three-second ceiling as consume_credit: if a draft is mid-flight and
  -- holding these rows, wait briefly and then say so, rather than queueing
  -- behind it until the request is killed.
  set local lock_timeout = '3s';

  for v_row in
    select id, remaining
    from public.credit_grants
    where user_id = p_user_id
      and remaining > 0
      and (expires_at is null or expires_at > now())
    order by created_at desc
    for update
  loop
    exit when v_left <= 0;
    v_take := least(v_row.remaining, v_left);
    update public.credit_grants
       set remaining = remaining - v_take
     where id = v_row.id;
    v_left := v_left - v_take;
    v_removed := v_removed + v_take;
  end loop;

  v_balance := public.credit_balance(p_user_id);

  -- Nothing to take back is not an error, but it is not worth an audit line
  -- either: no balance changed hands.
  if v_removed > 0 then
    insert into public.admin_credit_actions
      (actor_id, actor_email, subject_id, subject_email, action, credits, balance_after, reason)
    values (
      v_actor,
      (select email from public.profiles where id = v_actor),
      p_user_id,
      (select email from public.profiles where id = p_user_id),
      'revoke',
      v_removed,
      v_balance,
      nullif(trim(coalesce(p_reason, '')), '')
    );
  end if;

  return v_balance;
end;
$$;


-- ---------------------------------------------------------------------------
-- Recent activity, for the panel.
-- ---------------------------------------------------------------------------
create or replace function public.admin_recent_credit_actions(p_limit integer default 20)
returns setof public.admin_credit_actions
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.admin_credit_actions
  where public.is_admin()
  order by created_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;


grant execute on function public.admin_lookup_user(text) to authenticated;
grant execute on function public.admin_grant_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_revoke_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_recent_credit_actions(integer) to authenticated;


-- ###########################################################################
-- ##  VERIFICATION — 5 rows, all OK                                        ##
-- ###########################################################################
select 'Audit table' as check_item,
       case when to_regclass('public.admin_credit_actions') is not null then 'OK' else 'MISSING' end as result
union all
select 'admin_lookup_user',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname='public' and p.proname='admin_lookup_user') then 'OK' else 'MISSING' end
union all
select 'admin_grant_credits',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname='public' and p.proname='admin_grant_credits') then 'OK' else 'MISSING' end
union all
select 'admin_revoke_credits',
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname='public' and p.proname='admin_revoke_credits') then 'OK' else 'MISSING' end
union all
select 'All four check is_admin()',
       case when (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname='public'
                    and p.proname in ('admin_lookup_user','admin_grant_credits',
                                      'admin_revoke_credits','admin_recent_credit_actions')
                    and p.prosrc like '%is_admin%') = 4
            then 'OK' else 'CHECK FAILED' end
order by 1;
