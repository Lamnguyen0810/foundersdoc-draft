-- ===========================================================================
-- FDAI sprint 2.2 — schema and row-level security
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Safe to re-run: everything is IF NOT EXISTS / CREATE OR REPLACE.
-- ===========================================================================

-- ---------------------------------------------------------------- profiles
-- One row per user, created automatically when an account is added.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'lawyer' check (role in ('lawyer', 'admin')),
  created_at  timestamptz not null default now()
);

-- --------------------------------------------------------------- doc_types
-- The document catalogue. Prompts live HERE, not in code, so a lawyer can tune
-- a prompt without a deploy. `fields` and `examples` are jsonb.
create table if not exists public.doc_types (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  label         text not null,
  description   text not null default '',
  fields        jsonb not null default '[]'::jsonb,
  system_prompt text not null,
  examples      jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------------ drafts
create table if not exists public.drafts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  doc_type_id  uuid references public.doc_types (id) on delete set null,
  title        text,
  answers      jsonb not null default '{}'::jsonb,
  source_text  text,
  output       text,
  status       text not null default 'draft' check (status in ('draft', 'final')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists drafts_user_created_idx
  on public.drafts (user_id, created_at desc);

-- --------------------------------------------------------------- usage_log
-- The money meter. Costs nothing on the free tier but records the number that
-- Phase 2 pricing is built on.
create table if not exists public.usage_log (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  draft_id            uuid references public.drafts (id) on delete set null,
  provider            text not null,
  model               text not null,
  input_tokens        integer not null default 0,
  output_tokens       integer not null default 0,
  cost_usd            numeric(12, 6) not null default 0,
  paid_benchmark_usd  numeric(12, 6) not null default 0,
  created_at          timestamptz not null default now()
);

create index if not exists usage_log_user_created_idx
  on public.usage_log (user_id, created_at desc);

-- ===========================================================================
-- ROW-LEVEL SECURITY
-- Without this every signed-in user could read every other user's drafts.
-- Test it: sprint 4.2 includes a check that user A cannot read user B's rows.
-- ===========================================================================

alter table public.profiles  enable row level security;
alter table public.doc_types enable row level security;
alter table public.drafts    enable row level security;
alter table public.usage_log enable row level security;

-- Helper: is the current user an admin? SECURITY DEFINER so the policy can read
-- profiles without recursing into the profiles policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- profiles -------------------------------------------------------------
drop policy if exists "profiles: read own" on public.profiles;
create policy "profiles: read own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- doc_types ------------------------------------------------------------
-- Everyone signed in may read the catalogue; only admins may change it.
drop policy if exists "doc_types: read for authenticated" on public.doc_types;
create policy "doc_types: read for authenticated" on public.doc_types
  for select to authenticated using (true);

drop policy if exists "doc_types: admin write" on public.doc_types;
create policy "doc_types: admin write" on public.doc_types
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- drafts ---------------------------------------------------------------
drop policy if exists "drafts: own rows" on public.drafts;
create policy "drafts: own rows" on public.drafts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- usage_log ------------------------------------------------------------
drop policy if exists "usage_log: read own" on public.usage_log;
create policy "usage_log: read own" on public.usage_log
  for select to authenticated using (auth.uid() = user_id or public.is_admin());

drop policy if exists "usage_log: insert own" on public.usage_log;
create policy "usage_log: insert own" on public.usage_log
  for insert to authenticated with check (auth.uid() = user_id);

-- ===========================================================================
-- Create a profile row automatically for every new account.
-- ===========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for accounts created before this migration ran.
insert into public.profiles (id, email, full_name)
select u.id, u.email, split_part(u.email, '@', 1)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ===========================================================================
-- Keep updated_at honest.
-- ===========================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists drafts_touch on public.drafts;
create trigger drafts_touch before update on public.drafts
  for each row execute function public.touch_updated_at();

drop trigger if exists doc_types_touch on public.doc_types;
create trigger doc_types_touch before update on public.doc_types
  for each row execute function public.touch_updated_at();
