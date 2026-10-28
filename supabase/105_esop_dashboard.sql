-- ============================================================================
-- 105 — ESOP dashboard (client portal), first client: HitPay
--
-- The page /esop/<slug> (app/esop/[slug]) is a spreadsheet-style dashboard a
-- client's CEO uses to see and keep their option holders up to date:
--
--   esop_companies   one row per client: slug in the address, name, logo,
--                    plan ('free' for HitPay; 'premium' unlocks the premium
--                    design later)
--   esop_members     who may open a company's page: email + role ('ceo' or
--                    'viewer'). Founders Doc admins (is_admin()) see every
--                    company without a row here.
--   esop_batches     each grant batch: vesting start date and number of
--                    yearly tranches (tranche t vests on start + t years)
--   esop_holders     each option holder: name, email, ID no., batch, options
--                    per tranche, status Active / Leaver (leavers are
--                    ARCHIVED, never deleted: they stay on the Archive tab)
--   esop_documents   uploaded Letters of Grant and Option Certificates; the
--                    files live in the PRIVATE storage bucket 'esop-docs'
--
-- WHO CAN DO WHAT (row-level security, checked by the database, not the page)
--   read        company members + FD admins
--   add / edit  company members + FD admins (CEO keeps the list current)
--   delete      FD admins only (people are archived, not deleted)
--   files       same as read/add; download links are short-lived (60 s)
--
-- Test data: company 'hitpay' named "HitPay (TEST)": the approved mock-up's
-- placeholder holders (Holder 1-30, example.com emails, batches 1-10) plus
-- Test Holder A/B in batch 99 (the Zapier test). To go live, see the end of
-- this file ("GOING LIVE").
--
-- Safe to run twice. Run after 104.
-- ============================================================================

-- 1. Tables --------------------------------------------------------------------
create table if not exists public.esop_companies (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (length(name) between 1 and 120),
  logo_url    text,
  plan        text not null default 'free' check (plan in ('free', 'premium')),
  created_at  timestamptz not null default now()
);

create table if not exists public.esop_members (
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  email       text not null check (email = lower(email) and email like '%@%'),
  role        text not null default 'ceo' check (role in ('ceo', 'viewer')),
  added_at    timestamptz not null default now(),
  primary key (company_id, email)
);

create table if not exists public.esop_batches (
  company_id     uuid not null references public.esop_companies (id) on delete cascade,
  batch          int  not null check (batch between 0 and 999),
  vesting_start  date,
  tranches       int  not null default 4 check (tranches between 1 and 10),
  note           text,
  primary key (company_id, batch)
);

create table if not exists public.esop_holders (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.esop_companies (id) on delete cascade,
  name                 text not null default 'New holder' check (length(name) between 1 and 160),
  email                text check (email is null or length(email) <= 200),
  id_no                text check (id_no is null or length(id_no) <= 60),
  batch                int  not null default 1 check (batch between 0 and 999),
  options_per_tranche  int  not null default 0 check (options_per_tranche between 0 and 100000000),
  status               text not null default 'Active' check (status in ('Active', 'Leaver')),
  leaver_type          text check (leaver_type is null or leaver_type in ('Good', 'Bad', 'Unvested')),
  last_day             date,
  notes                text check (notes is null or length(notes) <= 2000),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  updated_by           text
);
create index if not exists esop_holders_company on public.esop_holders (company_id, status);

create table if not exists public.esop_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.esop_companies (id) on delete cascade,
  holder_id    uuid not null references public.esop_holders (id) on delete cascade,
  kind         text not null check (kind in ('letter_of_grant', 'certificate')),
  tranche      int check (tranche is null or tranche between 1 and 10),
  path         text not null unique,
  file_name    text not null check (length(file_name) between 1 and 200),
  size_bytes   int,
  uploaded_by  text,
  uploaded_at  timestamptz not null default now()
);
create index if not exists esop_documents_holder on public.esop_documents (holder_id);

-- 2. Who may open a company ------------------------------------------------------
-- security definer so the policies below can read esop_members without a
-- policy of their own getting in the way; it only ever answers yes/no.
create or replace function public.esop_can(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.esop_members m
        where m.company_id = p_company
          and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
$$;
revoke all on function public.esop_can(uuid) from public;
grant execute on function public.esop_can(uuid) to authenticated;

-- Stamp who changed a holder, and when (the page shows "Updated …").
create or replace function public.esop_holders_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.jwt() ->> 'email', new.updated_by);
  return new;
