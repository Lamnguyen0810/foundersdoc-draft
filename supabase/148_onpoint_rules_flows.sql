-- 148 · OnPoint: Rules & flows, calendar notes, and the connections (0294), as in the approved mock-up.
--
-- A flow: WHEN a deadline gets close (n days before) or passes (n days after), THEN email the client, email the
-- OnPoint team, post to Slack, create a Monday.com task (by the board's email address) or send it to Zapier.
-- Each flow runs once per deadline per day number (onpoint_flow_runs). The Slack and Zapier hook addresses are
-- stored sealed (AES-GCM, ONPOINT_TOKEN_KEY) and are never sent back to the browser.
-- Like every OnPoint table, closed to the browser: only the website's server reads and writes it. Safe to run twice.

create table if not exists public.onpoint_flows (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  name         text not null check (length(name) between 1 and 120),
  enabled      boolean not null default true,
  trigger      text not null check (trigger in ('before', 'overdue')),
  types        text[] not null default '{}',
  days         int[] not null check (cardinality(days) between 1 and 8),
  actions      text[] not null check (cardinality(actions) between 1 and 5),
  position     int not null default 0,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists onpoint_flows_ws on public.onpoint_flows (workspace_id, position);

create table if not exists public.onpoint_flow_runs (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  flow_id      uuid not null references public.onpoint_flows (id) on delete cascade,
  deadline_id  uuid references public.onpoint_deadlines (id) on delete set null,
  day_n        int not null,
  action       text not null check (action in ('email_client', 'email_team', 'slack', 'monday', 'zapier')),
  status       text not null check (status in ('sent', 'failed', 'skipped')),
  note         text check (note is null or length(note) <= 300),
  ran_at       timestamptz not null default now(),
  run_key      text not null unique
);
create index if not exists onpoint_flow_runs_recent on public.onpoint_flow_runs (workspace_id, ran_at desc);

create table if not exists public.onpoint_day_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  day          date not null,
  text         text not null check (length(text) between 1 and 300),
  created_by   text,
  created_at   timestamptz not null default now()
);
create index if not exists onpoint_day_notes_day on public.onpoint_day_notes (workspace_id, day);

alter table public.onpoint_workspaces
  add column if not exists team_email      text check (team_email is null or team_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists monday_email    text check (monday_email is null or monday_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column if not exists slack_hook_enc  text,
  add column if not exists zapier_hook_enc text,
  add column if not exists paused_types    text[] not null default '{}';

alter table public.onpoint_flows enable row level security;
alter table public.onpoint_flow_runs enable row level security;
alter table public.onpoint_day_notes enable row level security;
revoke all on public.onpoint_flows, public.onpoint_flow_runs, public.onpoint_day_notes from anon, authenticated;

-- the flows from the approved mock-up, once (the client chase per type is on Reminder emails)
insert into public.onpoint_flows (workspace_id, name, enabled, trigger, types, days, actions, position, created_by)
select w.id, f.name, f.enabled, f.trigger, f.types, f.days, f.actions, f.position, 'setup'
from public.onpoint_workspaces w
cross join (values
  ('Overdue → escalate to OnPoint', true, 'overdue', '{AR,AGM,FS,ECI}'::text[], '{0}'::int[], '{email_team,slack,monday}'::text[], 1),
  ('Corp-Sec expiry — 60 day notice', true, 'before', '{CORP_SEC_EXPIRY}'::text[], '{60}'::int[], '{email_client,zapier}'::text[], 2),
  ('ECI filing — IRAS 3-month rule', false, 'before', '{ECI}'::text[], '{45}'::int[], '{email_client}'::text[], 3)
) as f(name, enabled, trigger, types, days, actions, position)
where w.slug = 'onpoint'
  and not exists (select 1 from public.onpoint_flows x where x.workspace_id = w.id);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_workspaces' and column_name = 'paused_types') then
    raise exception 'FAILED: flow columns not added';
  end if;
  raise notice 'OK    OnPoint Rules & flows, calendar notes and connections ready.';
end $$;
select f.name, f.enabled, f.trigger, f.types, f.days, f.actions from public.onpoint_flows f join public.onpoint_workspaces w on w.id = f.workspace_id where w.slug = 'onpoint' order by position;
