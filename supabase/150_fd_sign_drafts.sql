-- ============================================================================
-- 150 — FD Sign: save a signing request as a draft (0305)
--
-- "Please prepare all three envelopes for my review, but do not send them out
-- yet." A request can now be saved with status 'draft': its document, people,
-- boxes, copies, order and reminders are kept, nobody is emailed, and it is
-- sent later from the document page ("Send now"). A draft does not count
-- towards the plan's requests until it is sent.
--
-- Run once in Supabase (SQL editor). Safe to run twice. Changes one check only.
-- ============================================================================

alter table public.sign_envelopes drop constraint if exists sign_envelopes_status_check;
alter table public.sign_envelopes add constraint sign_envelopes_status_check
  check (status in ('draft', 'sent', 'completed', 'voided'));

do $$ begin
  raise notice 'OK    FD Sign drafts ready · % draft(s) on file', (select count(*) from public.sign_envelopes where status = 'draft');
end $$;
