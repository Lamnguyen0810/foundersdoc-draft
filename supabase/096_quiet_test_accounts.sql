-- ============================================================================
-- 096 — Test accounts are quiet in Slack
--
-- The team's own testing should not reach the Slack channels. From this
-- migration on, an account in public.quiet_accounts is not announced when it:
--
--   · starts a document          (on_event_draft_activity → announce_draft_activity)
--   · downloads the Word file    (announce_draft_download, called by /api/export)
--   · has a draft held or stopped for review (on_draft_review → announce_review)
--
-- and its starts are not counted in "Cumulative / Daily".
--
-- Seeded with Lam's and Rachel's accounts. To add or remove one later, no
-- deploy is needed:
--
--   insert into public.quiet_accounts (email, note) values ('someone@example.com', 'why');
--   delete from public.quiet_accounts where email = 'someone@example.com';
--
-- Only signed-in testing can be recognised: a visitor who is not logged in
-- is still announced as "A visitor (no account yet)".
--
-- Nothing is copied from the announce functions: the triggers gain a WHEN
-- condition, and the download announcement is wrapped. Safe to run twice.
-- Run after 095.
-- ============================================================================

-- 1. The list ------------------------------------------------------------------
create table if not exists public.quiet_accounts (
  email      text primary key,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.quiet_accounts enable row level security;
revoke all on table public.quiet_accounts from anon, authenticated;

insert into public.quiet_accounts (email, note) values
  ('nguyenhoanglam.first@gmail.com', 'Lam — test account'),
  ('legal@foundersdoc.com',          'Lam — FD account'),
  ('rachel.wong@foundersdoc.com',    'Rachel — FD account'),
  ('rwonglmg@outlook.com',           'Rachel — personal account')
on conflict (email) do nothing;

-- 2. Is this account quiet? ---------------------------------------------------
create or replace function public.is_quiet_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_user is not null and exists (
    select 1
    from auth.users u
    join public.quiet_accounts q on lower(btrim(q.email)) = lower(btrim(u.email))
    where u.id = p_user
  );
$$;
revoke all on function public.is_quiet_user(uuid) from public, anon, authenticated;

-- 3. Starts: not announced -----------------------------------------------------
drop trigger if exists on_event_draft_activity on public.events;
create trigger on_event_draft_activity
  after insert on public.events
  for each row
  when (new.name in ('draft_started', 'draft_exported') and not public.is_quiet_user(new.user_id))
  execute function public.announce_draft_activity();

-- … and not counted.
create or replace function public.start_counts(p_slug text, p_at timestamptz default now())
returns table (total integer, today integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer,
         count(*) filter (
           where (e.created_at at time zone 'Asia/Singapore')::date = (p_at at time zone 'Asia/Singapore')::date
         )::integer
  from public.events e
  where e.name = 'draft_started'
    and e.props ->> 'doc_type' = p_slug
    and e.created_at <= p_at
    and (e.user_id is null
         or (not exists (select 1 from public.profiles p where p.id = e.user_id and p.role = 'admin')
             and not public.is_quiet_user(e.user_id)));
$$;
revoke all on function public.start_counts(text, timestamptz) from public, anon, authenticated;

-- 4. Held or stopped drafts: not announced -------------------------------------
drop trigger if exists on_draft_review on public.drafts;
create trigger on_draft_review
  after insert or update of status on public.drafts
  for each row
  when (not public.is_quiet_user(new.user_id))
  execute function public.announce_review();

-- 5. Downloads: not announced (and so not counted) ------------------------------
-- The original keeps its body under a new name; announce_draft_download, which
-- /api/export calls, now asks first. Run twice, the rename is skipped.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'announce_draft_download_all'
  ) then
    alter function public.announce_draft_download(uuid, text) rename to announce_draft_download_all;
  end if;
end $$;
revoke all on function public.announce_draft_download_all(uuid, text) from public, anon, authenticated;

create or replace function public.announce_draft_download(
  p_draft uuid default null,
  p_slug  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_quiet_user(auth.uid()) then
    return;
  end if;
  perform public.announce_draft_download_all(p_draft, p_slug);
end;
$$;
revoke all on function public.announce_draft_download(uuid, text) from public, anon;
grant execute on function public.announce_draft_download(uuid, text) to authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    % quiet account(s): %',
    (select count(*) from public.quiet_accounts),
    (select string_agg(email, ', ' order by email) from public.quiet_accounts);
  raise notice 'OK    Starts, downloads and held/stopped drafts by these accounts are no longer announced in Slack.';
end $$;
