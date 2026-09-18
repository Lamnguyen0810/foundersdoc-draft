-- ===========================================================================
-- FDAI — the rest of the settings page, and a wastebasket for documents
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- Three things:
--
--   1. Two more settings per person: whether deleting a document keeps it for
--      thirty days first, and whether FoundersDoc may ever learn from their
--      documents. The second changes nothing today — nothing is used to train
--      anything — but the answer is recorded rather than assumed.
--
--   2. `drafts.deleted_at`. Deleting a document now marks it instead of
--      destroying it, so a misclick is recoverable for thirty days. Everything
--      the person sees filters these out; the admin console does not, because
--      a document deleted this morning is still a document the firm holds.
--
--   3. `prune_deleted_drafts()`, which finishes the job. Schedule it daily
--      once pg_cron is enabled — see the note at the bottom.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────── 1. settings
alter table public.user_settings
  add column if not exists retain_deleted  boolean not null default true,
  add column if not exists improve_product boolean not null default false;

comment on column public.user_settings.retain_deleted is
  'Deleted documents are kept for 30 days before being destroyed. Off deletes at once.';
comment on column public.user_settings.improve_product is
  'Consent for FoundersDoc to learn from this person''s documents. Nothing does so today.';

-- ──────────────────────────────────────────────── 2. the wastebasket
alter table public.drafts
  add column if not exists deleted_at timestamptz;

comment on column public.drafts.deleted_at is
  'When the owner deleted it. Hidden from them from that moment; destroyed 30 days later.';

-- Everything the person sees is "my drafts, not deleted, newest first".
create index if not exists drafts_user_live_idx
  on public.drafts (user_id, created_at desc)
  where deleted_at is null;

-- And the prune wants the opposite.
create index if not exists drafts_deleted_idx
  on public.drafts (deleted_at)
  where deleted_at is not null;

-- ───────────────────────────────────────────────────────── 3. the prune
-- Thirty days is the promise the settings page makes, so it is written here
-- once rather than in the application, where it could drift from the words.
create or replace function public.prune_deleted_drafts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_gone integer;
begin
  with removed as (
    delete from public.drafts
    where deleted_at is not null
      and deleted_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_gone from removed;
  return v_gone;
end;
$$;

-- Nobody calls this as a person; the scheduler calls it as the database owner.
revoke all on function public.prune_deleted_drafts() from public, anon, authenticated;

do $$
declare v_cols integer;
begin
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'user_settings' and column_name in ('retain_deleted', 'improve_product'))
      or (table_name = 'drafts' and column_name = 'deleted_at')
    );
  if v_cols = 3 then
    raise notice 'OK    settings and deleted_at are in place (% document(s) in the wastebasket)',
      (select count(*) from public.drafts where deleted_at is not null);
  else
    raise notice 'FAIL  expected 3 new columns, found %', v_cols;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────── scheduling
-- Once pg_cron is enabled (Database → Extensions → pg_cron), run this to
-- finish the thirty days off. Until then nothing is destroyed — which is the
-- safe direction to fail, and the reason it is not part of the migration:
--
--   select cron.schedule(
--     'fdai-prune-deleted-drafts',
--     '30 3 * * *',                      -- 03:30 UTC = 11:30 Singapore
--     $$select public.prune_deleted_drafts()$$
--   );
