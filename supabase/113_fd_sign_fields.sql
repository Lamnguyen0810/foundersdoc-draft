-- 113  FD Sign: signature boxes on the lines
--
-- Run once in Supabase (SQL editor), after 112. Safe to run again.
--
-- Each box says where one signer's signature (or the date they signed, or
-- their name) is stamped on the document: page number and a rectangle given
-- as fractions of the page (0-1, from the top-left), so it does not depend on
-- the screen size it was placed on. Placed automatically on the "Director" /
-- "Option Holder" lines and adjustable by drag and resize (app/admin/sign).
-- A signer with no box falls back to a signature block on the audit page.

create table if not exists public.sign_fields (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.sign_envelopes (id) on delete cascade,
  position     int  not null check (position between 1 and 20),   -- which signer (sign_signers.position)
  kind         text not null default 'signature' check (kind in ('signature', 'date', 'name')),
  page         int  not null check (page between 1 and 500),
  x            real not null check (x >= 0 and x <= 1),
  y            real not null check (y >= 0 and y <= 1),
  w            real not null check (w > 0 and w <= 1),
  h            real not null check (h > 0 and h <= 1)
);
create index if not exists sign_fields_envelope on public.sign_fields (envelope_id);
alter table public.sign_fields enable row level security;
revoke all on public.sign_fields from anon, authenticated;

do $$ begin raise notice 'OK    FD Sign signature boxes ready'; end $$;
