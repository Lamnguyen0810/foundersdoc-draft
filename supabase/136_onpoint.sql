-- ============================================================================
-- 136 — OnPoint Workflows: filing-deadline reminders for OnPoint Consulting
--
-- Run once in Supabase (SQL editor). Safe to run twice.
--
-- WHAT. OnPoint (a corporate-secretarial and accounting firm) keeps its clients'
-- filing work in Excel: the Master List (FYE, FS, AGM, AR, ECI), the Nominee
-- Service sheet (corp-sec, nominee and address renewals) and the Job Schedule
-- (recurring accounts, payroll and GST work). foundersdoc.com/onpoint reads those
-- sheets, turns them into deadlines and emails each client a reminder before its
-- due date, from OnPoint's own mailbox (through a Zap).
--
-- WHO. Only the people listed in onpoint_members, and Founders Doc admins. Every
-- table here is closed to the browser (row-level security on, no policies): the
-- website's own server reads and writes them after checking who is signed in
-- (lib/onpoint/server.ts). So nothing here can be read with the public key.
--
-- ONE WORKSPACE TODAY. The tables carry workspace_id so a second firm can be
-- added later without moving anything.
-- ============================================================================

create table if not exists public.onpoint_workspaces (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name           text not null check (length(name) between 1 and 120),
  -- branding (the sidebar logo and name); null = the default
  custom_name    text check (custom_name is null or length(custom_name) between 1 and 120),
  logo_data      text check (logo_data is null or length(logo_data) <= 700000),  -- a PNG/JPEG data: URL, at most ~500 KB
  logo_updated_at timestamptz,
  -- sending
  sender_name    text not null default 'OnPoint Consulting',
  sender_email   text,                       -- the mailbox the Zap sends from (shown in the preview)
  test_inbox     text default 'administrator@foundersdoc.com',  -- set = every email goes here instead of the client; null = live
  auto_send      boolean not null default false,                -- the daily run sends only when this is on
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.onpoint_members (
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  email        text not null check (email = lower(email) and email like '%@%'),
  role         text not null default 'staff' check (role in ('admin', 'staff', 'viewer')),
  added_at     timestamptz not null default now(),
  primary key (workspace_id, email)
);

create table if not exists public.onpoint_clients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  key           text not null,               -- normalised company name (the sheets' common key)
  name          text not null check (length(name) between 1 and 200),
  uen           text,
  fye           date,
  services      text[] not null default '{}', -- 'acc' / 'fs_tax' / 'sec' from the Master List's x marks
  contact_name  text check (contact_name is null or length(contact_name) <= 160),
  contact_email text check (contact_email is null or (length(contact_email) <= 200 and contact_email like '%@%')),
  active        boolean not null default true,
  updated_at    timestamptz not null default now(),
  unique (workspace_id, key)
);

create table if not exists public.onpoint_deadlines (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  client_id     uuid not null references public.onpoint_clients (id) on delete cascade,
  type          text not null check (type in ('AR', 'ECI', 'AGM', 'FS', 'CORP_SEC_EXPIRY', 'RECURRING_JOB')),
  label         text,                         -- e.g. "Corp-sec renewal (Sadiq)", "GST (quarter Jun)"
  due_date      date not null,
  source        text not null,                -- "Master List 2026 · Pte Ltd", ...
  source_key    text not null,                -- stable: type + what it was made from
  derived       boolean not null default true,-- worked out (FYE + months) rather than typed in the sheet
  status        text not null default 'active' check (status in ('active', 'completed', 'waived', 'not_applicable', 'cancelled')),
  done_on       date,                         -- the date in the sheet that marked it done
  synced_at     timestamptz not null default now(),
  unique (workspace_id, source_key)
);
create index if not exists onpoint_deadlines_due on public.onpoint_deadlines (workspace_id, status, due_date);

-- one row per saved version; the current template of a type is its highest version
create table if not exists public.onpoint_templates (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  type          text not null check (type in ('AR', 'ECI', 'AGM', 'FS', 'CORP_SEC_EXPIRY', 'RECURRING_JOB')),
  version       int not null check (version >= 1),
  subject       text not null check (length(subject) between 1 and 300),
  body          text not null check (length(body) between 1 and 8000),
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (workspace_id, type, version)
);

create or replace function public.onpoint_valid_leads(p int[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(x between 1 and 180), true) and cardinality(p) = (select count(distinct y) from unnest(p) y)
  from unnest(p) x
$$;

create table if not exists public.onpoint_schedules (
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  type          text not null check (type in ('AR', 'ECI', 'AGM', 'FS', 'CORP_SEC_EXPIRY', 'RECURRING_JOB')),
  lead_days     int[] not null default '{}',
  updated_by    text,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, type),
  check (public.onpoint_valid_leads(lead_days))
);

-- every email, once: the idempotency key is unique, so a retry or a second click sends nothing
create table if not exists public.onpoint_deliveries (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.onpoint_workspaces (id) on delete cascade,
  client_id        uuid references public.onpoint_clients (id) on delete set null,
  deadline_id      uuid references public.onpoint_deadlines (id) on delete set null,
  type             text not null,
  trigger          text not null check (trigger in ('AUTOMATIC', 'MANUAL')),
  lead_days        int,
  template_version int,
  from_name        text,
  to_email         text,                      -- where it really went (the test inbox while testing)
  intended_to      text,                      -- the client's address
  subject          text,
  body             text,
  status           text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'suppressed')),
  test             boolean not null default false,
  idem_key         text not null unique,
  requested_by     text,
  requested_at     timestamptz not null default now(),
  sent_at          timestamptz,
  error            text
);
create index if not exists onpoint_deliveries_recent on public.onpoint_deliveries (workspace_id, requested_at desc);

-- each import, for the Excel sources page
create table if not exists public.onpoint_imports (
  id            bigserial primary key,
  workspace_id  uuid not null references public.onpoint_workspaces (id) on delete cascade,
  file_name     text not null,
  kind          text not null,
  summary       jsonb not null default '{}',
  imported_by   text,
  imported_at   timestamptz not null default now()
);

alter table public.onpoint_workspaces enable row level security;
alter table public.onpoint_members    enable row level security;
alter table public.onpoint_clients    enable row level security;
alter table public.onpoint_deadlines  enable row level security;
alter table public.onpoint_templates  enable row level security;
alter table public.onpoint_schedules  enable row level security;
alter table public.onpoint_deliveries enable row level security;
alter table public.onpoint_imports    enable row level security;
revoke all on public.onpoint_workspaces, public.onpoint_members, public.onpoint_clients, public.onpoint_deadlines,
              public.onpoint_templates, public.onpoint_schedules, public.onpoint_deliveries, public.onpoint_imports
  from anon, authenticated;

-- the OnPoint workspace itself, in test mode (every email to administrator@)
insert into public.onpoint_workspaces (slug, name) values ('onpoint', 'OnPoint Consulting Pte. Ltd.')
on conflict (slug) do nothing;

do $$
declare n int;
begin
  select count(*) into n from public.onpoint_members m join public.onpoint_workspaces w on w.id = m.workspace_id where w.slug = 'onpoint';
  raise notice 'OK    OnPoint ready. Members: %. Add Sadiq with: insert into public.onpoint_members (workspace_id, email, role) select id, ''<email>'', ''admin'' from public.onpoint_workspaces where slug = ''onpoint'';', n;
end $$;
