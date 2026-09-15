-- ===========================================================================
-- FDAI — the admin console's reads
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- WHY THIS FILE EXISTS
--   Row-level security does not let an administrator read `drafts`,
--   `draft_versions` or `subscriptions` — those policies say `auth.uid() =
--   user_id` and nothing else. That is the right default and it is not being
--   loosened here. Instead every figure the admin console shows comes through
--   a function below: SECURITY DEFINER, so it can see across accounts, with
--   `is_admin()` checked first, so it will not.
--
-- ── THE LINE THIS FILE DOES NOT CROSS ──────────────────────────────────────
--   None of these functions returns the CONTENT of anybody's document. Not
--   `output`, not `output_html`, not `source_text`, not `answers`, not an
--   instruction typed into the revision box. An administrator can see that a
--   shareholders' agreement was drafted, by whom, when, and how many revisions
--   it took. What it says is between the lawyer and the client (PCR r 6), and
--   an admin screen is exactly the sort of casual surface that rule exists to
--   keep it off.
--
--   `title` is the one judgement call, because a lawyer may type a client's
--   name into it. It is returned, because a documents tab with no document
--   names is not a documents tab. If FD would rather it were not, delete
--   `d.title` from `admin_documents` below and the column from the page — the
--   rest keeps working.
-- ===========================================================================


-- ---------------------------------------------------------------------------
-- A window, in days, that every function below agrees on. Clamped, because an
-- unbounded range on a growing table is a slow page waiting to happen.
-- ---------------------------------------------------------------------------
create or replace function public.admin_window(p_days integer)
returns timestamptz
language sql
immutable
as $$
  select now() - (greatest(1, least(coalesce(p_days, 30), 365)) || ' days')::interval;
$$;


-- ---------------------------------------------------------------------------
-- 1. DOCUMENTS
--
-- Metadata only. The version count comes from `draft_versions`, which is what
-- tells you the difference between a draft that came out right first time and
-- one somebody fought with for an hour.
-- ---------------------------------------------------------------------------
create or replace function public.admin_documents(
  p_days   integer default 30,
  p_limit  integer default 100,
  p_search text    default null
)
returns table (
  draft_id    uuid,
  owner_email text,
  owner_name  text,
  title       text,
  doc_type    text,
  status      text,
  versions    integer,
  created_at  timestamptz,
  updated_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select d.id,
         p.email,
         p.full_name,
         d.title,
         coalesce(t.label, '—'),
         d.status,
         (select count(*)::integer from public.draft_versions v where v.draft_id = d.id),
         d.created_at,
         d.updated_at
  from public.drafts d
  left join public.profiles  p on p.id = d.user_id
  left join public.doc_types t on t.id = d.doc_type_id
  where d.created_at >= public.admin_window(p_days)
    and (
      v_q is null
      or p.email ilike '%' || v_q || '%'
      or coalesce(d.title, '') ilike '%' || v_q || '%'
      or coalesce(t.label, '') ilike '%' || v_q || '%'
    )
  order by d.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;


-- ---------------------------------------------------------------------------
-- 2. DOCUMENT FIGURES
--
-- One row of counts, so the tab's headline numbers are one round trip rather
-- than six. Everything is a count of rows that exist; nothing is modelled.
-- ---------------------------------------------------------------------------
create or replace function public.admin_document_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_prev timestamptz := v_from - (now() - v_from);
  v_out  jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total',        (select count(*) from public.drafts),
    'period',       (select count(*) from public.drafts where created_at >= v_from),
    'previous',     (select count(*) from public.drafts
                      where created_at >= v_prev and created_at < v_from),
    'finalised',    (select count(*) from public.drafts
                      where status = 'final' and created_at >= v_from),
    'revisions',    (select count(*) from public.draft_versions where created_at >= v_from),
    'drafters',     (select count(distinct user_id) from public.drafts where created_at >= v_from),
    -- A draft that was generated and then never touched again, versus one that
    -- needed work. Both are worth knowing; only one of them is a good sign.
    'untouched',    (select count(*) from public.drafts d
                      where d.created_at >= v_from
                        and not exists (select 1 from public.draft_versions v where v.draft_id = d.id)),
    'exported',     (select count(*) from public.events
                      where name = 'draft_exported' and created_at >= v_from),
    'failed',       (select count(*) from public.events
                      where name = 'draft_failed' and created_at >= v_from)
  ) into v_out;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------------
-- 3. DOCUMENTS BY TYPE
-- ---------------------------------------------------------------------------
create or replace function public.admin_doc_type_counts(p_days integer default 30)
returns table (label text, drafts bigint)
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
  select coalesce(t.label, 'Not recorded'), count(*)
  from public.drafts d
  left join public.doc_types t on t.id = d.doc_type_id
  where d.created_at >= public.admin_window(p_days)
  group by 1
  order by 2 desc, 1
  limit 20;
end;
$$;


