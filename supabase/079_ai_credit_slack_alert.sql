-- ===========================================================================
-- FDAI — Slack hears when the AI credit needs topping up
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
-- Run 078 first.
--
-- ── WHAT THIS IS FOR ────────────────────────────────────────────────────────
-- The admin Overview has the credit meter (078), but nobody opens the admin
-- page every day. This sends the meter's verdict to Slack, the same way the
-- subscriber list does (a Zapier catch hook, set with set_webhook()):
--
--   🟠 FD AI credit: get ready to top up
--   Balance: US$2.10 of US$5.00 topped up
--   Drafts left: ~55 · Days left: ~19 (1.4 drafts a day)
--   Top up: https://platform.openai.com/settings/organization/billing/overview
--   Meter: https://foundersdoc.com/admin
--
-- ── WHEN IT SPEAKS ──────────────────────────────────────────────────────────
-- It is checked after every draft and every ledger entry, but it only posts:
--   • when the status CHANGES to 🟠 soon or 🔴 urgent (once, not every draft)
--   • a reminder every 3 days while it stays 🔴 urgent
--   • once when a top-up brings it back to 🟢 ("✅ topped up")
-- A failed post never blocks a draft: the notifier swallows its own errors.
--
-- ── SETTING IT UP (one line) ────────────────────────────────────────────────
--   select public.set_webhook('ai_credit', 'https://hooks.zapier.com/hooks/catch/…');
-- Make a Zap: Webhooks by Zapier (Catch Hook) → Slack (Send Channel Message),
-- message = the `message` field. Or paste the subscriber-list Zap's URL to
-- have it land in the same channel. Then:
--   select public.test_ai_credit_webhook();
-- ===========================================================================

-- ─────────────────────────────── 1. the meter, callable from inside triggers
/* The same figures as admin_ai_credit() (078) without the admin check: for
   the notifier, which runs as nobody. Not callable from the API. */
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
begin
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

  select avg(cost_usd), count(*) into v_avg, v_avg_n
  from public.usage_log
  where provider = v_provider and created_at >= now() - interval '30 days' and cost_usd > 0;
  if coalesce(v_avg_n, 0) < 5 then
    select avg(cost_usd), count(*) into v_avg, v_avg_n
    from public.usage_log
    where provider = v_provider and cost_usd > 0;
  end if;

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

revoke all on function public.ai_credit_meter(text) from public, anon, authenticated;

