-- ===========================================================================
-- FDAI — user settings, and a lock on the profile's role
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- SETTINGS. The settings page keeps a company profile (name, UEN, address —
-- saved once, offered when drafting) and FD AI preferences (how detailed a
-- first draft should be). One row per person, theirs alone.
--
-- THE LOCK. profiles has always let a person update their own row, which is
-- how they will save their name. But "their own row" includes the `role`
-- column, and nothing stopped a signed-in person setting it to 'admin' with
-- one request to the database API — after which every admin-only screen and
-- function would have let them in. Confirmed on a copy of the schema before
-- this was written. The trigger below refuses a change to role or email
-- from anyone who is not already an admin.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Nobody promotes themselves
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role or new.email is distinct from old.email)
     and not public.is_admin() then
    raise exception 'role and email can only be changed by an administrator'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- ---------------------------------------------------------------------------
-- 2. Settings
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  -- Company profile: name, jurisdiction, entity_type, industry, stage, uen,
  -- address, contact, governing_law, website, description. Free text, the
  -- person's own words about their own company.
  company     jsonb not null default '{}'::jsonb,
  -- Offer the company profile when drafting.
  use_company boolean not null default true,
  -- FD AI preferences: detail ('simple' | 'standard' | 'comprehensive').
  ai          jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings: own" on public.user_settings;
create policy "user_settings: own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.user_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select count(*) = 1 into ok from pg_trigger where tgname = 'profiles_guard_role';
  raise notice '% profiles role lock in place', case when ok then 'OK   ' else 'FAIL ' end;
  select count(*) = 1 into ok from pg_tables where schemaname = 'public' and tablename = 'user_settings';
  raise notice '% user_settings table', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
