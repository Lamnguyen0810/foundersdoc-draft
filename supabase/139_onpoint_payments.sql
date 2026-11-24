-- 139 · OnPoint: payment reminders (0280).
--
-- OnPoint chases its own unpaid invoices: each invoice (from an invoice list in Excel/CSV, e.g. Xero's export,
-- or added by hand) gets a reminder email, sent with a button from OnPoint's connected mailbox.
-- Filing reminders become optional (off by default; an administrator can switch them back on).
-- Like every OnPoint table, closed to the browser: only the website's server reads and writes it.
-- Safe to run more than once.

create table if not exists public.onpoint_invoices (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  client_id     uuid not null references public.onpoint_clients (id) on delete cascade,
  number        text check (number is null or length(number) <= 60),
  description   text check (description is null or length(description) <= 300),
  amount_cents  bigint not null check (amount_cents > 0 and amount_cents < 100000000000),
  currency      text not null default 'SGD' check (currency ~ '^[A-Z]{3}$'),
  issue_date    date,
  due_date      date not null,
  status        text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  paid_on       date,
  source        text not null default 'Added in the app' check (length(source) <= 200),
  source_key    text not null check (length(source_key) <= 300),  -- the invoice number, or client + due date + amount
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (workspace_id, source_key)
);
create index if not exists onpoint_invoices_due on public.onpoint_invoices (workspace_id, status, due_date);

alter table public.onpoint_deliveries
  add column if not exists invoice_id uuid references public.onpoint_invoices (id) on delete set null;

alter table public.onpoint_workspaces
  add column if not exists filing_enabled boolean not null default false,
  add column if not exists pay_subject    text check (pay_subject is null or length(pay_subject) between 1 and 300),
  add column if not exists pay_body       text check (pay_body is null or length(pay_body) between 1 and 8000);

alter table public.onpoint_invoices enable row level security;
revoke all on public.onpoint_invoices from anon, authenticated;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_deliveries' and column_name = 'invoice_id') then
    raise exception 'FAILED: payment columns not added';
  end if;
  raise notice 'OK    OnPoint payment reminders ready. Filing reminders are now optional (off).';
end $$;
