-- 110  ESOP: a leaver's vested options as recorded
--
-- Run once in Supabase (SQL editor), after 105-109. Safe to run again.
--
-- WHY. HitPay's existing schedule (the Slack list) records how many options
-- each leaver had vested, but for most leavers not the exact last day. With
-- vested_override set, the dashboard shows that recorded number (and keeps
-- nothing for a Bad leaver, as before) instead of counting tranches to today.
-- Active holders are still calculated from the batch dates.

alter table public.esop_holders add column if not exists vested_override int;
do $$ begin
  alter table public.esop_holders add constraint esop_holders_vested_override_ok check (vested_override is null or vested_override >= 0);
exception when duplicate_object then null; end $$;

do $$ begin raise notice 'OK    ESOP recorded vested options column ready'; end $$;
