-- ============================================================================
-- 063 · Drafts cut off by the time limit are finished, not thrown away
-- ============================================================================
--
-- A draft that runs out of time is now saved as far as it got (the credit is
-- kept for it) and finished by /api/generate/continue, which writes only the
-- rest. `continuations` counts how many times it has been continued:
--
--   null  the draft is complete (every draft until now)
--   0     cut off, not yet continued
--   1..3  continued that many times; at 3 the app stops trying
--
-- The limit is what stops one credit buying unlimited model time. The app
-- works before this is run (it continues without a counter), but run it.
--
-- Safe to run again.
-- ============================================================================

alter table public.drafts add column if not exists continuations smallint
  check (continuations is null or continuations between 0 and 10);

comment on column public.drafts.continuations is
  'Null when complete. 0..3: cut off by the time limit and continued this many times (patch 0053).';

-- Check: drafts still being finished
--   select id, title, continuations, updated_at from public.drafts where continuations is not null order by updated_at desc;