end $$;
drop trigger if exists esop_holders_touch on public.esop_holders;
create trigger esop_holders_touch before insert or update on public.esop_holders
  for each row execute function public.esop_holders_touch();

-- 3. Row-level security ---------------------------------------------------------------
alter table public.esop_companies enable row level security;
alter table public.esop_members   enable row level security;
alter table public.esop_batches   enable row level security;
alter table public.esop_holders   enable row level security;
alter table public.esop_documents enable row level security;

drop policy if exists "esop companies: read" on public.esop_companies;
create policy "esop companies: read" on public.esop_companies
  for select to authenticated using (public.esop_can(id));
drop policy if exists "esop companies: admins write" on public.esop_companies;
create policy "esop companies: admins write" on public.esop_companies
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "esop members: admins" on public.esop_members;
create policy "esop members: admins" on public.esop_members
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "esop members: see own" on public.esop_members;
create policy "esop members: see own" on public.esop_members
  for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "esop batches: read" on public.esop_batches;
create policy "esop batches: read" on public.esop_batches
  for select to authenticated using (public.esop_can(company_id));
drop policy if exists "esop batches: add" on public.esop_batches;
create policy "esop batches: add" on public.esop_batches
  for insert to authenticated with check (public.esop_can(company_id));
drop policy if exists "esop batches: edit" on public.esop_batches;
create policy "esop batches: edit" on public.esop_batches
  for update to authenticated using (public.esop_can(company_id)) with check (public.esop_can(company_id));
drop policy if exists "esop batches: admins delete" on public.esop_batches;
create policy "esop batches: admins delete" on public.esop_batches
  for delete to authenticated using (public.is_admin());

drop policy if exists "esop holders: read" on public.esop_holders;
create policy "esop holders: read" on public.esop_holders
  for select to authenticated using (public.esop_can(company_id));
drop policy if exists "esop holders: add" on public.esop_holders;
create policy "esop holders: add" on public.esop_holders
  for insert to authenticated with check (public.esop_can(company_id));
drop policy if exists "esop holders: edit" on public.esop_holders;
create policy "esop holders: edit" on public.esop_holders
  for update to authenticated using (public.esop_can(company_id)) with check (public.esop_can(company_id));
drop policy if exists "esop holders: admins delete" on public.esop_holders;
create policy "esop holders: admins delete" on public.esop_holders
  for delete to authenticated using (public.is_admin());

drop policy if exists "esop documents: read" on public.esop_documents;
create policy "esop documents: read" on public.esop_documents
  for select to authenticated using (public.esop_can(company_id));
drop policy if exists "esop documents: add" on public.esop_documents;
create policy "esop documents: add" on public.esop_documents
  for insert to authenticated with check (
    public.esop_can(company_id)
    and exists (select 1 from public.esop_holders h where h.id = holder_id and h.company_id = esop_documents.company_id)
  );
drop policy if exists "esop documents: admins delete" on public.esop_documents;
create policy "esop documents: admins delete" on public.esop_documents
  for delete to authenticated using (public.is_admin());

grant select on public.esop_companies, public.esop_members to authenticated;
grant select, insert, update on public.esop_batches, public.esop_holders to authenticated;
grant select, insert on public.esop_documents to authenticated;
grant delete on public.esop_batches, public.esop_holders, public.esop_documents to authenticated;
grant insert, update, delete on public.esop_companies, public.esop_members to authenticated;

