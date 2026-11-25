-- 144 · OnPoint: back to deadline tracking (0290).
--
-- OnPoint's system is filing-deadline tracking, as in the approved mock-ups: Deadlines, Calendar and Reminder
-- emails come back as the main pages. Payment reminders (invoices) become optional and hidden; nothing is deleted.
-- Safe to run more than once.

alter table public.onpoint_workspaces
  add column if not exists payments_enabled boolean not null default false;

update public.onpoint_workspaces set filing_enabled = true, payments_enabled = false where slug = 'onpoint';

do $$ begin raise notice 'OK    OnPoint: deadline tracking first; payment reminders hidden (optional).'; end $$;

select filing_enabled, payments_enabled, auto_send, test_inbox from public.onpoint_workspaces where slug = 'onpoint';
