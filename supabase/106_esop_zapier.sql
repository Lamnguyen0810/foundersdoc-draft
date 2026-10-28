-- ============================================================================
-- 106 — ESOP: one list for the dashboard AND the Slack alerts (Zapier)
--
-- Until now the alerts read a Google Sheet while the dashboard (105) kept its
-- own list, so a holder added or archived on the dashboard was invisible to
-- the alerts. From here the dashboard is the only list:
--
--   esop_due(key, company, days, ref)   who vests on a date (today + days),
--                                        or for one Ref such as 'B99-T1':
--                                        holders who get a certificate,
--                                        leavers who do not, a certificate
--                                        number for each, and whether this
--                                        Ref was already approved
--   esop_record(key, company, payload)   Zapier writes back:
--                                        {"action":"approved","ref":..,"invoice_no":..,"approved_by":..}
--                                        {"action":"certificate","holder_id":..,"tranche":..,"url":..,"number":..}
--                                        (the certificate then shows in the
--                                        dashboard's Option certificates cell)
--
-- Both are called only by FD AI's /api/esop/zap routes, with a private key per
-- company (stored hashed in esop_zap_keys, which nobody can read). Set it once in the SQL editor:
--   select public.set_esop_zap_key('hitpay', '<a long random key>');
-- and put the same key in Zapier (Authorization: Bearer <key>).
--
-- Certificate numbers: <SLUG>-B<batch>-T<tranche>-<nnn> (holders in name
-- order), e.g. HITPAY-B99-T1-001. A placeholder until Rachel sets the rule.
--
-- Safe to run twice. Run after 105.
-- ============================================================================

-- 1. Key, approvals, links -------------------------------------------------------------
-- Kept in a table of its own with no grants and no policies, so nobody can
-- read even the hash; only the functions below (security definer) use it.
create table if not exists public.esop_zap_keys (
  company_id  uuid primary key references public.esop_companies (id) on delete cascade,
  key_hash    text not null,
  set_at      timestamptz not null default now()
);
alter table public.esop_zap_keys enable row level security;
revoke all on public.esop_zap_keys from public, anon, authenticated;

create table if not exists public.esop_tranche_runs (
  company_id   uuid not null references public.esop_companies (id) on delete cascade,
  ref          text not null check (ref ~ '^B[0-9]{1,3}-T[0-9]{1,2}$'),
  approved_at  timestamptz not null default now(),
  approved_by  text,
  invoice_no   text,
  primary key (company_id, ref)
);
alter table public.esop_tranche_runs enable row level security;
drop policy if exists "esop runs: read" on public.esop_tranche_runs;
create policy "esop runs: read" on public.esop_tranche_runs
  for select to authenticated using (public.esop_can(company_id));
drop policy if exists "esop runs: admins" on public.esop_tranche_runs;
create policy "esop runs: admins" on public.esop_tranche_runs
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select, insert, update, delete on public.esop_tranche_runs to authenticated;

-- A document can now be a link (a certificate made by Zapier in Google Docs)
-- instead of an uploaded file.
alter table public.esop_documents add column if not exists url text;
alter table public.esop_documents alter column path drop not null;
alter table public.esop_documents drop constraint if exists esop_documents_file_or_link;
alter table public.esop_documents add constraint esop_documents_file_or_link
  check (path is not null or (url is not null and url ~ '^https://'));

-- 2. Setting the key (SQL editor only) ----------------------------------------------------
create or replace function public.set_esop_zap_key(p_slug text, p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) < 24 then
    raise exception 'Use a key of at least 24 characters.';
  end if;
  insert into public.esop_zap_keys (company_id, key_hash)
  select id, encode(sha256(convert_to(p_key, 'UTF8')), 'hex') from public.esop_companies where slug = p_slug
  on conflict (company_id) do update set key_hash = excluded.key_hash, set_at = now();
  if not found then raise exception 'No company %', p_slug; end if;
  return 'ESOP Zapier key set for ' || p_slug || '.';
end $$;
revoke all on function public.set_esop_zap_key(text, text) from public, anon, authenticated;

create or replace function public.esop_company_for_key(p_key text, p_slug text)
returns public.esop_companies
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c      public.esop_companies;
  v_hash text;
begin
  select * into c from public.esop_companies where slug = p_slug;
  select key_hash into v_hash from public.esop_zap_keys where company_id = c.id;
  if c.id is null or v_hash is null or p_key is null
     or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> v_hash then
    raise exception 'not allowed';
  end if;
  return c;
end $$;
revoke all on function public.esop_company_for_key(text, text) from public, anon, authenticated;

-- 3. Who vests --------------------------------------------------------------------------
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
    select b.batch, g.tranche, (b.vesting_start + make_interval(years => g.tranche))::date as vest_date
    from public.esop_batches b
    cross join lateral generate_series(1, b.tranches) as g(tranche)
    where b.company_id = c.id and b.vesting_start is not null
      and (
        (p_ref is not null and 'B' || b.batch || '-T' || g.tranche = upper(p_ref))
        or (p_ref is null and (b.vesting_start + make_interval(years => g.tranche))::date = v_target)
      )
    order by 3, 1, 2
  loop
    v_items := v_items || jsonb_build_object(
      'ref', 'B' || t.batch || '-T' || t.tranche,
      'batch', t.batch,
      'tranche', t.tranche,
      'vest_date', t.vest_date,
      'vest_date_text', to_char(t.vest_date, 'FMDD Mon YYYY'),
      'days_left', t.vest_date - v_today,
      'done', exists (select 1 from public.esop_tranche_runs r where r.company_id = c.id and r.ref = 'B' || t.batch || '-T' || t.tranche),
      'invoice_no', (select r.invoice_no from public.esop_tranche_runs r where r.company_id = c.id and r.ref = 'B' || t.batch || '-T' || t.tranche),
      'holders', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'holder_id', h.id,
                 'name', h.name,
                 'email', coalesce(h.email, ''),
                 'id_no', coalesce(h.id_no, ''),
                 'options', h.options_per_tranche,
                 'certificate_no', upper(c.slug) || '-B' || t.batch || '-T' || t.tranche || '-' || lpad(h.n::text, 3, '0')
               ) order by h.name)
        from (
          select x.*, row_number() over (order by x.name) as n
          from public.esop_holders x
          where x.company_id = c.id and x.batch = t.batch and x.status = 'Active'
        ) h
      ), '[]'::jsonb),
      'leavers', coalesce((
        select jsonb_agg(jsonb_build_object('name', l.name, 'leaver_type', coalesce(l.leaver_type, 'Good'), 'last_day', l.last_day) order by l.name)
        from public.esop_holders l
        where l.company_id = c.id and l.batch = t.batch and l.status = 'Leaver'
      ), '[]'::jsonb)
    );
  end loop;

  return jsonb_build_object('company', c.name, 'slug', c.slug, 'today', v_today, 'target', case when p_ref is null then v_target end, 'items', v_items);
