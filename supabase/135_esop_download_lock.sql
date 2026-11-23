-- ============================================================================
-- 135 — ESOP dashboard: opening and downloading documents is a paid feature
--
-- Run once in Supabase (SQL editor), after 123. Safe to run twice.
--
-- WHY. Rachel, 23 Nov 2026: a client's login on a dashboard Founders Doc keeps for
-- them is free to VIEW (option holders, tranches, vesting dates, which documents
-- are on file). To open or download a document they subscribe monthly, or pay for
-- the download. The page already holds this back (0263), but a page is not a lock:
-- anyone with a login could ask the storage for a file directly. This makes the
-- database itself say no.
--
-- WHO MAY READ A FILE in the private bucket 'esop-docs' after this:
--   Founders Doc admins                          always
--   a company's own dashboard (self_serve, 123)  its members, as before
--   plan = 'premium'                             its members
--   a paid pass (downloads_until in the future)  its members, until that moment
-- Everyone else: no. Uploading is unchanged. The website's own server (signing,
-- filing, a holder's private page) is not affected: it does not use these rules.
--
-- TO OPEN DOWNLOADS FOR A CLIENT (after they pay):
--   monthly:       update public.esop_companies set plan = 'premium' where slug = 'hitpay';
--   pay to download, e.g. for 7 days:
--                  update public.esop_companies set downloads_until = now() + interval '7 days' where slug = 'hitpay';
--   back to locked: update public.esop_companies set plan = 'free', downloads_until = null where slug = 'hitpay';
-- ============================================================================

alter table public.esop_companies add column if not exists downloads_until timestamptz;

create or replace function public.esop_can_download(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or (
        public.esop_can(p_company)
        and exists (
          select 1 from public.esop_companies c
           where c.id = p_company
             and (c.self_serve or c.plan = 'premium' or (c.downloads_until is not null and c.downloads_until > now()))
        )
      );
$$;
revoke all on function public.esop_can_download(uuid) from public;
grant execute on function public.esop_can_download(uuid) to authenticated;

-- the company is the first folder of a file's path (105)
create or replace function public.esop_can_read_path(p_name text)
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
  return public.esop_can_download(v_company);
end $$;
revoke all on function public.esop_can_read_path(text) from public;
grant execute on function public.esop_can_read_path(text) to authenticated;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    drop policy if exists "esop-docs: read" on storage.objects;
    create policy "esop-docs: read" on storage.objects
      for select to authenticated using (bucket_id = 'esop-docs' and public.esop_can_read_path(name));
    raise notice 'OK    esop-docs: files open only for Founders Doc, own dashboards, Premium, or a paid pass';
  else
    raise notice 'SKIP  no storage schema here';
  end if;
end $$;

do $$
declare
  n int;
begin
  select count(*) into n from public.esop_companies c where not c.self_serve and c.plan <> 'premium' and (c.downloads_until is null or c.downloads_until <= now());
  raise notice 'OK    ESOP download lock ready. Dashboards we keep that are view only for their logins: %', n;
end $$;
