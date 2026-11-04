-- 116  ESOP: "Reset simulation" button (Rachel + Lam only)
--
-- Run once in Supabase (SQL editor), after 105-115. Safe to run again.
--
-- WHY. Rachel wants to try the whole December flow (approve -> pay -> FD Sign
-- -> certificates) as many times as she likes. One click on the dashboard
-- puts a vesting back to "not approved", exactly as the manual reset did.
--
-- SAFETY.
--   * Only works while simulation is on (esop_companies.email_override set).
--   * Only on approvals MADE in simulation: esop_tranche_runs.simulation is
--     stamped at the moment of approval (trigger below). A real approval can
--     never be reset.
--   * Certificate numbers go back only if no later certificate uses a higher
--     number (so real numbering is never broken).
--   * Only the server can call it (no grant to anon/authenticated); the API
--     checks the signed-in email is Rachel's or Lam's first.
--   * Every reset is logged in esop_sim_resets.
--
-- KEPT: holders and their details (name, ID number, nationality, grant date),
-- Letters of Grant, emails already in inboxes, the Stripe test payment.
-- REMOVED (this vesting only, since it was approved): the approval, its
-- certificate numbers, its Slack thread link, FD Sign requests (with their
-- codes, boxes, copies, history) and certificates filed on the dashboard.

-- 1. Mark approvals made in simulation ---------------------------------------
alter table public.esop_tranche_runs add column if not exists simulation boolean not null default false;

create or replace function public.esop_runs_mark_simulation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.simulation := coalesce((select c.email_override is not null from public.esop_companies c where c.id = new.company_id), false);
  return new;
end $$;

drop trigger if exists esop_runs_mark_simulation on public.esop_tranche_runs;
create trigger esop_runs_mark_simulation
  before insert on public.esop_tranche_runs
  for each row execute function public.esop_runs_mark_simulation();

-- Approvals already made: HitPay has been in simulation since 109 (30 Oct) and
-- no real vesting has gone through the dashboard yet, so these are rehearsals.
update public.esop_tranche_runs r
   set simulation = true
  from public.esop_companies c
 where c.id = r.company_id
   and c.email_override is not null
   and r.approved_at >= timestamptz '2026-10-30 00:00:00+08'
   and not r.simulation;

-- 2. Log -------------------------------------------------------------------------
create table if not exists public.esop_sim_resets (
  id          bigserial primary key,
  company_id  uuid not null references public.esop_companies (id) on delete cascade,
  ref         text not null,
  reset_by    text,
  reset_at    timestamptz not null default now(),
  detail      jsonb
);
alter table public.esop_sim_resets enable row level security;
revoke all on public.esop_sim_resets from public, anon, authenticated;

-- 3. The reset (p_dry = true only counts, for the confirm box) -------------------
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
  if c.email_override is null then raise exception 'simulation off'; end if;
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

do $$ begin raise notice 'OK    ESOP simulation reset ready. Simulation approvals now: %',
  coalesce((select string_agg(ref, ', ' order by ref) from public.esop_tranche_runs where simulation), 'none'); end $$;

-- Checks:
--   select ref, approved_by, approved_at, simulation from public.esop_tranche_runs order by approved_at;
--   select ref, reset_by, reset_at, detail from public.esop_sim_resets order by reset_at desc;
--   select next_certificate_no from public.esop_companies where slug = 'hitpay';
