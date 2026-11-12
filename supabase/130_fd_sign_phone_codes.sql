-- ============================================================================
-- 130 — FD Sign: the signing code by WhatsApp or SMS, chosen by the sender (0222)
--
-- Rachel (11 Nov): the email code proves little when the signing link came by
-- email too; let the sender choose phone or email. Each signer can now get the
-- code by email (as before), WhatsApp or SMS. Email stays the default and the
-- fallback (if a WhatsApp / SMS code can't be sent, it goes by email).
-- Which phone channels are offered is set in Vercel (lib/sign/phone.ts), so they
-- can be switched on, off or swapped without a code change.
--
-- Run once in Supabase (SQL editor), after 112-120. Safe to run twice. Adds only.
-- ============================================================================

alter table public.sign_signers add column if not exists phone text
  check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
alter table public.sign_signers add column if not exists code_channel text not null default 'email'
  check (code_channel in ('email', 'whatsapp', 'sms'));

do $$ begin
  raise notice 'OK    FD Sign phone codes ready · % signer(s) on WhatsApp / SMS',
    (select count(*) from public.sign_signers where code_channel <> 'email');
end $$;

-- Check (read-only):
--   select code_channel, count(*) from public.sign_signers group by 1;
