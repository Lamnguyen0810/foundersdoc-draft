-- 117  ESOP: approve from the email (no login)
--
-- Run once in Supabase (SQL editor), after 105-116. Safe to run again.
--
-- WHY. Rachel (4 Nov): Aditya should not have to sign in. The approval email
-- says everything in plain words (who gets a certificate, how many options,
-- leavers, totals); he taps "Approve issuance of Option Certificates", then
-- Confirm on a one-button page. Only signing opens the platform (FD Sign).
--
-- HOW. Each approval email carries a private link (32 random bytes; only the
-- SHA-256 is stored here). The link:
--   * belongs to one vesting (e.g. Batch 8, Tranche 2) and one email address
--   * works once, and stops working 30 days after the vesting date
--   * stops working if the vesting was reset in a simulation after it was sent
--   * records when it was opened and used, the IP and browser (audit trail)
-- The tap only OPENS the page: email security scanners open every link, so
-- approving needs the Confirm button (a form POST, which scanners don't do).
--
-- Approving by link runs exactly the same steps as the dashboard button
-- (esop_approve_core): same certificate numbers, same hand-over to Zapier.
--
-- WHO CAN CALL WHAT.
--   esop_approval_link_new(key, ...)   Zapier's daily alert (company key, like esop_due)
--   esop_approval_link_admin(...)       the dashboard's "Email approval" button (server only)
--   esop_approval_link_view / _use      the approval page (server only)

-- 1. Links ------------------------------------------------------------------------
create table if not exists public.esop_approval_links (
  id          uuid primary key default gen_random_uuid(),
  token_hash  text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  ref         text not null check (ref ~ '^B[0-9]{1,3}-T[0-9]{1,2}$'),
  email       text not null,
  name        text,
  created_by  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  opened_at   timestamptz,
  used_at     timestamptz,
  used_ip     text,
  used_ua     text
);
create index if not exists esop_approval_links_ref on public.esop_approval_links (company_id, ref, created_at desc);
alter table public.esop_approval_links enable row level security;
revoke all on public.esop_approval_links from public, anon, authenticated;

-- 2. The approval itself, shared by the dashboard button and the email link --------
create or replace function public.esop_approve_core(p_company uuid, p_ref text, p_who text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.esop_companies;
  v_ref    text := upper(coalesce(p_ref, ''));
  v_batch  int;
  v_tr     int;
  r        public.esop_tranche_runs;
  h        record;
begin
  select * into c from public.esop_companies where id = p_company;
  if c.id is null then raise exception 'bad ref'; end if;
  if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad ref'; end if;
  v_batch := split_part(substr(v_ref, 2), '-T', 1)::int;
  v_tr := split_part(v_ref, '-T', 2)::int;
  if public.esop_item(c.id, v_batch, v_tr) is null then raise exception 'bad ref'; end if;

  -- One approval per Ref. Approved but never handed to Zapier = can be sent again (same numbers).
  select * into r from public.esop_tranche_runs where company_id = c.id and ref = v_ref for update;
  if r.ref is not null and r.sent_at is not null then raise exception 'already sent'; end if;
  if r.ref is null then
    insert into public.esop_tranche_runs (company_id, ref, approved_by) values (c.id, v_ref, left(p_who, 200));
  end if;

  -- Running certificate numbers, in name order, for holders without one yet.
  perform 1 from public.esop_companies where id = c.id for update;
  for h in
    select x.id from public.esop_holders x
    where x.company_id = c.id and x.batch = v_batch and x.status = 'Active'
      and not exists (select 1 from public.esop_certificates ec where ec.company_id = c.id and ec.ref = v_ref and ec.holder_id = x.id)
    order by x.name
  loop
    insert into public.esop_certificates (company_id, ref, holder_id, number)
    values (c.id, v_ref, h.id, (select next_certificate_no from public.esop_companies where id = c.id));
    update public.esop_companies set next_certificate_no = next_certificate_no + 1 where id = c.id;
  end loop;

  return public.esop_item(c.id, v_batch, v_tr)
      || jsonb_build_object('company', c.name, 'slug', c.slug, 'company_id', c.id, 'approved_by', coalesce(r.approved_by, left(p_who, 200)));
end $$;
revoke all on function public.esop_approve_core(uuid, text, text) from public, anon, authenticated;

-- The dashboard button (107) now uses the shared steps; same checks as before.
create or replace function public.esop_approve(p_slug text, p_ref text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.esop_companies;
begin
  select * into c from public.esop_companies where slug = p_slug;
  if c.id is null or not public.esop_can_approve(c.id) then raise exception 'not allowed'; end if;
  return public.esop_approve_core(c.id, p_ref, lower(coalesce(auth.jwt() ->> 'email', ''))) - 'company_id';
end $$;
revoke all on function public.esop_approve(text, text) from public, anon;
grant execute on function public.esop_approve(text, text) to authenticated;

-- 3. Make a link ----------------------------------------------------------------------
-- p_once_hours > 0: skip if a link for this vesting was made in the last N hours
-- (the daily alert can run more than once without emailing Aditya twice).
create or replace function public.esop_approval_link_make(p_company uuid, p_ref text, p_token_hash text, p_by text, p_once_hours int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.esop_companies;
  v_ref    text := upper(coalesce(p_ref, ''));
  v_item   jsonb;
  v_email  text;
  v_exp    timestamptz;
begin
  select * into c from public.esop_companies where id = p_company;
  if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad ref'; end if;
  v_item := public.esop_item(c.id, split_part(substr(v_ref, 2), '-T', 1)::int, split_part(v_ref, '-T', 2)::int);
  if v_item is null then raise exception 'bad ref'; end if;
  if (v_item ->> 'done')::boolean then raise exception 'already approved'; end if;
  if jsonb_array_length(v_item -> 'holders') = 0 then raise exception 'no certificates'; end if;
  v_email := coalesce(c.email_override, c.contact_email);
  if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'no contact email'; end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'bad token'; end if;

  if coalesce(p_once_hours, 0) > 0 and exists (
    select 1 from public.esop_approval_links
     where company_id = c.id and ref = v_ref and created_at > now() - make_interval(hours => p_once_hours)
  ) then
    return jsonb_build_object('skipped', true, 'ref', v_ref);
  end if;

  -- 30 days after the vesting date, and never less than 3 days from now
  v_exp := greatest(((v_item ->> 'vest_date')::date + 30)::timestamptz, now() + interval '3 days');
  insert into public.esop_approval_links (token_hash, company_id, ref, email, name, created_by, expires_at)
  values (p_token_hash, c.id, v_ref, lower(v_email), nullif(coalesce(c.contact_name, c.director_name), ''), left(p_by, 200), v_exp);

  return v_item || jsonb_build_object('skipped', false, 'company', c.name, 'to', lower(v_email),
                                      'to_name', coalesce(nullif(c.contact_name, ''), nullif(c.director_name, ''), ''),
                                      'expires_at', v_exp);
end $$;
revoke all on function public.esop_approval_link_make(uuid, text, text, text, int) from public, anon, authenticated;

-- Zapier's daily alert (company key, checked like esop_due)
create or replace function public.esop_approval_link_new(p_key text, p_slug text, p_ref text, p_token_hash text, p_once_hours int default 20)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.esop_companies;
begin
  c := public.esop_company_for_key(p_key, p_slug);
  return public.esop_approval_link_make(c.id, p_ref, p_token_hash, 'Zapier alert', p_once_hours);
end $$;
revoke all on function public.esop_approval_link_new(text, text, text, text, int) from public;
grant execute on function public.esop_approval_link_new(text, text, text, text, int) to anon, authenticated;

-- The dashboard's "Email approval" button (the API checks the admin first)
create or replace function public.esop_approval_link_admin(p_slug text, p_ref text, p_token_hash text, p_by text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.esop_companies;
begin
  select * into c from public.esop_companies where slug = p_slug;
  if c.id is null then raise exception 'bad ref'; end if;
  return public.esop_approval_link_make(c.id, p_ref, p_token_hash, p_by, 0);
end $$;
revoke all on function public.esop_approval_link_admin(text, text, text, text) from public, anon, authenticated;

-- 4. Open and use a link (the approval page) -----------------------------------------------
-- status: ok | approved | expired | invalid
create or replace function public.esop_approval_link_view(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l       public.esop_approval_links;
  c       public.esop_companies;
  v_item  jsonb;
  v_reset timestamptz;
  v_status text;
begin
  select * into l from public.esop_approval_links where token_hash = p_token_hash;
  if l.id is null then return jsonb_build_object('status', 'invalid'); end if;
  select * into c from public.esop_companies where id = l.company_id;
  v_item := public.esop_item(c.id, split_part(substr(l.ref, 2), '-T', 1)::int, split_part(l.ref, '-T', 2)::int);
  if v_item is null then return jsonb_build_object('status', 'invalid'); end if;
  v_reset := (select max(reset_at) from public.esop_sim_resets s where s.company_id = c.id and s.ref = l.ref);

  v_status := case
    when (v_item ->> 'done')::boolean then 'approved'
    when l.used_at is not null then 'expired'          -- used, then the vesting was reset
    when v_reset is not null and v_reset > l.created_at then 'expired'
    when l.expires_at < now() then 'expired'
    else 'ok' end;
  if l.opened_at is null then update public.esop_approval_links set opened_at = now() where id = l.id; end if;

  return v_item || jsonb_build_object('status', v_status, 'company', c.name, 'to', l.email, 'to_name', coalesce(l.name, ''), 'expires_at', l.expires_at);
end $$;
revoke all on function public.esop_approval_link_view(text) from public, anon, authenticated;

create or replace function public.esop_approval_link_use(p_token_hash text, p_ip text, p_ua text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l      public.esop_approval_links;
  v_view jsonb;
  v_out  jsonb;
begin
  select * into l from public.esop_approval_links where token_hash = p_token_hash for update;
  if l.id is null then raise exception 'invalid link'; end if;
  v_view := public.esop_approval_link_view(p_token_hash);
  if v_view ->> 'status' = 'approved' then raise exception 'already approved'; end if;
  if v_view ->> 'status' <> 'ok' then raise exception 'expired link'; end if;

  v_out := public.esop_approve_core(l.company_id, l.ref, l.email || ' (email)');
  update public.esop_approval_links set used_at = now(), used_ip = left(p_ip, 64), used_ua = left(p_ua, 300) where id = l.id;
  return v_out;
end $$;
revoke all on function public.esop_approval_link_use(text, text, text) from public, anon, authenticated;

do $$ begin raise notice 'OK    ESOP email approval ready (links: %)', (select count(*) from public.esop_approval_links); end $$;

-- Checks:
--   select ref, email, created_by, created_at, opened_at, used_at, expires_at from public.esop_approval_links order by created_at desc;
