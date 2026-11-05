-- 118  ESOP: go-live fixes from the pre-demo review (5 Nov)
--
-- Run once in Supabase (SQL editor), after 116 and 117. Safe to run again.
--
--   1. Reset simulation also works AFTER simulation is switched off, for
--      approvals stamped as simulation (so a rehearsal of a real vesting such
--      as B8-T2 can never block the real one). Real approvals still can't be reset.
--   2. Dashboard Approve and email Confirm at the same moment: the second one
--      finds the vesting approved instead of failing.
--   3. Approval links remember whether they were made in simulation; a
--      rehearsal link stops working once simulation is off (and the daily
--      alert's "once a day" check only counts links of the same kind).

alter table public.esop_approval_links add column if not exists simulation boolean not null default false;
-- links made so far: made while the company was in simulation
update public.esop_approval_links l set simulation = true
  from public.esop_companies c
 where c.id = l.company_id and c.email_override is not null and not l.simulation;

create or replace function public.esop_reset_simulation(p_slug text, p_ref text, p_dry boolean default true, p_by text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c          public.esop_companies;
  r          public.esop_tranche_runs;
  v_ref      text := upper(coalesce(p_ref, ''));
  v_batch    int;
  v_tr       int;
  v_nums     int[];
  v_min      int;
  v_restore  boolean;
  v_next     int;
  v_docs     int;
  v_paths    text[];
  v_envs     uuid[];
  v_tokens   text[];
  v_ts       text;
  v_out      jsonb;
begin
  select * into c from public.esop_companies where slug = p_slug for update;
  if c.id is null then raise exception 'no company'; end if;
  -- (no check on email_override: the approval's own simulation stamp is the safety rule,
  --  so rehearsals can still be cleared after simulation is switched off)
  if v_ref !~ '^B[0-9]{1,3}-T[0-9]{1,2}$' then raise exception 'bad ref'; end if;
  v_batch := split_part(substr(v_ref, 2), '-T', 1)::int;
  v_tr := split_part(v_ref, '-T', 2)::int;

  select * into r from public.esop_tranche_runs where company_id = c.id and ref = v_ref for update;
  if r.ref is null then raise exception 'not approved'; end if;
  if not r.simulation then raise exception 'not a simulation'; end if;

  -- certificate numbers of this vesting; give them back only if nothing later uses a higher one
  select array_agg(number order by number), min(number) into v_nums, v_min
    from public.esop_certificates where company_id = c.id and ref = v_ref;
  v_restore := v_min is not null and not exists (
    select 1 from public.esop_certificates where company_id = c.id and ref <> v_ref and number >= v_min);
  v_next := case when v_restore then v_min else c.next_certificate_no end;

  -- certificates filed on the dashboard for this vesting since it was approved (FD Sign or Zapier)
  select count(*), array_agg(d.path) filter (where d.path is not null) into v_docs, v_paths
    from public.esop_documents d
    join public.esop_holders h on h.id = d.holder_id
   where d.company_id = c.id and d.kind = 'certificate' and h.batch = v_batch and d.tranche = v_tr
     and d.uploaded_at >= r.approved_at;

  -- FD Sign requests for this vesting since it was approved
  select array_agg(e.id) into v_envs
    from public.sign_envelopes e
    join public.esop_holders h on h.id = e.esop_holder_id
   where h.company_id = c.id and h.batch = v_batch and e.esop_tranche = v_tr
     and e.created_at >= r.approved_at;
  v_envs := coalesce(v_envs, '{}');

  v_ts := (select a.slack_ts from public.esop_alerts a where a.company_id = c.id and a.ref = v_ref);

  v_out := jsonb_build_object(
    'ref', v_ref,
    'dry', coalesce(p_dry, true),
    'certificate_numbers', coalesce(to_jsonb(v_nums), '[]'::jsonb),
    'numbers_restored', coalesce(v_restore, false),
    'next_certificate_no', v_next,
    'documents', coalesce(v_docs, 0),
    'paths', coalesce(to_jsonb(v_paths), '[]'::jsonb),
    'signing_requests', coalesce(array_length(v_envs, 1), 0),
    'slack_ts', v_ts,
    'simulation_to', c.email_override
  );
  if coalesce(p_dry, true) then return v_out; end if;

  -- 1) FD Sign: codes (keyed by token, no link), then the requests (signers,
  --    history, boxes and copies go with them)
  select array_agg(distinct s.token_hash) into v_tokens
    from public.sign_signers s where s.envelope_id = any(v_envs) and s.token_hash is not null;
  if v_tokens is not null then
    begin
      execute 'delete from public.sign_codes where token_hash = any($1)' using v_tokens;
    exception when undefined_table then null;
    end;
  end if;
  delete from public.sign_envelopes where id = any(v_envs);

  -- 2) filed certificates (the API removes the files from storage)
  delete from public.esop_documents d
   using public.esop_holders h
   where h.id = d.holder_id and d.company_id = c.id and d.kind = 'certificate'
     and h.batch = v_batch and d.tranche = v_tr and d.uploaded_at >= r.approved_at;

  -- 3) the approval itself
  delete from public.esop_alerts where company_id = c.id and ref = v_ref;
  delete from public.esop_certificates where company_id = c.id and ref = v_ref;
  delete from public.esop_tranche_runs where company_id = c.id and ref = v_ref;
  if v_restore then
    update public.esop_companies set next_certificate_no = v_min where id = c.id;
  end if;

  insert into public.esop_sim_resets (company_id, ref, reset_by, detail)
  values (c.id, v_ref, left(p_by, 200), v_out - 'paths' - 'dry');
  return v_out;
