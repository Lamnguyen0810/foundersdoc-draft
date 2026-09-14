-- ===========================================================================
-- FDAI — keep the EDITED document, not just the generated text
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- `drafts.output` holds what the model produced, as plain text. Once a lawyer
-- can edit the document in place — bold a term, fill a blank, delete a clause —
-- that plain text is no longer what they are looking at, and re-deriving it
-- would throw the formatting away every time the draft was reopened.
--
-- So the edited document is stored as its own thing. `output` stays the
-- model's text (what the prompt produced, what a revision starts from);
-- `output_html` is the lawyer's version (what to show them when they return).
-- ===========================================================================

alter table public.drafts
  add column if not exists output_html text;

comment on column public.drafts.output is
  'What the model generated, as plain text. Never overwritten by editing.';
comment on column public.drafts.output_html is
  'The document as the user last saved it, including their edits and formatting.';

-- ---------------------------------------------------------------------------
-- Revisions: "make it simpler", "flag the open points", asked after the draft
-- exists. Each one is a real model call, so it cannot be unlimited and free —
-- but charging for the first tweak, when the draft has only just appeared and
-- may have missed something, reads as mean. So: a few free per draft, then a
-- credit. Both numbers are settings, not code.
-- ---------------------------------------------------------------------------
alter table public.drafts
  add column if not exists revisions integer not null default 0;

alter table public.billing_config
  add column if not exists free_revisions integer not null default 3
    check (free_revisions between 0 and 100);

comment on column public.drafts.revisions is
  'How many follow-up revisions have been made to this draft.';
comment on column public.billing_config.free_revisions is
  'Revisions allowed per draft before one costs a credit. Change freely: update billing_config.';