/* The admin's version is now a thin door in front of it. */
create or replace function public.admin_ai_credit(p_provider text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  return public.ai_credit_meter(p_provider);
end;
$$;

-- ───────────────────────────────────────────── 2. what Slack was last told
create table if not exists public.ai_credit_alerts (
  provider     text primary key,
  last_status  text not null,
  last_sent_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.ai_credit_alerts enable row level security;
revoke all on public.ai_credit_alerts from anon, authenticated;

-- ────────────────────────────────────────────────────── 3. the message
create or replace function public.ai_credit_message(p_meter jsonb, p_kind text)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_provider text := p_meter->>'provider';
  v_billing  text := case v_provider
                       when 'openai'    then 'https://platform.openai.com/settings/organization/billing/overview'
                       when 'anthropic' then 'https://console.anthropic.com/settings/billing'
                       when 'gemini'    then 'https://console.cloud.google.com/billing'
                       else '' end;
  v_name     text := case v_provider when 'openai' then 'OpenAI' when 'anthropic' then 'Anthropic' when 'gemini' then 'Google Gemini' else v_provider end;
  v_title    text;
  v_msg      text;
begin
  v_title := case p_kind
    when 'urgent'   then '🔴 FD AI credit: top up now'
    when 'reminder' then '🔴 FD AI credit: still waiting for a top-up'
    when 'soon'     then '🟠 FD AI credit: get ready to top up'
    when 'ok'       then '✅ FD AI credit: topped up, balance is enough'
    else                 'ℹ️ FD AI credit' end;

  v_msg := v_title || E'\n\n'
        || 'Balance: US$' || (p_meter->>'balance_usd') || ' of US$' || (p_meter->>'topped_up_usd') || E' topped up at ' || v_name || E'\n'
        || 'Drafts left: ' || coalesce('~' || (p_meter->>'drafts_left'), '—')
        || ' · Days left: ' || coalesce('~' || (p_meter->>'days_left'), '—')
        || case when (p_meter->>'per_day')::numeric > 0 then ' (' || (p_meter->>'per_day') || ' drafts a day)' else '' end || E'\n'
        || case when p_kind in ('urgent', 'reminder', 'soon') and v_billing <> '' then 'Top up: ' || v_billing || E'\n' else '' end
        || 'Meter: https://foundersdoc.com/admin';

  return jsonb_build_object(
    'event',        'ai_credit_' || p_kind,
    'provider',     v_provider,
    'status',       p_meter->>'status',
    'balance_usd',  p_meter->>'balance_usd',
    'drafts_left',  p_meter->>'drafts_left',
    'days_left',    p_meter->>'days_left',
    'title',        v_title,
    -- Finished. This is the field that goes into the Slack step.
    'message',      v_msg
  );
end;
$$;

revoke all on function public.ai_credit_message(jsonb, text) from public, anon, authenticated;

-- ─────────────────────────────────────── 4. decide, and tell Slack if so
create or replace function public.ai_credit_check_and_notify(p_provider text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_provider text := coalesce(nullif(btrim(p_provider), ''), public.ai_live_provider());
  v_url      text;
  v_meter    jsonb;
  v_status   text;
  v_prev     text;
  v_sent     timestamptz;
  v_kind     text := null;
begin
  select url into v_url from public.webhooks where name = 'ai_credit' and enabled and nullif(url, '') is not null;
  if v_url is null then
    return 'no webhook';                         -- nothing to tell anyone with
  end if;

  v_meter  := public.ai_credit_meter(v_provider);
  v_status := v_meter->>'status';
  if v_status = 'none' then
    return 'no top-up recorded';
  end if;

  select last_status, last_sent_at into v_prev, v_sent
  from public.ai_credit_alerts where provider = v_provider;

  if v_status in ('soon', 'urgent') and v_status is distinct from v_prev then
    v_kind := v_status;                          -- it just got worse (or started bad)
  elsif v_status = 'urgent' and v_sent is not null and v_sent < now() - interval '3 days' then
    v_kind := 'reminder';                        -- still red after 3 days
  elsif v_status = 'ok' and v_prev in ('soon', 'urgent') then
    v_kind := 'ok';                              -- a top-up fixed it
  end if;

  insert into public.ai_credit_alerts (provider, last_status, last_sent_at, updated_at)
  values (v_provider, v_status, case when v_kind is null then null else now() end, now())
  on conflict (provider) do update
    set last_status  = excluded.last_status,
        last_sent_at = coalesce(excluded.last_sent_at, public.ai_credit_alerts.last_sent_at),
        updated_at   = now();

  if v_kind is null then
    return 'nothing new (' || v_status || ')';
  end if;

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := public.ai_credit_message(v_meter, v_kind),
    timeout_milliseconds := 5000);

  return 'sent: ' || v_kind;
end;
$$;

revoke all on function public.ai_credit_check_and_notify(text) from public, anon, authenticated;

-- ────────────────────────────────── 5. checked after every draft and top-up
/* Never lets a notification problem stop a draft from being recorded. */
create or replace function public.ai_credit_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.ai_credit_check_and_notify(new.provider);
  exception when others then
    raise warning 'ai_credit_check_and_notify: %', sqlerrm;
  end;
  return null;
end;
$$;

drop trigger if exists on_usage_check_ai_credit on public.usage_log;
create trigger on_usage_check_ai_credit
  after insert on public.usage_log
  for each row execute function public.ai_credit_after_change();

drop trigger if exists on_ledger_check_ai_credit on public.ai_credit_ledger;
create trigger on_ledger_check_ai_credit
  after insert on public.ai_credit_ledger
  for each row execute function public.ai_credit_after_change();

-- ───────────────────────────────────────────────────────────── 6. the test
/*   select public.test_ai_credit_webhook();          -- the current figures, as 🟠
 *   select public.test_ai_credit_webhook('urgent');  -- as 🔴
 * Nothing is recorded; it only posts. */
create or replace function public.test_ai_credit_webhook(p_kind text default 'soon')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
begin
  select url into v_url from public.webhooks where name = 'ai_credit' and enabled and nullif(url, '') is not null;
  if v_url is null then
    return 'No address set. Run: select public.set_webhook(''ai_credit'', ''https://hooks.zapier.com/...'');';
  end if;
  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := public.ai_credit_message(public.ai_credit_meter(), coalesce(p_kind, 'soon')) || '{"test": true}'::jsonb,
    timeout_milliseconds := 5000);
  return 'Sent a test. It should appear in Slack within a few seconds.';
end;
$$;

revoke all on function public.test_ai_credit_webhook(text) from public, anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  if exists (select 1 from public.webhooks where name = 'ai_credit' and enabled) then
    raise notice 'OK    Slack alerts on. Current status: %', (public.ai_credit_meter())->>'status';
    raise notice 'TRY   select public.test_ai_credit_webhook();';
  else
    raise notice 'NEXT  select public.set_webhook(''ai_credit'', ''https://hooks.zapier.com/hooks/catch/...'');';
  end if;
end $$;