end $$;
revoke all on function public.esop_reset_simulation(text, text, boolean, text) from public, anon, authenticated;

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
    -- dashboard Approve and email Confirm at the same moment: the second one simply finds it approved
    insert into public.esop_tranche_runs (company_id, ref, approved_by) values (c.id, v_ref, left(p_who, 200))
    on conflict (company_id, ref) do nothing;
    select * into r from public.esop_tranche_runs where company_id = c.id and ref = v_ref for update;
    if r.sent_at is not null then raise exception 'already sent'; end if;
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
       and simulation = (c.email_override is not null)
  ) then
    return jsonb_build_object('skipped', true, 'ref', v_ref);
  end if;

  -- 30 days after the vesting date, and never less than 3 days from now
  v_exp := greatest(((v_item ->> 'vest_date')::date + 30)::timestamptz, now() + interval '3 days');
  insert into public.esop_approval_links (token_hash, company_id, ref, email, name, created_by, expires_at, simulation)
  values (p_token_hash, c.id, v_ref, lower(v_email), nullif(coalesce(c.contact_name, c.director_name), ''), left(p_by, 200), v_exp, c.email_override is not null);

  return v_item || jsonb_build_object('skipped', false, 'company', c.name, 'slug', c.slug, 'to', lower(v_email),
                                      'to_name', coalesce(nullif(c.contact_name, ''), nullif(c.director_name, ''), ''),
                                      'expires_at', v_exp);
end $$;
revoke all on function public.esop_approval_link_make(uuid, text, text, text, int) from public, anon, authenticated;

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
    when l.simulation <> (c.email_override is not null) then 'expired'   -- a rehearsal link after go-live (or the reverse)
    else 'ok' end;
  if l.opened_at is null then update public.esop_approval_links set opened_at = now() where id = l.id; end if;

  return v_item || jsonb_build_object('status', v_status, 'company', c.name, 'slug', c.slug, 'to', l.email, 'to_name', coalesce(l.name, ''), 'expires_at', l.expires_at);
end $$;
revoke all on function public.esop_approval_link_view(text) from public, anon, authenticated;

do $$ begin raise notice 'OK    ESOP go-live fixes ready. Simulation approvals to reset before go-live: %',
  coalesce((select string_agg(ref, ', ' order by ref) from public.esop_tranche_runs where simulation), 'none'); end $$;

-- Before switching simulation off (go-live), this must return no rows:
--   select ref, approved_by, approved_at from public.esop_tranche_runs where simulation;
