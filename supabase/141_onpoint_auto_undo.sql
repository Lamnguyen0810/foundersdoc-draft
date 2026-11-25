-- 141 · OnPoint: automatic payment reminders and undo an import (0282).
--
-- Automatic payment reminders: each morning (8am Singapore), every unpaid invoice gets an email on the days set
-- here: before the due date (0 = on the day) and after it. Sent only while "Automatic sending" is on (Founders Doc
-- switches it on); each reminder once. Undo an import: every invoice and deadline remembers the import that first
-- added it, so a file imported by mistake can be taken back. Safe to run more than once.

create or replace function public.onpoint_valid_days(p int[], lo int)
returns boolean language sql immutable as $$
  select coalesce(bool_and(x between lo and 365), true) and cardinality(p) = (select count(distinct y) from unnest(p) y) and cardinality(p) <= 12
  from unnest(p) x
$$;

alter table public.onpoint_workspaces
  add column if not exists pay_before int[] not null default '{7,0}',
  add column if not exists pay_after  int[] not null default '{3,10,30}';
do $$ begin
  alter table public.onpoint_workspaces add constraint onpoint_pay_days_ok check (public.onpoint_valid_days(pay_before, 0) and public.onpoint_valid_days(pay_after, 1));
exception when duplicate_object then null; end $$;

alter table public.onpoint_imports
  add column if not exists undone_at timestamptz,
  add column if not exists undone_by text;
alter table public.onpoint_invoices  add column if not exists import_id bigint references public.onpoint_imports (id) on delete set null;
alter table public.onpoint_deadlines add column if not exists import_id bigint references public.onpoint_imports (id) on delete set null;
create index if not exists onpoint_invoices_import  on public.onpoint_invoices (import_id) where import_id is not null;
create index if not exists onpoint_deadlines_import on public.onpoint_deadlines (import_id) where import_id is not null;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_deadlines' and column_name = 'import_id') then
    raise exception 'FAILED: import_id not added';
  end if;
  raise notice 'OK    OnPoint automatic payment reminders (off until switched on) and undo import ready.';
end $$;
