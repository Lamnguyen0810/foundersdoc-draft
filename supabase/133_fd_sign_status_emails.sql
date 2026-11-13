-- ============================================================================
-- 133 — FD Sign status emails: daily, weekly or off, per sender (0236)
--
-- Rachel (12 Nov): premium plans get a daily or weekly email with each open
-- document's progress, who has signed and who is left. The sender chooses
-- daily, weekly (the default) or off. The server reads and writes this table;
-- nobody else can.
--
-- Run once in Supabase (SQL editor). Safe to run twice. Adds only.
-- ============================================================================

create table if not exists public.sign_digest (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  frequency    text not null default 'weekly' check (frequency in ('daily', 'weekly', 'off')),
  last_sent_at timestamptz,
  updated_at   timestamptz not null default now()
);

alter table public.sign_digest enable row level security;
revoke all on table public.sign_digest from anon, authenticated;

do $$ begin
  raise notice 'OK    FD Sign status emails ready · % sender(s) with a setting', (select count(*) from public.sign_digest);
end $$;

-- Check (read-only):
--   select frequency, count(*) from public.sign_digest group by 1;