-- ---------------------------------------------------------------------------
-- 4. PEOPLE
--
-- `profiles` is every account. `waitlist` is everybody who asked for one and
-- has not got one yet. They are different populations and the page must not
-- add them together.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_prev timestamptz := v_from - (now() - v_from);
  v_out  jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'accounts',        (select count(*) from public.profiles),
    'accounts_new',    (select count(*) from public.profiles where created_at >= v_from),
    'accounts_prev',   (select count(*) from public.profiles
                         where created_at >= v_prev and created_at < v_from),
    -- Activation: an account that has drafted at least once, ever. The number
    -- that says whether sign-ups are turning into users.
    'activated',       (select count(distinct user_id) from public.drafts),
    'active_period',   (select count(distinct user_id) from public.drafts where created_at >= v_from),
    'waitlist',        (select count(*) from public.waitlist),
    'waitlist_new',    (select count(*) from public.waitlist where created_at >= v_from),
    'waitlist_prev',   (select count(*) from public.waitlist
                         where created_at >= v_prev and created_at < v_from),
    'waitlist_waiting',(select count(*) from public.waitlist where status = 'waiting'),
    'waitlist_invited',(select count(*) from public.waitlist where status = 'invited'),
    'admins',          (select count(*) from public.profiles where role = 'admin'),
    'ai_requests',     (select count(*) from public.usage_log where created_at >= v_from),
    'ai_cost_usd',     (select coalesce(sum(cost_usd), 0) from public.usage_log where created_at >= v_from),
    'ai_benchmark_usd',(select coalesce(sum(paid_benchmark_usd), 0) from public.usage_log where created_at >= v_from)
  ) into v_out;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------------
