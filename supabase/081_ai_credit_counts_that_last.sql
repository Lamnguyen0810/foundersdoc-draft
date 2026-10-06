-- 081_ai_credit_counts_that_last.sql
-- ===========================================================================
-- Why the draft count looked too small, and the three fixes.
--
--   1. usage_log rows were DELETED with the account that made them
--      (user_id ... on delete cascade). Every closed test account took its
--      drafts and their cost out of the meter. From now on the row stays and
--      only user_id is cleared: the money was spent whether or not the person
--      is still here.
--
--   2. usage_log has one row per CALL to the model: a draft, each "continue"
--      of a cut-off draft, each revision and each question. The meter called
--      them all "drafts". A new column `kind` tells them apart
--      ('draft' | 'continue' | 'revise' | 'ask'); old rows are labelled from
--      what is known (first call for a draft = the draft itself).
--
--   3. The lifetime counters were per provider only. Drafts made on another
--      provider (Gemini, earlier) were out of the picture. The meter now also
--      reports every provider, and the number of documents according to the
--      billing records, which is the independent cross-check.
--
-- Run after 078, 079 and 080. Safe to run more than once.
-- ===========================================================================

-- ───────────────────────────── 1. the history survives a closed account
alter table public.usage_log alter column user_id drop not null;

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.usage_log'::regclass and contype = 'f'
      and pg_get_constraintdef(oid) like '%auth.users%'
  loop
    execute format('alter table public.usage_log drop constraint %I', r.conname);
  end loop;
  if to_regclass('auth.users') is not null then
    alter table public.usage_log
      add constraint usage_log_user_id_fkey
      foreign key (user_id) references auth.users (id) on delete set null;
  end if;
end $$;

-- ───────────────────────────────────────── 2. what kind of call it was
alter table public.usage_log add column if not exists kind text;

update public.usage_log u
   set kind = case
         /* No draft on record (a question, or a draft whose account or
            document is gone): a draft writes thousands of tokens, an answer
            a few hundred. */
         when u.draft_id is null then case when u.output_tokens >= 1200 then 'draft' else 'ask' end
         when u.id = (select f.id from public.usage_log f
                      where f.draft_id = u.draft_id order by f.created_at, f.id limit 1)
           then 'draft'
         else 'revise'
       end
 where u.kind is null;

alter table public.usage_log alter column kind set default 'draft';
update public.usage_log set kind = 'draft' where kind is null;
alter table public.usage_log alter column kind set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_log_kind_check') then
    alter table public.usage_log add constraint usage_log_kind_check
      check (kind in ('draft', 'continue', 'revise', 'ask'));
  end if;
end $$;

create index if not exists usage_log_provider_kind_idx
  on public.usage_log (provider, kind, created_at desc);

