-- ============================================================================
-- 149 — FD Sign: key controllers (status updates) (0296)
--
-- Rachel (huddle): "I designate this guy as the key controller. He knows who has
-- signed and who hasn't." Up to 3 people per document get an email each time
-- someone signs (and when all have signed, or it is cancelled): names, roles and
-- times only, never the document. Supplemental documents need no table: they are
-- inserted into the PDF before sending and recorded in the audit trail.
--
-- Run once in Supabase (SQL editor). Safe to run twice. Adds only.
-- ============================================================================

create table if not exists public.sign_controllers (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.sign_envelopes (id) on delete cascade,
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 200),
  created_at   timestamptz not null default now(),
  unique (envelope_id, email)
);
create index if not exists sign_controllers_envelope on public.sign_controllers (envelope_id);

alter table public.sign_controllers enable row level security;
revoke all on table public.sign_controllers from anon, authenticated;

do $$ begin
  raise notice 'OK    FD Sign key controllers ready · % on file', (select count(*) from public.sign_controllers);
end $$;
