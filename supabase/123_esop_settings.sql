-- 123  ESOP dashboards for any company: settings the client changes, and self sign-up
--
-- Run once in Supabase (SQL editor), after 105-122. Safe to run again.
-- HitPay keeps working exactly as before: its alerts stay with the Zap (alert_days
-- stays empty), its approval hand-over stays the same, and nobody loses access.
--
-- SETTINGS (Rachel, 6 Nov 2026), for every dashboard:
--   Approver       who approves issuances        esop_members.approves (or role 'approver', 107)
--   Access         who can open the dashboard    esop_members: Admin ('ceo') / Editor ('editor') / View only ('viewer')
--                                                (107's 'approver' role reads as Editor + approver)
--   Holder access  holders see their own page    esop_companies.holder_access (Premium plan)
--   Alerts         who is told, and when         esop_members.alerts + esop_companies.alert_emails,
--                                                esop_companies.alert_days (e.g. {14,7,0} = 2 weeks, 1 week, the day)
-- SELF SIGN-UP: any signed-in FD AI user can create a dashboard for their company
--   (esop_create_company), up to 3 each; they become its Admin and approver.
--
-- WHO MAY DO WHAT
--   esop_can(c)         open it (unchanged, 105)
--   esop_can_edit(c)    add and change holders, batches, documents: everyone except View only
--   esop_can_manage(c)  change the settings: Admins ('ceo') and Founders Doc admins
--   esop_can_approve(c) approve: Founders Doc admins, role 'approver', or approves = true

-- 1. Columns -----------------------------------------------------------------------
alter table public.esop_companies add column if not exists self_serve boolean not null default false;
alter table public.esop_companies add column if not exists created_by text;
alter table public.esop_companies add column if not exists holder_access boolean not null default false;
alter table public.esop_companies add column if not exists alert_days int[];
alter table public.esop_companies add column if not exists alert_emails text[] not null default '{}';
alter table public.esop_members add column if not exists approves boolean not null default false;
alter table public.esop_members add column if not exists alerts boolean not null default false;
alter table public.esop_members drop constraint if exists esop_members_role_check;
alter table public.esop_members add constraint esop_members_role_check check (role in ('ceo', 'editor', 'viewer', 'approver'));

-- One row per alert sent, so a vesting is never announced twice for the same day
create table if not exists public.esop_alert_log (
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  ref         text not null,
  days_before int not null,
  sent_at     timestamptz not null default now(),
  recipients  int not null default 0,
  primary key (company_id, ref, days_before)
);
alter table public.esop_alert_log enable row level security;
revoke all on public.esop_alert_log from public, anon, authenticated;

-- 2. Who may do what ----------------------------------------------------------------
create or replace function public.esop_member_role(p_company uuid)
returns text language sql stable security definer set search_path = public as $$
  select m.role from public.esop_members m
   where m.company_id = p_company and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.esop_can_edit(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.esop_member_role(p_company) in ('ceo', 'editor', 'approver'), false)
$$;

create or replace function public.esop_can_manage(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.esop_member_role(p_company) = 'ceo', false)
$$;

create or replace function public.esop_can_approve(p_company uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or exists (
        select 1 from public.esop_members m
        where m.company_id = p_company
          and (m.role = 'approver' or m.approves)
          and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
$$;

revoke all on function public.esop_member_role(uuid), public.esop_can_edit(uuid), public.esop_can_manage(uuid), public.esop_can_approve(uuid) from public;
grant execute on function public.esop_member_role(uuid), public.esop_can_edit(uuid), public.esop_can_manage(uuid), public.esop_can_approve(uuid) to authenticated;

-- View only may read, not change (it could before: every member could edit)
drop policy if exists "esop batches: add" on public.esop_batches;
create policy "esop batches: add" on public.esop_batches for insert to authenticated with check (public.esop_can_edit(company_id));
drop policy if exists "esop batches: edit" on public.esop_batches;
create policy "esop batches: edit" on public.esop_batches for update to authenticated using (public.esop_can_edit(company_id)) with check (public.esop_can_edit(company_id));
drop policy if exists "esop holders: add" on public.esop_holders;
create policy "esop holders: add" on public.esop_holders for insert to authenticated with check (public.esop_can_edit(company_id));
drop policy if exists "esop holders: edit" on public.esop_holders;
create policy "esop holders: edit" on public.esop_holders for update to authenticated using (public.esop_can_edit(company_id)) with check (public.esop_can_edit(company_id));
drop policy if exists "esop documents: add" on public.esop_documents;
create policy "esop documents: add" on public.esop_documents
  for insert to authenticated with check (
    public.esop_can_edit(company_id)
    and (
      (holder_id is null and kind in ('esop_rules', 'resolution', 'other'))
      or exists (select 1 from public.esop_holders h where h.id = holder_id and h.company_id = esop_documents.company_id)
    )
  );

-- 3. Reading the settings: the people with access (any member may see the list) -----
create or replace function public.esop_members_list(p_company uuid)
returns table (email text, role text, approves boolean, alerts boolean, added_at timestamptz)
language sql stable security definer set search_path = public as $$
  select m.email, case when m.role = 'approver' then 'editor' else m.role end, m.approves or m.role = 'approver', m.alerts, m.added_at
    from public.esop_members m
   where m.company_id = p_company and public.esop_can(p_company)
   order by case m.role when 'ceo' then 0 when 'viewer' then 2 else 1 end, m.added_at
$$;
revoke all on function public.esop_members_list(uuid) from public;
grant execute on function public.esop_members_list(uuid) to authenticated;

-- 4. Changing the settings (Admins only) ---------------------------------------------
create or replace function public.esop_set_member(p_company uuid, p_email text, p_role text, p_approves boolean, p_alerts boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_old text;
begin
  if not public.esop_can_manage(p_company) then raise exception 'not allowed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(v_email) > 200 then raise exception 'bad email'; end if;
  if p_role not in ('ceo', 'editor', 'viewer') then raise exception 'bad role'; end if;
  select role into v_old from public.esop_members where company_id = p_company and email = v_email;
  -- never leave a dashboard without an Admin
  if v_old = 'ceo' and p_role <> 'ceo'
     and (select count(*) from public.esop_members where company_id = p_company and role = 'ceo') <= 1 then
    raise exception 'last admin';
  end if;
  if v_old is null and (select count(*) from public.esop_members where company_id = p_company) >= 50 then
    raise exception 'too many people';
  end if;
  insert into public.esop_members (company_id, email, role, approves, alerts)
  values (p_company, v_email, p_role, coalesce(p_approves, false), coalesce(p_alerts, false))  -- 'approver' rows become editor + approves
  on conflict (company_id, email) do update
     set role = excluded.role, approves = excluded.approves, alerts = excluded.alerts;
end $$;

create or replace function public.esop_remove_member(p_company uuid, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.esop_can_manage(p_company) then raise exception 'not allowed'; end if;
  if (select role from public.esop_members where company_id = p_company and email = v_email) = 'ceo'
     and (select count(*) from public.esop_members where company_id = p_company and role = 'ceo') <= 1 then
    raise exception 'last admin';
  end if;
  delete from public.esop_members where company_id = p_company and email = v_email;
end $$;

create or replace function public.esop_save_settings(p_company uuid, p_alert_days int[], p_alert_emails text[], p_holder_access boolean, p_option_pool bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_days int[];
  v_emails text[];
begin
  if not public.esop_can_manage(p_company) then raise exception 'not allowed'; end if;
  select * into c from public.esop_companies where id = p_company;
  if c.id is null then raise exception 'not found'; end if;
  select array_agg(distinct d order by d desc) into v_days from unnest(coalesce(p_alert_days, '{}')) d where d between 0 and 60;
  if coalesce(array_length(v_days, 1), 0) > 5 then raise exception 'too many alerts'; end if;
  select array_agg(distinct lower(trim(e))) into v_emails from unnest(coalesce(p_alert_emails, '{}')) e
   where lower(trim(e)) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$';
  if coalesce(array_length(v_emails, 1), 0) > 10 then raise exception 'too many emails'; end if;
  -- holders' own page is a Premium feature; Founders Doc can switch it on for anyone
  if coalesce(p_holder_access, false) and not c.holder_access and coalesce(c.plan, 'free') <> 'premium' and not public.is_admin() then
    raise exception 'premium';
  end if;
  if p_option_pool is not null and p_option_pool < 0 then raise exception 'bad pool'; end if;
  update public.esop_companies
     set alert_days = v_days,
         alert_emails = coalesce(v_emails, '{}'),
         holder_access = coalesce(p_holder_access, false),
         option_pool = coalesce(p_option_pool, option_pool)
   where id = p_company;
end $$;

revoke all on function public.esop_set_member(uuid, text, text, boolean, boolean), public.esop_remove_member(uuid, text),
  public.esop_save_settings(uuid, int[], text[], boolean, bigint) from public;
grant execute on function public.esop_set_member(uuid, text, text, boolean, boolean), public.esop_remove_member(uuid, text),
  public.esop_save_settings(uuid, int[], text[], boolean, bigint) to authenticated;

-- 5. Self sign-up: create a dashboard for your own company ----------------------------
create or replace function public.esop_create_company(p_name text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text := trim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  v_base text;
  v_slug text;
  v_id uuid;
  n int := 1;
begin
  if v_email = '' then raise exception 'sign in'; end if;
  if length(v_name) < 2 or length(v_name) > 80 then raise exception 'bad name'; end if;
  if (select count(*) from public.esop_companies where created_by = v_email) >= 3 and not public.is_admin() then
    raise exception 'limit';
  end if;
  v_base := trim(both '-' from left(regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g'), 36));
  if length(v_base) < 2 then v_base := 'company'; end if;
  v_slug := v_base;
  while exists (select 1 from public.esop_companies where slug = v_slug) or v_slug in ('hitpay', 'new', 'settings', 'demo', 'admin') loop
    n := n + 1;
    v_slug := v_base || '-' || n;
  end loop;
  insert into public.esop_companies (slug, name, plan, self_serve, created_by, alert_days)
  values (v_slug, v_name, 'free', true, v_email, '{7,0}')
  returning id into v_id;
  insert into public.esop_members (company_id, email, role, approves, alerts) values (v_id, v_email, 'ceo', true, true);
  return v_slug;
end $$;
revoke all on function public.esop_create_company(text) from public;
grant execute on function public.esop_create_company(text) to authenticated;

do $$ begin
  raise notice 'OK    ESOP settings ready · % dashboard(s), % self sign-up · % people with access',
    (select count(*) from public.esop_companies),
    (select count(*) from public.esop_companies where self_serve),
    (select count(*) from public.esop_members);
end $$;
