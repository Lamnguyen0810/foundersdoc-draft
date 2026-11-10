-- 125  FD Sign: the signing-ready check's log (0201)
--
-- Run once in Supabase (SQL editor), after 124. Safe to run again. Adds only.
--
-- Each check keeps WHAT was found, never the document: file name, a fingerprint
-- (sha-256) of the file, the verdict, and each issue's code, level and place.
-- No quotes from the document are stored. If someone sends anyway or accepts the
-- warnings, that is recorded too, with their reason (the playbook's audit trail).
--
-- Who can see it: each person their own checks; Founders Doc admins all of them.
-- Only the server (service role) writes.

create table if not exists public.sign_checks (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null,
  owner_email    text,
  file_name      text,
  file_hash      text check (file_hash is null or file_hash ~ '^[0-9a-f]{64}$'),
  file_kind      text check (file_kind in ('pdf', 'docx')),
  pages          int,
  verdict        text not null check (verdict in ('ready', 'ready_with_ack', 'not_ready', 'not_signable_here', 'cannot_process')),
  counts         jsonb not null default '{}'::jsonb,
  codes          jsonb not null default '[]'::jsonb,
  ai_used        boolean not null default false,
  detector       text,
  decision       text check (decision in ('acknowledged', 'sent_anyway')),
  decision_reason text,
  decided_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists sign_checks_owner on public.sign_checks (owner_id, created_at desc);

alter table public.sign_checks enable row level security;
revoke all on public.sign_checks from public, anon, authenticated;
grant select on public.sign_checks to authenticated;
drop policy if exists sign_checks_read on public.sign_checks;
create policy sign_checks_read on public.sign_checks for select to authenticated
  using (owner_id = auth.uid() or public.is_admin());

do $$ begin
  raise notice 'OK    FD Sign signing-ready check log ready · % check(s) so far', (select count(*) from public.sign_checks);
end $$;
