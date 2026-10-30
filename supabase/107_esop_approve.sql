-- ============================================================================
-- 107 — ESOP: approve on the dashboard, running certificate numbers
--
-- Rachel approves a vesting with a button on the dashboard (Vesting schedule
-- tab) instead of a Slack reaction. The button calls /api/esop/approve, which
-- runs esop_approve() with her own session and then hands the result to
-- Zapier (payment link, certificates, emails).
--
--   esop_can_approve(company)   FD admins, or a member with role 'approver'
--                               (e.g. Aditya, once added). The CEO's role
--                               'ceo' can see but not approve.
--   esop_approve(company, ref)  checks who is asking, refuses a Ref that was
--                               already sent, records who approved and when,
--                               and gives each active holder the next
--                               certificate number (a running number, like
--                               the precedent's "Option Certificate No.: 44").
--                               Numbers are kept, so a resend reuses them.
--   esop_mark_sent(company, ref) after Zapier accepted the hand-over.
--   esop_record(... 'payment' / 'alert')  Zapier writes back the payment link
--                               and the Slack alert's timestamp (so replies go
--                               in the alert's thread).
--
-- Also: holders get nationality and grant date (both printed on the
-- certificate); esop_due returns them and the real certificate numbers.
--
-- Set the first number once, e.g. for HitPay after certificate No. 44:
--   update public.esop_companies set next_certificate_no = 45 where slug = 'hitpay';
--
-- Safe to run twice. Run after 106.
-- ============================================================================

-- 1. New columns and tables ----------------------------------------------------------
alter table public.esop_holders add column if not exists nationality text check (nationality is null or length(nationality) <= 80);
alter table public.esop_holders add column if not exists grant_date date;
alter table public.esop_companies add column if not exists next_certificate_no int not null default 1 check (next_certificate_no between 1 and 1000000);
alter table public.esop_companies add column if not exists share_class text not null default 'Class B';
alter table public.esop_companies add column if not exists legal_name text;
alter table public.esop_companies add column if not exists reg_no text;
alter table public.esop_companies add column if not exists director_name text;

alter table public.esop_members drop constraint if exists esop_members_role_check;
alter table public.esop_members add constraint esop_members_role_check check (role in ('ceo', 'viewer', 'approver'));

alter table public.esop_tranche_runs add column if not exists sent_at timestamptz;
alter table public.esop_tranche_runs add column if not exists payment_link text;

create table if not exists public.esop_certificates (
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  ref         text not null,
  holder_id   uuid not null references public.esop_holders (id) on delete cascade,
  number      int  not null,
  created_at  timestamptz not null default now(),
  primary key (company_id, ref, holder_id),
  unique (company_id, number)
);
alter table public.esop_certificates enable row level security;
drop policy if exists "esop certificates: read" on public.esop_certificates;
create policy "esop certificates: read" on public.esop_certificates
  for select to authenticated using (public.esop_can(company_id));
grant select on public.esop_certificates to authenticated;

create table if not exists public.esop_alerts (
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  ref         text not null,
  slack_ts    text not null check (length(slack_ts) <= 40),
  posted_at   timestamptz not null default now(),
  primary key (company_id, ref)
);
alter table public.esop_alerts enable row level security;
revoke all on public.esop_alerts from public, anon, authenticated;

-- HitPay: the details printed on its certificates (the company's public
-- register details, as on the precedent). Only filled if still empty.
update public.esop_companies
   set legal_name = coalesce(legal_name, 'HITPAY PAYMENT SOLUTIONS PTE. LTD.'),
       reg_no = coalesce(reg_no, '201605883W'),
       director_name = coalesce(director_name, 'Aditya Haripurkar'),
       next_certificate_no = case when next_certificate_no = 1 then 45 else next_certificate_no end
 where slug = 'hitpay';

-- 2. Who may approve ----------------------------------------------------------------------
create or replace function public.esop_can_approve(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
      or exists (
        select 1 from public.esop_members m
        where m.company_id = p_company and m.role = 'approver'
          and m.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      );
$$;
revoke all on function public.esop_can_approve(uuid) from public;
grant execute on function public.esop_can_approve(uuid) to authenticated;

-- 3. One vesting (batch + tranche) as JSON — shared by esop_due and esop_approve ---------
create or replace function public.esop_item(p_company uuid, p_batch int, p_tranche int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c       public.esop_companies;
  b       public.esop_batches;
  v_ref   text := 'B' || p_batch || '-T' || p_tranche;
  v_vest  date;
  v_today date := (now() at time zone 'Asia/Singapore')::date;
  r       public.esop_tranche_runs;
begin
  select * into c from public.esop_companies where id = p_company;
  select * into b from public.esop_batches where company_id = p_company and batch = p_batch;
  if b.vesting_start is null or p_tranche < 1 or p_tranche > b.tranches then return null; end if;
  v_vest := (b.vesting_start + make_interval(years => p_tranche))::date;
  select * into r from public.esop_tranche_runs where company_id = p_company and esop_tranche_runs.ref = v_ref;

  return jsonb_build_object(
    'ref', v_ref,
    'batch', p_batch,
    'tranche', p_tranche,
    'vest_date', v_vest,
    'vest_date_text', to_char(v_vest, 'FMDD Mon YYYY'),
    'days_left', v_vest - v_today,
    'done', r.ref is not null,
    'approved_by', r.approved_by,
    'approved_at', r.approved_at,
    'sent', r.sent_at is not null,
    'invoice_no', coalesce(r.payment_link, r.invoice_no),
    'payment_link', r.payment_link,
    'company_legal_name', coalesce(c.legal_name, c.name),
    'company_reg_no', coalesce(c.reg_no, ''),
    'director_name', coalesce(c.director_name, ''),
    'share_class', c.share_class,
    'slack_ts', (select a.slack_ts from public.esop_alerts a where a.company_id = p_company and a.ref = v_ref),
    'holders', coalesce((
      select jsonb_agg(jsonb_build_object(
               'holder_id', h.id,
               'name', h.name,
               'email', coalesce(h.email, ''),
               'id_no', coalesce(h.id_no, ''),
               'nationality', coalesce(h.nationality, ''),
               'grant_date_text', coalesce(to_char(h.grant_date, 'FMDD FMMonth YYYY'), ''),
               'options', h.options_per_tranche,
               'certificate_no', coalesce((select ec.number::text from public.esop_certificates ec
                                            where ec.company_id = p_company and ec.ref = v_ref and ec.holder_id = h.id), '')
             ) order by h.name)
      from public.esop_holders h
      where h.company_id = p_company and h.batch = p_batch and h.status = 'Active'
    ), '[]'::jsonb),
    'leavers', coalesce((
      select jsonb_agg(jsonb_build_object('name', l.name, 'leaver_type', coalesce(l.leaver_type, 'Good'), 'last_day', l.last_day) order by l.name)
      from public.esop_holders l
      where l.company_id = p_company and l.batch = p_batch and l.status = 'Leaver'
    ), '[]'::jsonb)
  );
end $$;
revoke all on function public.esop_item(uuid, int, int) from public, anon, authenticated;

-- esop_due (106) now returns the same item shape.
create or replace function public.esop_due(p_key text, p_slug text, p_days int default 7, p_ref text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c        public.esop_companies;
  v_today  date := (now() at time zone 'Asia/Singapore')::date;
  v_target date;
  v_items  jsonb := '[]'::jsonb;
  t        record;
begin
  c := public.esop_company_for_key(p_key, p_slug);
  v_target := v_today + greatest(0, least(coalesce(p_days, 7), 60));
  for t in
    select b.batch, g.tranche
    from public.esop_batches b
    cross join lateral generate_series(1, b.tranches) as g(tranche)
    where b.company_id = c.id and b.vesting_start is not null
      and (
        (p_ref is not null and 'B' || b.batch || '-T' || g.tranche = upper(p_ref))
        or (p_ref is null and (b.vesting_start + make_interval(years => g.tranche))::date = v_target)
      )
    order by (b.vesting_start + make_interval(years => g.tranche)), 1, 2
  loop
    v_items := v_items || public.esop_item(c.id, t.batch, t.tranche);
  end loop;
  return jsonb_build_object('company', c.name, 'slug', c.slug, 'today', v_today, 'target', case when p_ref is null then v_target end, 'items', v_items);
end $$;
revoke all on function public.esop_due(text, text, int, text) from public;
grant execute on function public.esop_due(text, text, int, text) to anon, authenticated;

-- 4. Approve (dashboard button) ---------------------------------------------------------------
create or replace function public.esop_approve(p_slug text, p_ref text)
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
  v_who    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_item   jsonb;
begin
  select * into c from public.esop_companies where slug = p_slug;
  if c.id is null or not public.esop_can_approve(c.id) then raise exception 'not allowed'; end if;
  if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad ref'; end if;
  v_batch := split_part(substr(v_ref, 2), '-T', 1)::int;
  v_tr := split_part(v_ref, '-T', 2)::int;
  if public.esop_item(c.id, v_batch, v_tr) is null then raise exception 'bad ref'; end if;

  -- One approval per Ref. A Ref that was approved but never reached Zapier can
  -- be sent again (same numbers); one that was sent cannot.
  select * into r from public.esop_tranche_runs where company_id = c.id and ref = v_ref for update;
  if r.ref is not null and r.sent_at is not null then raise exception 'already sent'; end if;
  if r.ref is null then
    insert into public.esop_tranche_runs (company_id, ref, approved_by) values (c.id, v_ref, v_who);
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

  v_item := public.esop_item(c.id, v_batch, v_tr);
  return v_item || jsonb_build_object('company', c.name, 'slug', c.slug, 'approved_by', coalesce(r.approved_by, v_who));
end $$;
revoke all on function public.esop_approve(text, text) from public, anon;
grant execute on function public.esop_approve(text, text) to authenticated;

create or replace function public.esop_mark_sent(p_slug text, p_ref text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.esop_companies;
begin
  select * into c from public.esop_companies where slug = p_slug;
  if c.id is null or not public.esop_can_approve(c.id) then raise exception 'not allowed'; end if;
  update public.esop_tranche_runs set sent_at = now() where company_id = c.id and ref = upper(p_ref);
end $$;
revoke all on function public.esop_mark_sent(text, text) from public, anon;
grant execute on function public.esop_mark_sent(text, text) to authenticated;

-- What the Vesting schedule tab shows: approvals for this company.
create or replace function public.esop_runs(p_slug text)
returns table (ref text, approved_by text, approved_at timestamptz, sent_at timestamptz, payment_link text, can_approve boolean)
language sql
stable
security definer
set search_path = public
as $$
  select r.ref, r.approved_by, r.approved_at, r.sent_at, r.payment_link, public.esop_can_approve(c.id)
  from public.esop_companies c
  left join public.esop_tranche_runs r on r.company_id = c.id
  where c.slug = p_slug and public.esop_can(c.id);
$$;
revoke all on function public.esop_runs(text) from public, anon;
grant execute on function public.esop_runs(text) to authenticated;

-- 5. Zapier writes back: payment link and the alert's Slack timestamp -----------------------
create or replace function public.esop_record(p_key text, p_slug text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        public.esop_companies;
  v_action text := p_payload ->> 'action';
  v_ref    text := upper(coalesce(p_payload ->> 'ref', ''));
  v_holder uuid;
  v_url    text := p_payload ->> 'url';
  v_num    text := left(coalesce(p_payload ->> 'number', ''), 80);
  v_tr     int;
  v_new    boolean;
begin
  c := public.esop_company_for_key(p_key, p_slug);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 5000 then
    raise exception 'bad payload';
  end if;

  if v_action in ('approved', 'payment', 'alert') and v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then
    raise exception 'bad payload';
  end if;

  if v_action = 'approved' then
    insert into public.esop_tranche_runs (company_id, ref, approved_by, invoice_no)
    values (c.id, v_ref, left(p_payload ->> 'approved_by', 120), left(p_payload ->> 'invoice_no', 60))
    on conflict (company_id, ref) do nothing
    returning true into v_new;
    return jsonb_build_object('ok', true, 'ref', v_ref, 'first_time', coalesce(v_new, false));
  end if;

  if v_action = 'payment' then
    if v_url is null or v_url !~ '^https://' or length(v_url) > 500 then raise exception 'bad payload'; end if;
    update public.esop_tranche_runs set payment_link = v_url where company_id = c.id and ref = v_ref;
    return jsonb_build_object('ok', true, 'ref', v_ref);
  end if;

  if v_action = 'alert' then
    if coalesce(p_payload ->> 'slack_ts', '') !~ '^[0-9]{6,12}\.[0-9]{1,8}$' then raise exception 'bad payload'; end if;
    insert into public.esop_alerts (company_id, ref, slack_ts) values (c.id, v_ref, p_payload ->> 'slack_ts')
    on conflict (company_id, ref) do update set slack_ts = excluded.slack_ts, posted_at = now();
    return jsonb_build_object('ok', true, 'ref', v_ref);
  end if;

  if v_action = 'certificate' then
    begin
      v_holder := (p_payload ->> 'holder_id')::uuid;
      v_tr := nullif(p_payload ->> 'tranche', '')::int;
    exception when others then
      raise exception 'bad payload';
    end;
    if v_url is null or v_url !~ '^https://' or length(v_url) > 1000 then raise exception 'bad payload'; end if;
    if not exists (select 1 from public.esop_holders where id = v_holder and company_id = c.id) then raise exception 'bad payload'; end if;
    if exists (select 1 from public.esop_documents where holder_id = v_holder and kind = 'certificate' and url = v_url) then
      return jsonb_build_object('ok', true, 'duplicate', true);
    end if;
    insert into public.esop_documents (company_id, holder_id, kind, tranche, path, url, file_name, uploaded_by)
    values (c.id, v_holder, 'certificate', case when v_tr between 1 and 10 then v_tr end, null, v_url,
            'Option Certificate No. ' || coalesce(nullif(v_num, ''), '?'), 'Zapier');
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'bad payload';
end $$;
revoke all on function public.esop_record(text, text, jsonb) from public;
grant execute on function public.esop_record(text, text, jsonb) to anon, authenticated;

do $$ begin raise notice 'OK    ESOP approvals ready (next HitPay certificate No. %)', (select next_certificate_no from public.esop_companies where slug = 'hitpay'); end $$;

-- Checks:
--   select ref, approved_by, approved_at, sent_at, payment_link from public.esop_tranche_runs;
--   select ref, number from public.esop_certificates order by number;
-- To run B99-T1 again in a test (keeps numbers unless you also delete them):
--   delete from public.esop_tranche_runs where ref = 'B99-T1';
--   delete from public.esop_certificates where ref = 'B99-T1';
