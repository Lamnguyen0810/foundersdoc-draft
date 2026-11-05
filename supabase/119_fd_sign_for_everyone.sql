-- 119  FD Sign for everyone: anyone with a free FD AI account sends their own documents
--
-- Run once in Supabase (SQL editor), after 112-118. Safe to run again.
--
-- WHAT CHANGES. Nothing is removed or renamed. Four new columns on
-- sign_envelopes (all empty on existing rows) and one new table for folders:
--   owner_id / owner_email / owner_name   who sent it (an FD AI account)
--   folder_id                              the sender's folder (or none)
-- ESOP / Founders Doc requests keep owner_email = null, so they never show in
-- anyone's "My documents", and nobody's own documents show on the ESOP pages or
-- in Slack. (owner_email stays if the account is deleted later; owner_id goes.)
--
-- WHO CAN TOUCH IT. Same as 112: row-level security on, NO policies, so only
-- the server (app/api/fd-sign/*, secret key) reads or writes, after checking the
-- signed-in user owns the row. Signers still use their private link only.

-- 1. Who sent it, and which folder it sits in --------------------------------------
alter table public.sign_envelopes add column if not exists owner_id    uuid references auth.users (id) on delete set null;
alter table public.sign_envelopes add column if not exists owner_email text check (owner_email is null or length(owner_email) <= 200);
alter table public.sign_envelopes add column if not exists owner_name  text check (owner_name is null or length(owner_name) <= 160);
alter table public.sign_envelopes add column if not exists folder_id   uuid;

create index if not exists sign_envelopes_owner on public.sign_envelopes (owner_id, created_at desc) where owner_id is not null;
create index if not exists sign_envelopes_founders_doc on public.sign_envelopes (created_at desc) where owner_email is null;
-- "Waiting for me": signer rows found by email
create index if not exists sign_signers_email on public.sign_signers (email, status);   -- emails are stored in lower case

-- 2. Folders (each person's own) ---------------------------------------------------------
create table if not exists public.sign_folders (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 60),
  colour      text not null default '#3b82f6' check (colour ~ '^#[0-9a-fA-F]{6}$'),
  created_at  timestamptz not null default now()
);
create unique index if not exists sign_folders_name on public.sign_folders (owner_id, lower(btrim(name)));
alter table public.sign_folders enable row level security;
revoke all on public.sign_folders from anon, authenticated;

-- a folder that is deleted leaves its documents in "no folder"
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sign_envelopes_folder_fk') then
    alter table public.sign_envelopes
      add constraint sign_envelopes_folder_fk foreign key (folder_id) references public.sign_folders (id) on delete set null;
  end if;
end $$;

-- 3. Check: ESOP rows untouched ----------------------------------------------------------
do $$ begin
  raise notice 'OK    FD Sign for everyone ready · Founders Doc / ESOP requests: % (owner empty) · own requests: %',
    (select count(*) from public.sign_envelopes where owner_email is null),
    (select count(*) from public.sign_envelopes where owner_email is not null);
end $$;

-- Checks (read-only):
--   select title, owner_email, folder_id, status, created_at from public.sign_envelopes where owner_email is not null order by created_at desc limit 20;
--   select owner_id, name from public.sign_folders order by created_at desc limit 20;
