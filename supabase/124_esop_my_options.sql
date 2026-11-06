-- 124  "My share options": each option holder's own page (holder access, Premium)
--
-- Run once in Supabase (SQL editor), after 123. Safe to run again. Adds only.
--
-- How a holder gets in (the plan doc, 5 Nov 2026):
--   1. a private link by email ("View my share options"): a random 256-bit key,
--      only its fingerprint (sha-256) is stored here
--   2. the first time in a browser, a 6-digit code to the holder's own email, so a
--      forwarded email alone shows nothing; that browser is then trusted for 30 days
--   3. "Send me my link" on foundersdoc.com/my-options emails a fresh link, only to
--      an address already on a holder's row
-- The page is read-only and shows the holder's own record only. It works only while
-- the company has Holder access switched on (esop_companies.holder_access, 123).
--
-- WHO CAN TOUCH IT. Nobody signed in: these tables are read and written only by the
-- server (service role), after checking the link, the code and the browser.

create table if not exists public.esop_holder_links (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.esop_companies (id) on delete cascade,
  holder_id     uuid not null references public.esop_holders (id) on delete cascade,
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at    timestamptz not null default now(),
  created_by    text,
  expires_at    timestamptz not null,
  revoked_at    timestamptz,
  -- the email code (as FD Sign's, 114): 10 minutes, 5 tries, at most 5 an hour
  code_hash     text,
  code_expires  timestamptz,
  code_tries    int not null default 0,
  code_sent_at  timestamptz,
  code_sends    int not null default 0,
  code_window   timestamptz
);
create index if not exists esop_holder_links_holder on public.esop_holder_links (holder_id, created_at desc);

create table if not exists public.esop_holder_devices (
  link_id      uuid not null references public.esop_holder_links (id) on delete cascade,
  secret_hash  text not null check (secret_hash ~ '^[0-9a-f]{64}$'),
  verified_at  timestamptz not null default now(),
  primary key (link_id, secret_hash)
);

-- Every open, code and download, like the signing audit trail
create table if not exists public.esop_holder_opens (
  id          bigserial primary key,
  link_id     uuid references public.esop_holder_links (id) on delete set null,
  holder_id   uuid references public.esop_holders (id) on delete cascade,
  company_id  uuid references public.esop_companies (id) on delete cascade,
  event       text not null check (event in ('link_sent', 'code_sent', 'code_verified', 'code_wrong', 'opened', 'download', 'link_requested')),
  at          timestamptz not null default now(),
  ip          text,
  user_agent  text,
  detail      text
);
create index if not exists esop_holder_opens_holder on public.esop_holder_opens (holder_id, at desc);

alter table public.esop_holder_links enable row level security;
alter table public.esop_holder_devices enable row level security;
alter table public.esop_holder_opens enable row level security;
revoke all on public.esop_holder_links, public.esop_holder_devices, public.esop_holder_opens from public, anon, authenticated;

do $$ begin
  raise notice 'OK    My share options ready · holder access on for % compan(ies) · % link(s) issued',
    (select count(*) from public.esop_companies where holder_access),
    (select count(*) from public.esop_holder_links);
end $$;
