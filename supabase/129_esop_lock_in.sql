-- ============================================================================
-- 129 — ESOP lock-in: Confirm / Modify / Cancel, Paid ✓ lock, 2-week alerts
--
-- Run once in Supabase (SQL editor), after 117, 118, 123 and 126. Safe to run twice.
--
-- 1. CONFIRM / MODIFY / CANCEL. The approval email has three choices instead of one:
--      Confirm  approve, exactly as before (esop_approval_link_use)
--      Modify   the Director writes what to change; the vesting is paused
--      Cancel   this issuance stops; nothing is issued or charged
--    A Modify or Cancel is kept in esop_run_requests and uses up that email's link.
--    While a request is open the daily Zap does not email the Director again;
--    sending a fresh approval email (after the fix) or approving closes it.
--    Who is told (the website, lib/esop/respond.ts): a managed client (HitPay) →
--    Founders Doc; a self-serve dashboard → its Admins, with a copy to Founders Doc.
--
-- 2. PAID ✓ LOCK. esop_tranche_runs.paid_at. Set by a Founders Doc admin ("Mark as
--    paid" on the dashboard) or by a Zap when Stripe reports the payment
--    (esop_zap_paid). From then until every certificate of that tranche is signed in
--    FD Sign, the batch's holders are locked: their name, ID, nationality, grant
--    date, options, batch and status can't be changed, and nobody can be added or
--    removed. Founders Doc admins (and the server) can still correct them.
--    Certificates go out for signing only once paid (the website checks paid_at).
--
-- 3. ALERTS. New self-serve dashboards start with 2 weeks, 1 week and the day
--    ({14,7,0}); dashboards still on the old default ({7,0}) move to it.
-- ============================================================================

-- 1. Requests (Modify / Cancel) ------------------------------------------------------
create table if not exists public.esop_run_requests (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.esop_companies (id) on delete cascade,
  ref          text not null check (ref ~ '^B[0-9]{1,3}-T[0-9]{1,2}$'),
  kind         text not null check (kind in ('modify', 'cancel')),
  note         text check (note is null or length(note) <= 2000),
  by_email     text,
  link_id      uuid references public.esop_approval_links (id) on delete set null,
  ip           text,
  ua           text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  text
);
create index if not exists esop_run_requests_ref on public.esop_run_requests (company_id, ref, created_at desc);
create index if not exists esop_run_requests_link on public.esop_run_requests (link_id);
alter table public.esop_run_requests enable row level security;
revoke all on public.esop_run_requests from public, anon, authenticated;
grant select on public.esop_run_requests to authenticated;
drop policy if exists "esop requests: read" on public.esop_run_requests;
create policy "esop requests: read" on public.esop_run_requests for select to authenticated using (public.esop_can(company_id));

-- The approval page: Modify or Cancel (server only, like _use)
create or replace function public.esop_approval_link_respond(p_token_hash text, p_kind text, p_note text, p_ip text, p_ua text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  l       public.esop_approval_links;
  c       public.esop_companies;
  v_view  jsonb;
  v_note  text := nullif(left(btrim(coalesce(p_note, '')), 2000), '');
begin
  select * into l from public.esop_approval_links where token_hash = p_token_hash for update;
  if l.id is null then raise exception 'invalid link'; end if;
  if p_kind not in ('modify', 'cancel') then raise exception 'bad kind'; end if;
  if p_kind = 'modify' and v_note is null then raise exception 'note needed'; end if;
  v_view := public.esop_approval_link_view(p_token_hash);
  if v_view ->> 'status' = 'approved' then raise exception 'already approved'; end if;
  if v_view ->> 'status' = 'responded' then raise exception 'already responded'; end if;
  if v_view ->> 'status' <> 'ok' then raise exception 'expired link'; end if;

  insert into public.esop_run_requests (company_id, ref, kind, note, by_email, link_id, ip, ua)
  values (l.company_id, l.ref, p_kind, v_note, l.email, l.id, left(p_ip, 64), left(p_ua, 300));
  update public.esop_approval_links set used_at = now(), used_ip = left(p_ip, 64), used_ua = left(p_ua, 300) where id = l.id;

  select * into c from public.esop_companies where id = l.company_id;
  return (v_view - 'status' - 'response') || jsonb_build_object(
    'kind', p_kind,
    'note', v_note,
    'by', l.email,
    'by_name', coalesce(l.name, ''),
    'self_serve', c.self_serve,
    'email_override', c.email_override,
    'admins', coalesce((select jsonb_agg(m.email order by m.email) from public.esop_members m where m.company_id = c.id and m.role = 'ceo'), '[]'::jsonb)
  );
end $$;
revoke all on function public.esop_approval_link_respond(text, text, text, text, text) from public, anon, authenticated;

-- 2. Paid ----------------------------------------------------------------------------
alter table public.esop_tranche_runs add column if not exists paid_at timestamptz;
alter table public.esop_tranche_runs add column if not exists paid_by text;

-- "Mark as paid" (or undo) on the dashboard: Founders Doc admins only
create or replace function public.esop_mark_paid(p_slug text, p_ref text, p_paid boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c     public.esop_companies;
  r     public.esop_tranche_runs;
  v_ref text := upper(coalesce(p_ref, ''));
begin
  select * into c from public.esop_companies where slug = p_slug;
  if c.id is null or not public.is_admin() then raise exception 'not allowed'; end if;
  select * into r from public.esop_tranche_runs where company_id = c.id and ref = v_ref for update;
  if r.ref is null or r.sent_at is null then raise exception 'not approved'; end if;
  update public.esop_tranche_runs
     set paid_at = case when coalesce(p_paid, true) then coalesce(r.paid_at, now()) end,
         paid_by = case when coalesce(p_paid, true) then coalesce(r.paid_by, left(lower(coalesce(auth.jwt() ->> 'email', '')), 200)) end
   where company_id = c.id and ref = v_ref
   returning * into r;
  return jsonb_build_object('ref', v_ref, 'paid_at', r.paid_at, 'paid_by', r.paid_by);
end $$;
revoke all on function public.esop_mark_paid(text, text, boolean) from public, anon;
grant execute on function public.esop_mark_paid(text, text, boolean) to authenticated;

-- A Zap (Stripe "payment succeeded"): company key, like esop_record
create or replace function public.esop_zap_paid(p_key text, p_slug text, p_ref text, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c     public.esop_companies;
  r     public.esop_tranche_runs;
  v_ref text := upper(coalesce(p_ref, ''));
begin
  c := public.esop_company_for_key(p_key, p_slug);
  if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad payload'; end if;
  update public.esop_tranche_runs
     set paid_at = coalesce(paid_at, now()), paid_by = coalesce(paid_by, left(coalesce(nullif(p_by, ''), 'Stripe (Zap)'), 200))
   where company_id = c.id and ref = v_ref and sent_at is not null
   returning * into r;
  if r.ref is null then raise exception 'bad payload'; end if;
  return jsonb_build_object('ok', true, 'ref', v_ref, 'paid_at', r.paid_at);
end $$;
revoke all on function public.esop_zap_paid(text, text, text, text) from public;
grant execute on function public.esop_zap_paid(text, text, text, text) to anon, authenticated;

-- Which paid tranche (if any) locks this batch: paid, and not every certificate signed yet
create or replace function public.esop_batch_locked(p_company uuid, p_batch int)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.ref
    from public.esop_tranche_runs r
   where r.company_id = p_company
     and r.paid_at is not null
     and r.ref ~ ('^B' || p_batch || '-T[0-9]+$')
     and exists (
       select 1 from public.esop_holders h
        where h.company_id = p_company and h.batch = p_batch and h.status = 'Active'
          and not exists (
            select 1 from public.sign_envelopes e
             where e.esop_holder_id = h.id and e.esop_tranche = split_part(r.ref, '-T', 2)::int and e.status = 'completed'
          )
     )
   order by r.ref
   limit 1
$$;
revoke all on function public.esop_batch_locked(uuid, int) from public, anon;
grant execute on function public.esop_batch_locked(uuid, int) to authenticated;

create or replace function public.esop_holders_lock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ref text;
begin
  -- the server (service role), the SQL editor and Founders Doc admins may correct a locked batch
  if coalesce(auth.jwt() ->> 'role', '') <> 'authenticated' or public.is_admin() then
    return coalesce(new, old);
  end if;
  if tg_op = 'INSERT' then
    v_ref := public.esop_batch_locked(new.company_id, new.batch);
  elsif tg_op = 'DELETE' then
    v_ref := public.esop_batch_locked(old.company_id, old.batch);
  else
    if (new.name, new.legal_name, new.id_no, new.nationality, new.grant_date, new.batch, new.options_per_tranche, new.status, new.leaver_type)
       is not distinct from
       (old.name, old.legal_name, old.id_no, old.nationality, old.grant_date, old.batch, old.options_per_tranche, old.status, old.leaver_type) then
      return new;  -- email, notes and the like stay editable
    end if;
    v_ref := coalesce(public.esop_batch_locked(old.company_id, old.batch),
                      case when new.batch <> old.batch then public.esop_batch_locked(new.company_id, new.batch) end);
  end if;
  if v_ref is not null then
    raise exception 'locked %: paid, certificates being signed', v_ref;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists esop_holders_lock on public.esop_holders;
create trigger esop_holders_lock before insert or update or delete on public.esop_holders
  for each row execute function public.esop_holders_lock();

-- 3. Patch the live functions in place (only the lines that change; 117 / 118 / 123 kept) --
do $$
declare
  def text;
  n   int := 0;
begin
  -- approving closes any open Modify / Cancel
  select pg_get_functiondef('public.esop_approve_core(uuid, text, text)'::regprocedure) into def;
  if position('esop_run_requests' in def) = 0 then
    if position('  -- Running certificate numbers, in name order' in def) = 0 then raise exception 'CHECK esop_approve_core changed: run 118 first'; end if;
    execute replace(def, '  -- Running certificate numbers, in name order',
      E'  -- 129: approving closes an open Modify / Cancel\n'
      || E'  update public.esop_run_requests set resolved_at = now(), resolved_by = left(p_who, 200)\n'
      || E'   where company_id = c.id and ref = v_ref and resolved_at is null;\n\n'
      || '  -- Running certificate numbers, in name order');
    n := n + 1;
  end if;

  -- the daily Zap waits while a request is open; a fresh email from the dashboard closes it
  select pg_get_functiondef('public.esop_approval_link_make(uuid, text, text, text, int)'::regprocedure) into def;
  if position('esop_run_requests' in def) = 0 then
    if position('  if coalesce(p_once_hours, 0) > 0 and exists (' in def) = 0 or position('  -- 30 days after the vesting date' in def) = 0 then
      raise exception 'CHECK esop_approval_link_make changed: run 118 first';
    end if;
    def := replace(def, '  if coalesce(p_once_hours, 0) > 0 and exists (',
      E'  -- 129: Modify / Cancel open = paused; the automatic email waits for Founders Doc\n'
      || E'  if coalesce(p_once_hours, 0) > 0 and exists (\n'
      || E'    select 1 from public.esop_run_requests q where q.company_id = c.id and q.ref = v_ref and q.resolved_at is null\n'
      || E'  ) then\n'
      || E'    return jsonb_build_object(''skipped'', true, ''ref'', v_ref, ''paused'', true);\n'
      || E'  end if;\n\n'
      || '  if coalesce(p_once_hours, 0) > 0 and exists (');
    def := replace(def, '  -- 30 days after the vesting date',
      E'  update public.esop_run_requests set resolved_at = now(), resolved_by = left(p_by, 200)\n'
      || E'   where company_id = c.id and ref = v_ref and resolved_at is null;\n\n'
      || '  -- 30 days after the vesting date');
    execute def;
    n := n + 1;
  end if;

  -- the approval page shows "responded" after a Modify / Cancel
  select pg_get_functiondef('public.esop_approval_link_view(text)'::regprocedure) into def;
  if position('esop_run_requests' in def) = 0 then
    if position($q$    when l.used_at is not null then 'expired'$q$ in def) = 0 or position($q$'expires_at', l.expires_at);$q$ in def) = 0 then
      raise exception 'CHECK esop_approval_link_view changed: run 118 first';
    end if;
    def := replace(def, $q$    when l.used_at is not null then 'expired'$q$,
      $q$    when exists (select 1 from public.esop_run_requests q where q.link_id = l.id) then 'responded'
    when l.used_at is not null then 'expired'$q$);
    def := replace(def, $q$'expires_at', l.expires_at);$q$,
      $q$'expires_at', l.expires_at,
    'response', (select jsonb_build_object('kind', q.kind, 'note', q.note, 'at', q.created_at)
                   from public.esop_run_requests q where q.link_id = l.id order by q.created_at desc limit 1));$q$);
    execute def;
    n := n + 1;
  end if;

  -- a simulation reset also clears the vesting's requests
  select pg_get_functiondef('public.esop_reset_simulation(text, text, boolean, text)'::regprocedure) into def;
  if position('esop_run_requests' in def) = 0 and position('  delete from public.esop_tranche_runs where company_id = c.id and ref = v_ref;' in def) > 0 then
    execute replace(def, '  delete from public.esop_tranche_runs where company_id = c.id and ref = v_ref;',
      E'  delete from public.esop_tranche_runs where company_id = c.id and ref = v_ref;\n'
      || '  delete from public.esop_run_requests where company_id = c.id and ref = v_ref;');
    n := n + 1;
  end if;

  -- new self-serve dashboards: alerts 2 weeks, 1 week and on the day
  select pg_get_functiondef('public.esop_create_company(text)'::regprocedure) into def;
  if position($q$'{7,0}'$q$ in def) > 0 then
    execute replace(def, $q$'{7,0}'$q$, $q$'{14,7,0}'$q$);
    n := n + 1;
  end if;

  raise notice 'OK    % live function(s) updated', n;
end $$;

update public.esop_companies set alert_days = '{14,7,0}' where self_serve and alert_days = '{7,0}';

do $$ begin
  raise notice 'OK    ESOP lock-in ready · % open request(s) · % paid tranche(s) · % batch(es) locked now',
    (select count(*) from public.esop_run_requests where resolved_at is null),
    (select count(*) from public.esop_tranche_runs where paid_at is not null),
    (select count(*) from (select distinct company_id, batch from public.esop_holders h where public.esop_batch_locked(h.company_id, h.batch) is not null) x);
end $$;

-- Checks (read-only):
--   select ref, kind, note, by_email, created_at, resolved_at from public.esop_run_requests order by created_at desc;
--   select ref, approved_at, sent_at, paid_at, paid_by from public.esop_tranche_runs order by approved_at desc;
