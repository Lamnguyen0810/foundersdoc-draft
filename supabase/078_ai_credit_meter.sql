-- ===========================================================================
-- FDAI — the AI credit meter on the admin Overview
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- Drafts are paid for with prepaid credit at the AI provider (US$5 at a
-- time at OpenAI). The provider's own page shows only dollars, and nobody
-- looks at it until a draft fails. This puts the meter where the admin
-- already looks, as drafts rather than dollars:
--
--   Balance left      US$3.84
--   Drafts left       about 210, at the average cost of recent drafts
--   Days left         about 34, at the pace of the last 7 days
--   Action            🟢 Balance is enough / 🟠 Get ready to top up / 🔴 Top up now
--
-- ── HOW THE BALANCE IS KNOWN ────────────────────────────────────────────────
-- The provider does not tell us its balance, so we keep our own ledger:
--   top-up   the admin records each top-up here ("US$5 on 12 Sep")
--   spend    every draft is already in usage_log with its cost (001)
--   balance  = top-ups − spend since the first top-up
-- Our cost is a little under the provider's (failed and cut-off drafts are
-- not logged), so now and then the admin copies the balance from the
-- provider's billing page into "Set balance", and the ledger corrects
-- itself from there. A correction is stored as an adjustment, never by
-- rewriting history.
--
-- ── THE THRESHOLDS ──────────────────────────────────────────────────────────
--   🔴 Top up now           under US$1, or under 20 drafts, or under 7 days
--   🟠 Get ready to top up  under US$2.50, or under 60 drafts, or under 21 days
--   🟢 Balance is enough    everything else
--   ⚪ Not set up           no top-up recorded yet
-- ===========================================================================

-- ─────────────────────────────────────────────────────────── 1. the ledger
create table if not exists public.ai_credit_ledger (
  id          uuid primary key default gen_random_uuid(),
  provider    text not null,
  kind        text not null check (kind in ('topup', 'adjust')),
  amount_usd  numeric(12, 4) not null,
  note        text,
  at          timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists ai_credit_ledger_provider_at_idx
  on public.ai_credit_ledger (provider, at);

alter table public.ai_credit_ledger enable row level security;
revoke all on public.ai_credit_ledger from anon, authenticated;
-- No policies: the table is reached only through the two admin functions.

-- ────────────────────────────────────────────── 2. which provider is live
/* The provider of the most recent draft; 'openai' before any draft exists. */
create or replace function public.ai_live_provider()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select provider from public.usage_log order by created_at desc limit 1),
    'openai');
$$;

revoke all on function public.ai_live_provider() from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────── 3. the meter
create or replace function public.admin_ai_credit(p_provider text default null)
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
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select min(at) filter (where kind = 'topup'),
         max(at) filter (where kind = 'topup'),
         coalesce(sum(amount_usd) filter (where kind = 'topup'), 0),
         coalesce(sum(amount_usd) filter (where kind = 'adjust'), 0)
    into v_since, v_last, v_topups, v_adjust
  from public.ai_credit_ledger
  where provider = v_provider;

  if v_since is not null then
    select coalesce(sum(cost_usd), 0), count(*)
      into v_spent, v_drafts
    from public.usage_log
    where provider = v_provider and created_at >= v_since;
  end if;

  v_balance := v_topups + v_adjust - v_spent;

  /* What a draft costs: the last 30 days of this provider's drafts, or all
     of them if the last 30 days are too few to mean anything. */
  select avg(cost_usd), count(*) into v_avg, v_avg_n
  from public.usage_log
  where provider = v_provider and created_at >= now() - interval '30 days' and cost_usd > 0;
  if coalesce(v_avg_n, 0) < 5 then
    select avg(cost_usd), count(*) into v_avg, v_avg_n
    from public.usage_log
    where provider = v_provider and cost_usd > 0;
  end if;

  /* The pace: drafts in the last 7 days. */
  select count(*) into v_7d
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
    'ledger',          v_ledger
  );
end;
$$;

revoke all on function public.admin_ai_credit(text) from public, anon;
grant execute on function public.admin_ai_credit(text) to authenticated;

-- ────────────────────────────────────────── 4. recording a top-up or balance
/*
 *   p_kind = 'topup'   amount is what was paid in: adds to the balance
 *   p_kind = 'set'     amount is the balance the provider's page shows now:
 *                      an adjustment is stored for the difference
 */
create or replace function public.admin_ai_credit_record(
  p_provider text,
  p_kind     text,
  p_amount   numeric,
  p_note     text default null,
  p_at       timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(nullif(btrim(p_provider), ''), public.ai_live_provider());
  v_now      jsonb;
  v_delta    numeric;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if p_amount is null or p_amount < 0 or p_amount > 100000 then
    raise exception 'amount must be between 0 and 100000';
  end if;

  if p_kind = 'topup' then
    if p_amount <= 0 then raise exception 'amount must be between 0 and 100000'; end if;
    insert into public.ai_credit_ledger (provider, kind, amount_usd, note, at, created_by)
    values (v_provider, 'topup', p_amount, nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_at, now()), auth.uid());

  elsif p_kind = 'set' then
    v_now := public.admin_ai_credit(v_provider);
    if (v_now->>'since') is null then
      /* Nothing recorded yet: treat the figure as the opening balance. */
      insert into public.ai_credit_ledger (provider, kind, amount_usd, note, at, created_by)
      values (v_provider, 'topup', p_amount, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Opening balance'), coalesce(p_at, now()), auth.uid());
    else
      v_delta := p_amount - (v_now->>'balance_usd')::numeric;
      if v_delta <> 0 then
        insert into public.ai_credit_ledger (provider, kind, amount_usd, note, at, created_by)
        values (v_provider, 'adjust', v_delta,
                coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Set to the balance shown by the provider'),
                coalesce(p_at, now()), auth.uid());
      end if;
    end if;
  else
    raise exception 'kind must be topup or set';
  end if;

  return public.admin_ai_credit(v_provider);
end;
$$;

revoke all on function public.admin_ai_credit_record(text, text, numeric, text, timestamptz) from public, anon;
grant execute on function public.admin_ai_credit_record(text, text, numeric, text, timestamptz) to authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    AI credit meter installed. Live provider: %', public.ai_live_provider();
  raise notice 'NEXT  open /admin → Overview → "AI drafting credit" and record the last top-up (US$5).';
end $$;