-- ───────────────────────────────────────────────────── 3. the meter
create or replace function public.ai_credit_meter(p_provider text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_provider  text := coalesce(nullif(btrim(p_provider), ''), public.ai_live_provider());
  v_since     timestamptz;
  v_topups    numeric := 0;
  v_adjust    numeric := 0;
  v_spent     numeric := 0;
  v_drafts    bigint  := 0;
  v_balance   numeric;
  v_avg       numeric;
  v_avg_n     bigint;
  v_7d        bigint;
  v_per_day   numeric;
  v_left      numeric;
  v_days      numeric;
  v_status    text;
  v_action    text;
  v_last      timestamptz;
  v_ledger    jsonb;
  v_paid_n    bigint  := 0;
  v_spent_all numeric := 0;
  v_drafts_all bigint := 0;
  v_months    jsonb;
  v_req_all   bigint  := 0;
  v_everyone  jsonb;
  v_docs      bigint  := 0;
begin
  select min(at) filter (where kind = 'topup'),
         max(at) filter (where kind = 'topup'),
         coalesce(sum(amount_usd) filter (where kind = 'topup'), 0),
         coalesce(sum(amount_usd) filter (where kind = 'adjust'), 0)
    into v_since, v_last, v_topups, v_adjust
  from public.ai_credit_ledger
  where provider = v_provider;

  if v_since is not null then
    select coalesce(sum(cost_usd), 0), count(*) filter (where kind = 'draft')
      into v_spent, v_drafts
    from public.usage_log
    where provider = v_provider and created_at >= v_since;
  end if;

  v_balance := v_topups + v_adjust - v_spent;

  /* Lifetime figures: every top-up ever recorded, every draft ever costed,
     regardless of when the meter started. */
  select count(*) into v_paid_n
  from public.ai_credit_ledger
  where provider = v_provider and kind = 'topup';

  select coalesce(sum(cost_usd), 0), count(*) filter (where kind = 'draft'), count(*)
    into v_spent_all, v_drafts_all, v_req_all
  from public.usage_log
  where provider = v_provider;

  /* Every provider ever used, so the lifetime picture is not cut at the
     switch from one model to another. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'provider', provider, 'drafts', drafts, 'requests', requests, 'spent_usd', round(spent, 4))
           order by spent desc), '[]'::jsonb)
    into v_everyone
  from (
    select provider,
           count(*) filter (where kind = 'draft') as drafts,
           count(*)                               as requests,
           coalesce(sum(cost_usd), 0)             as spent
    from public.usage_log
    group by provider
  ) p;

  /* Documents drafted according to the billing records (one row per document,
     every provider). The independent cross-check for the draft count. */
  select count(*) into v_docs
  from public.credit_spends
  where refunded_at is null;

  /* Month by month, newest first, for the last 12 months with any activity. */
  select coalesce(jsonb_agg(jsonb_build_object(
           'month',    to_char(mo.month, 'YYYY-MM'),
           'paid_usd', round(mo.paid, 2),
           'spent_usd', round(mo.spent, 4),
           'drafts',   mo.drafts,
           'requests', mo.requests)
           order by mo.month desc), '[]'::jsonb)
    into v_months
  from (
    select month,
           sum(paid)   as paid,
           sum(spent)  as spent,
           sum(drafts) as drafts,
           sum(requests) as requests
    from (
      select date_trunc('month', at at time zone 'Asia/Singapore') as month,
             amount_usd as paid, 0::numeric as spent, 0::bigint as drafts, 0::bigint as requests
      from public.ai_credit_ledger
      where provider = v_provider and kind = 'topup'
      union all
      select date_trunc('month', created_at at time zone 'Asia/Singapore'),
             0, coalesce(cost_usd, 0), case when kind = 'draft' then 1 else 0 end, 1
      from public.usage_log
      where provider = v_provider
    ) x
    group by month
    order by month desc
    limit 12
  ) mo;

  /* Cost of one draft = everything spent in the window / drafts in the window,
     so revisions and questions are paid for by the draft that caused them. */
  select sum(cost_usd) / nullif(count(*) filter (where kind = 'draft'), 0),
         count(*) filter (where kind = 'draft')
    into v_avg, v_avg_n
  from public.usage_log
  where provider = v_provider and created_at >= now() - interval '30 days';
  if coalesce(v_avg_n, 0) < 5 then
    select sum(cost_usd) / nullif(count(*) filter (where kind = 'draft'), 0),
           count(*) filter (where kind = 'draft')
      into v_avg, v_avg_n
    from public.usage_log
    where provider = v_provider;
  end if;

  select count(*) filter (where kind = 'draft') into v_7d
  from public.usage_log
  where provider = v_provider and created_at >= now() - interval '7 days';
  v_per_day := v_7d / 7.0;

  v_left := case when v_avg is not null and v_avg > 0 then floor(greatest(v_balance, 0) / v_avg) end;
  v_days := case when v_left is not null and v_per_day > 0 then floor(v_left / v_per_day) end;

  if v_since is null then
    v_status := 'none';
    v_action := 'Record the last top-up so the meter can start counting.';
  elsif v_balance < 1 or coalesce(v_left, 999999) < 20 or coalesce(v_days, 999999) < 7 then
    v_status := 'urgent';
    v_action := 'Top up now. Drafting stops when this reaches zero.';
  elsif v_balance < 2.5 or coalesce(v_left, 999999) < 60 or coalesce(v_days, 999999) < 21 then
    v_status := 'soon';
    v_action := 'Get ready to top up in the next week or two.';
  else
    v_status := 'ok';
    v_action := 'Balance is enough. Nothing to do.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', kind, 'amount_usd', amount_usd, 'note', note, 'at', at)
           order by at desc), '[]'::jsonb)
    into v_ledger
  from (select * from public.ai_credit_ledger where provider = v_provider order by at desc limit 6) l;

  return jsonb_build_object(
    'provider',        v_provider,
    'since',           v_since,
    'last_topup_at',   v_last,
    'topped_up_usd',   round(v_topups, 2),
    'adjust_usd',      round(v_adjust, 2),
    'spent_usd',       round(v_spent, 4),
    'drafts_since',    v_drafts,
    'balance_usd',     round(v_balance, 2),
    'avg_cost_usd',    case when v_avg is null then null else round(v_avg, 4) end,
    'avg_sample',      coalesce(v_avg_n, 0),
    'drafts_7d',       v_7d,
    'per_day',         round(v_per_day, 2),
    'drafts_left',     v_left,
    'days_left',       v_days,
    'status',          v_status,
    'action',          v_action,
    'ledger',          v_ledger,
    'paid_total_usd',  round(v_topups, 2),
    'topup_count',     v_paid_n,
    'first_topup_at',  v_since,
    'spent_total_usd', round(v_spent_all, 4),
    'drafts_total',    v_drafts_all,
    'requests_total',  v_req_all,
    'by_provider',     v_everyone,
    'documents_billed', v_docs,
    'by_month',        v_months
  );
end;
$$;

revoke all on function public.ai_credit_meter(text) from public, anon, authenticated;

do $$
declare m jsonb := public.ai_credit_meter();
begin
  raise notice 'OK    % drafts / % AI requests at %, % documents in the billing records, every provider: %',
    m->>'drafts_total', m->>'requests_total', m->>'provider', m->>'documents_billed', m->'by_provider';
end $$;
