-- 143 · OnPoint: the file folder (0286).
--
-- Every invoice file OnPoint uploads (PDF invoices, invoice lists, client sheets) is kept in a private Storage
-- bucket, with the day it was uploaded, who uploaded it and what came of it (the invoice it became, or the
-- import). Like every OnPoint table: closed to the browser, only the website's server reads it. Safe to run twice.

create table if not exists public.onpoint_files (
  id           uuid primary key,
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  name         text not null check (length(name) between 1 and 200),
  kind         text not null check (kind in ('pdf', 'list', 'sheet')),
  size         int  not null check (size >= 0),
  path         text not null check (length(path) <= 400),
  uploaded_by  text,
  uploaded_at  timestamptz not null default now(),
  invoice_id   uuid references public.onpoint_invoices (id) on delete set null,
  import_id    bigint references public.onpoint_imports (id) on delete set null,
  details      jsonb not null default '{}'
);
create index if not exists onpoint_files_recent on public.onpoint_files (workspace_id, uploaded_at desc);
alter table public.onpoint_files enable row level security;
revoke all on public.onpoint_files from anon, authenticated;

-- the private bucket the files live in (Supabase Storage)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public) values ('onpoint-files', 'onpoint-files', false) on conflict (id) do nothing;
  end if;
  raise notice 'OK    OnPoint file folder ready.';
end $$;