end $$;
revoke all on function public.esop_due(text, text, int, text) from public;
grant execute on function public.esop_due(text, text, int, text) to anon, authenticated;

-- 4. Zapier writes back -------------------------------------------------------------------
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
  v_num    text := left(coalesce(p_payload ->> 'number', 'Option certificate'), 80);
  v_tr     int;
  v_new    boolean;
begin
  c := public.esop_company_for_key(p_key, p_slug);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 5000 then
    raise exception 'bad payload';
  end if;

  if v_action = 'approved' then
    if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad payload'; end if;
    insert into public.esop_tranche_runs (company_id, ref, approved_by, invoice_no)
    values (c.id, v_ref, left(p_payload ->> 'approved_by', 120), left(p_payload ->> 'invoice_no', 60))
    on conflict (company_id, ref) do nothing
    returning true into v_new;
    return jsonb_build_object('ok', true, 'ref', v_ref, 'first_time', coalesce(v_new, false));
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
    values (c.id, v_holder, 'certificate', case when v_tr between 1 and 10 then v_tr end, null, v_url, 'Option Certificate ' || v_num, 'Zapier');
    return jsonb_build_object('ok', true);
  end if;

  raise exception 'bad payload';
end $$;
revoke all on function public.esop_record(text, text, jsonb) from public;
grant execute on function public.esop_record(text, text, jsonb) to anon, authenticated;

do $$
begin
  if exists (select 1 from public.esop_companies c where c.slug = 'hitpay'
             and not exists (select 1 from public.esop_zap_keys k where k.company_id = c.id)) then
    raise notice 'NEXT  select public.set_esop_zap_key(''hitpay'', ''<a long random key>''); then use the same key in Zapier.';
  else
    raise notice 'OK    ESOP Zapier functions ready';
  end if;
end $$;

-- Checks:
--   select ref, approved_at, invoice_no from public.esop_tranche_runs;
--   select file_name, url from public.esop_documents where url is not null;
-- To run a Ref again in a test: delete from public.esop_tranche_runs where ref = 'B99-T1';
