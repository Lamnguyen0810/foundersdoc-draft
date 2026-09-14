-- ===========================================================================
-- FDAI — analytics events
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
--
-- WHAT THIS IS FOR
--   Counting: visitors, consultation clicks, drafts started, questions people
--   skip, drafts abandoned, drafts exported.
--
-- WHAT THIS MUST NEVER HOLD
--   Anything a client typed. Not a company name, not a UEN, not a deal term,
--   not a sentence from a draft. The `props` column records WHICH question was
--   skipped, never the answer. Confidentiality (r 6) applies to this table as
--   much as to the drafts table, and analytics data gets looked at casually —
--   which is exactly why nothing privileged may reach it.
-- ===========================================================================

create table if not exists public.events (
  id             bigserial primary key,
  created_at     timestamptz not null default now(),

  -- What happened. Constrained to a snake_case name so a typo or an injected
  -- string cannot quietly become a new "event type" in your reports.
  name           text not null check (name ~ '^[a-z][a-z0-9_]{2,40}$'),

  -- Who, if signed in. Null for the public website — most rows are anonymous.
  user_id        uuid references auth.users (id) on delete set null,

  -- A random id held in sessionStorage, NOT a cookie. It lets you join the
  -- steps of one visit together and dies when the tab closes. It is not an
  -- identity and cannot be traced back to a person.
  anon_id        text check (anon_id is null or length(anon_id) <= 40),

  -- Where it happened. Path only — never the query string, which on /draft/:id
  -- would carry a matter identifier.
  path           text check (path is null or length(path) <= 200),

  -- Referrer HOST only ("google.com"), never the full URL: full referrers leak
  -- search terms and private inbox links.
  referrer_host  text check (referrer_host is null or length(referrer_host) <= 120),

  country        text check (country is null or length(country) <= 2),
  device         text check (device is null or device in ('mobile','tablet','desktop')),

  -- Structured, whitelisted extras: doc_type, question_key, step, seconds…
  -- Capped so a bug cannot turn this into a document store.
  props          jsonb not null default '{}'::jsonb
                 check (pg_column_size(props) <= 2048)
);

create index if not exists events_name_created_idx on public.events (name, created_at desc);
create index if not exists events_created_idx      on public.events (created_at desc);
create index if not exists events_anon_idx         on public.events (anon_id, created_at);

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- No one reads this but an administrator, and no one writes to it directly —
-- writes go through record_event() below.
-- ===========================================================================
alter table public.events enable row level security;

drop policy if exists "events: admin read" on public.events;
create policy "events: admin read" on public.events
  for select to authenticated using (public.is_admin());

-- Deliberately NO insert policy. Anonymous visitors must be able to record a
-- page view, but granting `anon` insert on a table means anyone holding the
-- publishable key can write any row they like into it. The function below is
-- the only door, and it decides what a row may contain.

-- ===========================================================================
-- The only way to write an event.
-- SECURITY DEFINER, so it can insert past the (absent) insert policy, while
-- still stamping the row with whoever is actually signed in.
-- ===========================================================================
create or replace function public.record_event(
  p_name          text,
  p_anon_id       text default null,
  p_path          text default null,
  p_referrer_host text default null,
  p_country       text default null,
  p_device        text default null,
  p_props         jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_props jsonb := coalesce(p_props, '{}'::jsonb);
begin
  if p_name is null or p_name !~ '^[a-z][a-z0-9_]{2,40}$' then
    raise exception 'record_event: bad event name';
  end if;

  -- A caller could still hand us something enormous. Drop the extras rather
  -- than failing the request: losing one property beats losing the event.
  if pg_column_size(v_props) > 2048 then
    v_props := '{"truncated": true}'::jsonb;
  end if;

  insert into public.events (name, user_id, anon_id, path, referrer_host, country, device, props)
  values (
    p_name,
    auth.uid(),
    left(p_anon_id, 40),
    left(p_path, 200),
    left(p_referrer_host, 120),
    upper(left(p_country, 2)),
    case when p_device in ('mobile','tablet','desktop') then p_device else null end,
    v_props
  );
end;
$$;

revoke all on function public.record_event(text,text,text,text,text,text,jsonb) from public;
grant execute on function public.record_event(text,text,text,text,text,text,jsonb) to anon, authenticated;

-- ===========================================================================
-- Ready-made reads for the admin page.
-- security_invoker keeps the admin-only rule: a view must not become a way
-- around the policy on the table beneath it.
-- ===========================================================================
create or replace view public.events_daily
with (security_invoker = true) as
  select
    date_trunc('day', created_at)::date as day,
    name,
    count(*)                            as count,
    count(distinct anon_id)             as visitors
  from public.events
  group by 1, 2;

-- How far people get in the drafting flow, last 30 days.
create or replace view public.funnel_30d
with (security_invoker = true) as
  select
    name,
    count(*)                as count,
    count(distinct anon_id) as people
  from public.events
  where created_at > now() - interval '30 days'
    and name in ('ai_opened','doc_selected','draft_started','draft_generated','draft_exported')
  group by 1;

-- The question people cannot answer. This is the one that improves the product.
create or replace view public.skipped_questions_30d
with (security_invoker = true) as
  select
    props ->> 'doc_type'     as doc_type,
    props ->> 'question_key' as question_key,
    count(*)                 as times_skipped
  from public.events
  where name = 'question_skipped'
    and created_at > now() - interval '30 days'
  group by 1, 2
  order by times_skipped desc;
