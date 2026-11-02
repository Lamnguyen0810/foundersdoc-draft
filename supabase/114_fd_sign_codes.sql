-- 114  FD Sign: email code before signing
--
-- Run once in Supabase (SQL editor), after 112 and 113. Safe to run again.
--
-- Before someone signs, FD Sign emails them a 6-digit code (10 minutes, 5
-- tries). One row per signing link (its token's SHA-256). Only fingerprints
-- are stored: of the code, and of the browser session that confirmed it, so
-- the signature must come from the browser that entered the right code.

create table if not exists public.sign_codes (
  token_hash    text primary key,                 -- sign_signers.token_hash
  code_hash     text,                             -- sha256(token_hash:code), cleared once used
  expires_at    timestamptz,
  tries         int  not null default 0 check (tries between 0 and 100),
  sent_at       timestamptz,
  sends         int  not null default 0 check (sends between 0 and 1000),
  window_start  timestamptz,                      -- for "5 codes an hour"
  session_hash  text,                             -- sha256 of the confirmed browser's secret
  verified_at   timestamptz
);
alter table public.sign_codes enable row level security;
revoke all on public.sign_codes from anon, authenticated;

do $$ begin raise notice 'OK    FD Sign email codes ready'; end $$;
