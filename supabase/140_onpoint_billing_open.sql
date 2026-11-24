-- 140 · OnPoint: card payment "opening soon" (0281).
--
-- The plan follows the fee proposal (S$280 setup, S$80/month for the first 3 months, then S$180/month,
-- GST not included). Until Founders Doc opens billing on the Billing & plan page, OnPoint cannot pay yet
-- and every part of the app is free to use. Safe to run more than once.

alter table public.onpoint_workspaces
  add column if not exists billing_open boolean not null default false;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_workspaces' and column_name = 'billing_open') then
    raise exception 'FAILED: billing_open not added';
  end if;
  raise notice 'OK    OnPoint billing: opening soon (everything free until it is opened).';
end $$;