-- 4. The private file bucket ------------------------------------------------------------
-- Files are stored as <company id>/<holder id>/<kind>-<time>-<name>. The first
-- folder decides who may read or add them.
create or replace function public.esop_can_path(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  begin
    v_company := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.esop_can(v_company);
end $$;
revoke all on function public.esop_can_path(text) from public;
grant execute on function public.esop_can_path(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('esop-docs', 'esop-docs', false, 10485760, array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png', 'image/jpeg'])
    on conflict (id) do update
      set public = false,
          file_size_limit = 10485760,
          allowed_mime_types = excluded.allowed_mime_types;

    drop policy if exists "esop-docs: read" on storage.objects;
    create policy "esop-docs: read" on storage.objects
      for select to authenticated using (bucket_id = 'esop-docs' and public.esop_can_path(name));

    drop policy if exists "esop-docs: upload" on storage.objects;
    create policy "esop-docs: upload" on storage.objects
      for insert to authenticated with check (bucket_id = 'esop-docs' and public.esop_can_path(name));

    drop policy if exists "esop-docs: admins remove" on storage.objects;
    create policy "esop-docs: admins remove" on storage.objects
      for delete to authenticated using (bucket_id = 'esop-docs' and public.is_admin());

    raise notice 'OK    private bucket esop-docs is ready (10 MB; pdf, doc, docx, png, jpg)';
  else
    raise notice 'NOTE  no storage schema here, so the bucket was skipped (expected outside Supabase)';
  end if;
end $$;

-- 5. Test data (HitPay, TEST) ------------------------------------------------------------
-- Only added when the company does not exist yet, so running this file again
-- never brings deleted test rows back or touches real data.
do $$
declare
  v_id uuid;
begin
  if exists (select 1 from public.esop_companies where slug = 'hitpay') then
    raise notice 'SKIP  company hitpay already exists, test data left as it is';
    return;
  end if;

  insert into public.esop_companies (slug, name, logo_url, plan)
  values ('hitpay', 'HitPay (TEST)', '/email/hitpay-esop/hitpay-logo.png', 'free')
  returning id into v_id;

  insert into public.esop_batches (company_id, batch, vesting_start, tranches, note) values
    (v_id, 1, '2023-03-01', 4, 'TEST'),
    (v_id, 2, '2023-09-01', 4, 'TEST'),
    (v_id, 3, '2023-03-01', 4, 'TEST'),
    (v_id, 4, '2023-09-01', 4, 'TEST'),
    (v_id, 5, '2023-11-01', 4, 'TEST'),
    (v_id, 6, null, 4, 'TEST'),
    (v_id, 7, '2024-06-01', 4, 'TEST'),
    (v_id, 8, '2024-12-01', 4, 'TEST'),
    (v_id, 9, '2024-09-20', 4, 'TEST'),
    (v_id, 10, '2025-04-14', 4, 'TEST'),
    (v_id, 99, '2025-11-04', 4, 'TEST');

  insert into public.esop_holders (company_id, name, email, id_no, batch, options_per_tranche, status, leaver_type, last_day) values
    (v_id, 'Test Holder A', 'administrator@foundersdoc.com', 'TEST-ID-A', 99, 1000, 'Active', null, null),
    (v_id, 'Test Holder B', 'leaver.test@example.com', 'TEST-ID-B', 99, 1000, 'Leaver', 'Good', '2026-06-30'),
    (v_id, 'Holder 1', 'holder1@example.com', 'TEST-ID-001', 1, 10000, 'Active', null, null),
    (v_id, 'Holder 2', 'holder2@example.com', 'TEST-ID-002', 1, 7500, 'Active', null, null),
    (v_id, 'Holder 3', 'holder3@example.com', 'TEST-ID-003', 1, 6000, 'Active', null, null),
    (v_id, 'Holder 4', 'holder4@example.com', 'TEST-ID-004', 1, 4400, 'Active', null, null),
    (v_id, 'Holder 5', 'holder5@example.com', 'TEST-ID-005', 1, 8800, 'Active', null, null),
    (v_id, 'Holder 6', 'holder6@example.com', 'TEST-ID-006', 3, 4000, 'Active', null, null),
    (v_id, 'Holder 7', 'holder7@example.com', 'TEST-ID-007', 4, 2000, 'Active', null, null),
    (v_id, 'Holder 8', 'holder8@example.com', 'TEST-ID-008', 4, 2200, 'Active', null, null),
    (v_id, 'Holder 9', 'holder9@example.com', 'TEST-ID-009', 5, 3000, 'Active', null, null),
    (v_id, 'Holder 10', 'holder10@example.com', 'TEST-ID-010', 7, 2200, 'Active', null, null),
    (v_id, 'Holder 11', 'holder11@example.com', 'TEST-ID-011', 8, 4400, 'Active', null, null),
    (v_id, 'Holder 12', 'holder12@example.com', 'TEST-ID-012', 8, 4400, 'Active', null, null),
    (v_id, 'Holder 13', 'holder13@example.com', 'TEST-ID-013', 8, 4400, 'Active', null, null),
    (v_id, 'Holder 14', 'holder14@example.com', 'TEST-ID-014', 1, 2200, 'Leaver', 'Good', '2024-07-12'),
    (v_id, 'Holder 15', 'holder15@example.com', 'TEST-ID-015', 1, 8800, 'Leaver', 'Bad', '2025-02-01'),
    (v_id, 'Holder 16', 'holder16@example.com', 'TEST-ID-016', 1, 4400, 'Leaver', 'Good', '2026-04-23'),
    (v_id, 'Holder 17', 'holder17@example.com', 'TEST-ID-017', 2, 2900, 'Leaver', 'Bad', '2025-04-30'),
    (v_id, 'Holder 18', 'holder18@example.com', 'TEST-ID-018', 2, 2200, 'Leaver', 'Good', '2025-08-15'),
    (v_id, 'Holder 19', 'holder19@example.com', 'TEST-ID-019', 3, 0, 'Leaver', 'Unvested', '2024-02-01'),
    (v_id, 'Holder 20', 'holder20@example.com', 'TEST-ID-020', 3, 3400, 'Leaver', 'Good', '2026-03-14'),
    (v_id, 'Holder 21', 'holder21@example.com', 'TEST-ID-021', 4, 2200, 'Leaver', 'Good', '2025-06-30'),
    (v_id, 'Holder 22', 'holder22@example.com', 'TEST-ID-022', 4, 2200, 'Leaver', 'Good', '2025-10-31'),
    (v_id, 'Holder 23', 'holder23@example.com', 'TEST-ID-023', 4, 2200, 'Leaver', 'Good', '2026-06-22'),
    (v_id, 'Holder 24', 'holder24@example.com', 'TEST-ID-024', 5, 2200, 'Leaver', 'Good', '2026-01-15'),
    (v_id, 'Holder 25', 'holder25@example.com', 'TEST-ID-025', 6, 0, 'Leaver', 'Unvested', '2024-08-30'),
    (v_id, 'Holder 26', 'holder26@example.com', 'TEST-ID-026', 6, 0, 'Leaver', 'Unvested', '2024-11-19'),
    (v_id, 'Holder 27', 'holder27@example.com', 'TEST-ID-027', 7, 1100, 'Leaver', 'Good', '2025-07-31'),
    (v_id, 'Holder 28', 'holder28@example.com', 'TEST-ID-028', 8, 1100, 'Leaver', 'Good', '2026-02-28'),
    (v_id, 'Holder 29', 'holder29@example.com', 'TEST-ID-029', 9, 0, 'Leaver', 'Unvested', '2025-03-31'),
    (v_id, 'Holder 30', 'holder30@example.com', 'TEST-ID-030', 10, 1100, 'Leaver', 'Good', '2026-05-31');

  raise notice 'OK    HitPay (TEST) added: 11 batches, 32 test holders. Open /esop/hitpay';
end $$;

-- ============================================================================
-- GOING LIVE (run by hand when Rachel confirms; nothing below runs now)
--
-- a) Give the HitPay CEO access (they sign up on FD AI with this email):
--      insert into public.esop_members (company_id, email, role)
--      select id, lower('<ceo email>'), 'ceo' from public.esop_companies where slug = 'hitpay'
--      on conflict do nothing;
--
-- b) Remove the test rows and rename the company:
--      delete from public.esop_holders  where company_id = (select id from public.esop_companies where slug = 'hitpay') and id_no like 'TEST-%';   -- all test holders
--      delete from public.esop_batches  where company_id = (select id from public.esop_companies where slug = 'hitpay') and batch = 99;   -- keep 1-10, check their start dates
--      update public.esop_companies set name = 'HitPay' where slug = 'hitpay';
--
-- c) Add the real batches (vesting start dates), then the holders: on the
--    page, "Import CSV" (admins) takes the same columns as the Google Sheet.
--
-- Checks:
--   select slug, name, plan from public.esop_companies;
--   select batch, vesting_start, tranches from public.esop_batches order by batch;
--   select name, batch, status, leaver_type from public.esop_holders order by status, batch, name;
-- ============================================================================
