-- 142 · OnPoint: notes on the client page, and the document drafting add-on enquiry (0285).
-- Safe to run more than once.

alter table public.onpoint_clients
  add column if not exists notes text check (notes is null or length(notes) <= 4000);

alter table public.onpoint_workspaces
  add column if not exists addon_enquired_at timestamptz,
  add column if not exists addon_enquired_by text;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_clients' and column_name = 'notes') then
    raise exception 'FAILED: notes not added';
  end if;
  raise notice 'OK    OnPoint client notes and add-on enquiry ready.';
end $$;
