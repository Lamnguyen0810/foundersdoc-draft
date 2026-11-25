-- 145 · OnPoint: feedback, page by page, for the first 3 months (0291).
--
-- A temporary box at the bottom of each page lets OnPoint send comments bit by bit, without a call. It shows until
-- feedback_until (3 months from today); Founders Doc sees every comment and marks it done. Safe to run twice.

create table if not exists public.onpoint_feedback (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.onpoint_workspaces (id) on delete cascade,
  page         text not null check (length(page) between 1 and 40),
  message      text not null check (length(message) between 1 and 4000),
  created_by   text,
  created_at   timestamptz not null default now(),
  status       text not null default 'new' check (status in ('new', 'done')),
  done_at      timestamptz
);
create index if not exists onpoint_feedback_recent on public.onpoint_feedback (workspace_id, created_at desc);
alter table public.onpoint_feedback enable row level security;
revoke all on public.onpoint_feedback from anon, authenticated;

alter table public.onpoint_workspaces add column if not exists feedback_until date;
update public.onpoint_workspaces set feedback_until = (current_date + interval '3 months')::date where slug = 'onpoint' and feedback_until is null;

do $$ begin raise notice 'OK    OnPoint feedback box ready.'; end $$;
select feedback_until from public.onpoint_workspaces where slug = 'onpoint';
