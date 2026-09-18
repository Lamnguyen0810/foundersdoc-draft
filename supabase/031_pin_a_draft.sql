-- ===========================================================================
-- FDAI — a draft can be pinned
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- The rail lists drafts newest first and groups them by when they were made,
-- which is the right order for everything except the two or three a person is
-- actually living in. Those get pinned to the top and stay there.
--
-- Pinning belongs in the database rather than in the browser: it is a fact
-- about the draft, and a lawyer who pins something on the laptop should find
-- it pinned on the desktop. Row-level security already restricts drafts to
-- their owner, so no new policy is needed — a person can only pin their own.
-- ===========================================================================
alter table public.drafts
  add column if not exists pinned boolean not null default false;

comment on column public.drafts.pinned is
  'Kept at the top of the past-drafts list. The owner sets it; nothing else reads it.';

-- The rail asks for "my drafts, pinned first, newest first", every time it
-- renders. This is that query.
create index if not exists drafts_user_pinned_created_idx
  on public.drafts (user_id, pinned desc, created_at desc);

do $$
declare v_has boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'drafts' and column_name = 'pinned'
  ) into v_has;
  if v_has then
    raise notice 'OK    drafts.pinned exists (% pinned right now)',
      (select count(*) from public.drafts where pinned);
  else
    raise notice 'FAIL  drafts.pinned was not added';
  end if;
end $$;