-- 5. WHAT PEOPLE DID, from the events table
--
-- One function rather than four near-identical ones, because the only thing
-- that changes is which column is grouped. `p_kind` is matched against a fixed
-- list — it never reaches SQL as text, so there is nothing here to inject into.
-- ---------------------------------------------------------------------------
create or replace function public.admin_event_breakdown(
  p_kind  text,
  p_days  integer default 30,
  p_limit integer default 8
)
returns table (label text, people bigint, hits bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_n    integer     := greatest(1, least(coalesce(p_limit, 8), 50));
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  if p_kind = 'path' then
    return query
      select e.path, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.name = 'page_view' and e.path is not null
      group by 1 order by 3 desc limit v_n;

  elsif p_kind = 'country' then
    return query
      select e.country, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.country is not null
      group by 1 order by 2 desc limit v_n;

  elsif p_kind = 'device' then
    return query
      select e.device, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.device is not null
      group by 1 order by 2 desc limit v_n;

  elsif p_kind = 'source' then
    return query
      select e.referrer_host, count(distinct e.anon_id), count(*)
      from public.events e
      where e.created_at >= v_from and e.referrer_host is not null
      group by 1 order by 2 desc limit v_n;

  elsif p_kind = 'event' then
    return query
      select e.name, count(distinct coalesce(e.anon_id, e.user_id::text)), count(*)
      from public.events e
      where e.created_at >= v_from
      group by 1 order by 3 desc limit v_n;

  else
    raise exception 'unknown breakdown %', p_kind using errcode = '22023';
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- 6. THE DRAFTING FUNNEL
--
-- Real steps from real events. It deliberately stops at "downloaded it",
-- because that is the last thing this application can observe.
-- ---------------------------------------------------------------------------
create or replace function public.admin_funnel(p_days integer default 30)
returns table (step text, label text, people bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  with s(ord, step, label) as (
    values (1, 'ai_opened',       'Opened the document catalogue'),
           (2, 'doc_selected',    'Chose a document type'),
           (3, 'draft_started',   'Answered the first question'),
           (4, 'draft_generated', 'Got a draft back'),
           (5, 'draft_exported',  'Downloaded it as Word')
  )
  select s.step,
         s.label,
         (select count(distinct coalesce(e.user_id::text, e.anon_id))
          from public.events e
          where e.name = s.step and e.created_at >= v_from)
  from s
  order by s.ord;
end;
$$;


-- ---------------------------------------------------------------------------
-- 7. CREDITS AND PLANS — the figures
-- ---------------------------------------------------------------------------
create or replace function public.admin_plan_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_out  jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'members_basic',     (select count(*) from public.subscriptions
                           where tier = 'basic' and status in ('trialing','active','past_due')),
    'members_pro',       (select count(*) from public.subscriptions
                           where tier = 'pro' and status in ('trialing','active','past_due')),
    'members_unlimited', (select count(*) from public.subscriptions
                           where tier = 'unlimited' and status in ('trialing','active','past_due')),
    'cancelling',        (select count(*) from public.subscriptions
                           where cancel_at_period_end and status in ('trialing','active','past_due')),
    'past_due',          (select count(*) from public.subscriptions where status = 'past_due'),
    'trials',            (select count(*) from public.billing_accounts where trial_granted),
    -- Credits sitting on accounts right now: a liability, not a number that
    -- should ever be guessed at.
    'outstanding',       (select coalesce(sum(remaining), 0)::bigint from public.credit_grants
                           where expires_at is null or expires_at > now()),
    'bought_period',     (select coalesce(sum(credits), 0)::bigint from public.credit_grants
                           where source in ('purchase','topup') and created_at >= v_from),
    'granted_period',    (select coalesce(sum(credits), 0)::bigint from public.credit_grants
                           where source = 'membership' and created_at >= v_from),
    'gifted_period',     (select coalesce(sum(credits), 0)::bigint from public.credit_grants
                           where source = 'gift' and created_at >= v_from),
    'spent_period',      (select count(*) from public.credit_spends
                           where refunded_at is null and created_at >= v_from),
    'spent_unmetered',   (select count(*) from public.credit_spends
                           where refunded_at is null and grant_id is null and created_at >= v_from),
    'fair_use_cap',      (select unlimited_monthly_cap from public.billing_config where id)
  ) into v_out;

  return v_out;
end;
$$;


-- ---------------------------------------------------------------------------
-- 8. CREDITS AND PLANS — the accounts
--
-- One row per person, with the three things an administrator actually needs
-- before deciding anything: what they pay, what they have left, what they use.
-- ---------------------------------------------------------------------------
create or replace function public.admin_accounts(
  p_limit  integer default 100,
  p_search text    default null
)
returns table (
  user_id        uuid,
  email          text,
  full_name      text,
  joined_at      timestamptz,
  tier           text,
  sub_status     text,
  period_end     timestamptz,
  cancelling     boolean,
  balance        integer,
  drafts_total   bigint,
  drafts_30d     bigint,
  last_draft_at  timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
  select p.id,
         p.email,
         p.full_name,
         p.created_at,
         s.tier,
         s.status,
         s.current_period_end,
         coalesce(s.cancel_at_period_end, false),
         public.credit_balance(p.id),
         (select count(*) from public.drafts d where d.user_id = p.id),
         (select count(*) from public.drafts d
           where d.user_id = p.id and d.created_at >= now() - interval '30 days'),
         (select max(d.created_at) from public.drafts d where d.user_id = p.id)
  from public.profiles p
  -- The membership that counts is the best live one. The filter and the
  -- ordering below are character-for-character the ones in active_membership(),
  -- which is what gates drafting — they have to be, or this page would show a
  -- plan the rest of the system does not honour. The only reason this is not a
  -- call to that function is `cancel_at_period_end`, which it does not return
  -- and which an administrator has to see. If active_membership() is ever
  -- changed, change this with it.
  left join lateral (
    select sub.tier, sub.status, sub.current_period_end, sub.cancel_at_period_end
    from public.subscriptions sub
    where sub.user_id = p.id
      and sub.status in ('trialing','active','past_due')
    order by case sub.tier when 'unlimited' then 3 when 'pro' then 2 else 1 end desc,
             sub.current_period_end desc nulls last
    limit 1
  ) s on true
  where v_q is null
     or p.email ilike '%' || v_q || '%'
     or coalesce(p.full_name, '') ilike '%' || v_q || '%'
  order by p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
end;
$$;


-- ---------------------------------------------------------------------------
-- Who may call any of this: signed-in users only, and then only administrators,
-- because every function asks is_admin() for itself. Both halves are needed —
-- the grant stops an anonymous caller at the door, the check stops a signed-in
-- one who is not an admin.
-- ---------------------------------------------------------------------------
revoke all on function public.admin_window(integer) from public;
revoke all on function public.admin_documents(integer, integer, text) from public;
revoke all on function public.admin_document_stats(integer) from public;
revoke all on function public.admin_doc_type_counts(integer) from public;
revoke all on function public.admin_user_stats(integer) from public;
revoke all on function public.admin_event_breakdown(text, integer, integer) from public;
revoke all on function public.admin_funnel(integer) from public;
revoke all on function public.admin_plan_stats(integer) from public;
revoke all on function public.admin_accounts(integer, text) from public;

grant execute on function public.admin_documents(integer, integer, text)      to authenticated;
grant execute on function public.admin_document_stats(integer)                to authenticated;
grant execute on function public.admin_doc_type_counts(integer)               to authenticated;
grant execute on function public.admin_user_stats(integer)                    to authenticated;
grant execute on function public.admin_event_breakdown(text, integer, integer) to authenticated;
grant execute on function public.admin_funnel(integer)                        to authenticated;
grant execute on function public.admin_plan_stats(integer)                    to authenticated;
grant execute on function public.admin_accounts(integer, text)                to authenticated;


-- ---------------------------------------------------------------------------
-- Proof it ran.
-- ---------------------------------------------------------------------------
select 'admin_documents'       as fn, 'ok' as status
union all select 'admin_document_stats', 'ok'
union all select 'admin_doc_type_counts', 'ok'
union all select 'admin_user_stats', 'ok'
union all select 'admin_event_breakdown', 'ok'
union all select 'admin_funnel', 'ok'
union all select 'admin_plan_stats', 'ok'
union all select 'admin_accounts', 'ok';
