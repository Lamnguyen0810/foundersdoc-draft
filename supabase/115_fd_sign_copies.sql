-- 115  FD Sign: copies of the signed document (CC)
--
-- Run once in Supabase (SQL editor), after 112-114. Safe to run again.
--
-- People who don't sign but get the signed copy when everyone has signed
-- (e.g. Rachel, HitPay HR). At completion each gets an email with a private
-- link that downloads the signed copy; only the link's SHA-256 is stored.

create table if not exists public.sign_viewers (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.sign_envelopes (id) on delete cascade,
  email        text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  token_hash   text,
  sent_at      timestamptz,
  unique (envelope_id, email)
);
create index if not exists sign_viewers_token on public.sign_viewers (token_hash);
alter table public.sign_viewers enable row level security;
revoke all on public.sign_viewers from anon, authenticated;

do $$ begin raise notice 'OK    FD Sign copies (CC) ready'; end $$;
