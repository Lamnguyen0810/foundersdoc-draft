-- 082_ai_credit_thresholds.sql
-- ===========================================================================
-- When the meter changes colour, in drafts rather than dollars or days:
--   🟠 soon    fewer than 10 drafts left
--   🔴 urgent  fewer than 3 drafts left, or under US$0.25
-- Nothing else changes. Run after 081. Safe to run more than once.
-- ===========================================================================

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
  elsif v_balance < 0.25 or coalesce(v_left, 999999) < 3 then
    v_status := 'urgent';
    v_action := 'Top up now: fewer than 3 drafts left. Drafting stops at zero.';
  elsif coalesce(v_left, 999999) < 10 then
    v_status := 'soon';
    v_action := 'Get ready to top up: fewer than 10 drafts left.';
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
  raise notice 'OK    thresholds set. Now: % (% drafts left) — %', m->>'status', m->>'drafts_left', m->>'action';
end $$;
