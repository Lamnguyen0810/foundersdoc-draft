-- 112  FD Sign: our own e-signing (first use: HitPay Option Certificates)
--
-- Run once in Supabase (SQL editor), after 105-111. Safe to run again.
--
-- BATCH. Several certificates can go out as one batch: the Director gets ONE
-- link for all of them and signs once (the same token is on each of their
-- signer rows), then each holder gets their own link for their own certificate.
--
-- WHAT. A document (PDF) goes to signers in order — e.g. the Director first,
-- then the option holder. Each signer gets a private link (/sign/<token>),
-- views the document, agrees to sign electronically, draws or types a
-- signature and signs. When the last person signs, the signed PDF is the
-- original pages + a signature page + an audit trail page (who, when, IP,
-- browser, and the SHA-256 fingerprint of the original), built on request so
-- it can never be swapped for something else.
--
-- WHO CAN TOUCH IT. Nobody through the browser: row-level security is on and
-- there are NO policies, so only the server (app/api/sign/*, with the secret
-- key) reads or writes, after checking either a Founders Doc admin session or
-- a signer's token. Tokens are stored as SHA-256 hashes only.
--
-- LEGAL NOTE (Singapore). s 8 Electronic Transactions Act 2010: a signature
-- requirement is met by an electronic record if a method identifies the person
-- and indicates their intention, and is reliable. s 4 + First Schedule list
-- the excluded matters (e.g. wills, negotiable instruments, powers of attorney,
-- sale of immovable property) — not used for those.

create table if not exists public.sign_envelopes (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 1 and 200),
  file_name        text not null default 'document.pdf',
  original         bytea not null,
  original_sha256  text not null,
  page_count       int,
  message          text check (message is null or length(message) <= 2000),
  batch_id         uuid,
  status           text not null default 'sent' check (status in ('sent', 'completed', 'voided')),
  esop_holder_id   uuid references public.esop_holders (id) on delete set null,
  esop_tranche     int,
  filed_document_id uuid,
  created_by       text,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create table if not exists public.sign_signers (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references public.sign_envelopes (id) on delete cascade,
  position        int  not null check (position between 1 and 20),
  name            text not null check (length(name) between 1 and 160),
  email           text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role            text not null default 'Signer' check (length(role) between 1 and 80),
  token_hash      text,            -- one token may cover several rows (batch)
  status          text not null default 'waiting' check (status in ('waiting', 'invited', 'signed')),
  invited_at      timestamptz,
  viewed_at       timestamptz,
  signed_at       timestamptz,
  signature_kind  text check (signature_kind in ('draw', 'type')),
  signature_png   bytea,
  typed_name      text,
  ip              text,
  user_agent      text,
  unique (envelope_id, position)
);
create index if not exists sign_signers_envelope on public.sign_signers (envelope_id, position);
create index if not exists sign_signers_token on public.sign_signers (token_hash);
create index if not exists sign_envelopes_batch on public.sign_envelopes (batch_id);

create table if not exists public.sign_events (
  id           bigserial primary key,
  envelope_id  uuid not null references public.sign_envelopes (id) on delete cascade,
  signer_id    uuid references public.sign_signers (id) on delete cascade,
  event        text not null,
  at           timestamptz not null default now(),
  ip           text,
  user_agent   text,
  detail       text
);
create index if not exists sign_events_envelope on public.sign_events (envelope_id, at);

alter table public.sign_envelopes enable row level security;
alter table public.sign_signers   enable row level security;
alter table public.sign_events    enable row level security;
revoke all on public.sign_envelopes, public.sign_signers, public.sign_events from anon, authenticated;

do $$ begin raise notice 'OK    FD Sign tables ready (server-only: needs SUPABASE_SECRET_KEY in Vercel)'; end $$;
