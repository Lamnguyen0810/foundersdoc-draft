-- ===========================================================================
-- FDAI — the waitlist
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- FD AI is not open to the public yet. Only the firm's own accounts can sign
-- in. Someone who arrives and wants in leaves their details here instead, and
-- the admin workspace shows the queue.
--
-- This is NOT an account. No password, no session, nothing to sign in with —
-- which is the point: a waitlist that quietly creates dormant accounts is a
-- security surface with nobody watching it.
-- ===========================================================================

create table if not exists public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  name        text,
  company     text,
  note        text,
  -- Where they came from, so the firm can see which page is doing the work.
  source      text,
  status      text not null default 'waiting'
              check (status in ('waiting', 'invited', 'joined', 'declined')),
  invited_at  timestamptz,
  created_at  timestamptz not null default now(),

  constraint waitlist_email_shape check (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  constraint waitlist_lengths check (
    length(email) <= 200 and
    coalesce(length(name), 0) <= 120 and
    coalesce(length(company), 0) <= 160 and
    coalesce(length(note), 0) <= 1000
  )
);

-- One entry per person. Case-insensitive: Ann@x.com and ann@x.com are one Ann.
create unique index if not exists waitlist_email_idx on public.waitlist (lower(email));
create index if not exists waitlist_created_idx on public.waitlist (created_at desc);

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- The list of people who want in is commercially sensitive and full of
-- personal data. Admins read it. Nobody else touches it.
-- ===========================================================================
alter table public.waitlist enable row level security;

drop policy if exists "waitlist: admin read" on public.waitlist;
create policy "waitlist: admin read" on public.waitlist
  for select to authenticated using (public.is_admin());

drop policy if exists "waitlist: admin update" on public.waitlist;
create policy "waitlist: admin update" on public.waitlist
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- No insert policy on purpose — joining goes through the function below, which
-- is the only thing that decides what a row may contain.

-- ===========================================================================
-- JOINING
--
-- Returns true for "you are on the list" and ALSO true when the address was
-- already there. That is deliberate. Answering "you have already signed up"
-- turns this open endpoint into a way to test whether an address is on a law
-- firm's waiting list, one address at a time. The person sees the same warm
-- confirmation either way, and the firm sees one row.
-- ===========================================================================
create or replace function public.join_waitlist(
  p_email   text,
  p_name    text default null,
  p_company text default null,
  p_note    text default null,
  p_source  text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(p_email));
begin
  if v_email is null or v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return false;
  end if;

  insert into public.waitlist (email, name, company, note, source)
  values (
    v_email,
    nullif(btrim(left(p_name, 120)), ''),
    nullif(btrim(left(p_company, 160)), ''),
    nullif(btrim(left(p_note, 1000)), ''),
    nullif(btrim(left(p_source, 80)), '')
  )
  on conflict (lower(email)) do nothing;

  return true;
end;
$$;

revoke all on function public.join_waitlist(text,text,text,text,text) from public;
grant execute on function public.join_waitlist(text,text,text,text,text) to anon, authenticated;

-- ===========================================================================
-- What the admin workspace reads.
-- security_invoker so the admin-only policy above still decides.
-- ===========================================================================
create or replace view public.waitlist_summary
with (security_invoker = true) as
  select
    count(*)                                                              as total,
    count(*) filter (where created_at > now() - interval '24 hours')      as last_24h,
    count(*) filter (where created_at > now() - interval '7 days')        as last_7d,
    count(*) filter (where created_at > now() - interval '30 days')       as last_30d,
    count(*) filter (where status = 'waiting')                            as waiting,
    count(*) filter (where status = 'invited')                            as invited
  from public.waitlist;

create or replace view public.waitlist_daily
with (security_invoker = true) as
  select date_trunc('day', created_at)::date as day, count(*) as signups
  from public.waitlist
  group by 1
  order by 1;
