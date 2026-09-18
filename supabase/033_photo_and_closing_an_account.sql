-- ===========================================================================
-- FDAI — a profile photo, and closing an account
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- Two unrelated things that happen to live on the same settings panel:
--
--   1. A photo. A public bucket called `avatars`, with a policy that lets a
--      person write only inside their own folder, a 2 MB ceiling and three
--      image types — all enforced by the database rather than by the browser,
--      which uploads to storage directly and cannot be trusted with either.
--
--   2. Closing an account. Deactivating suspends it; deleting closes it and
--      starts a thirty-day clock, after which everything goes. The person
--      cannot sign in again from the moment they close it either way, so the
--      thirty days are FD's window to undo a mistake, not theirs — clear
--      profiles.closed_at and the account works again.
-- ===========================================================================

-- ─────────────────────────────────────────────────────────── 1. the photo
alter table public.profiles
  add column if not exists avatar_url text;

comment on column public.profiles.avatar_url is
  'Public URL of the photo in the avatars bucket. Null means show their initials.';

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    -- Public read: the photo appears beside a name, and a signed URL that
    -- expires would mean a broken image on a page left open.
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', true, 2097152,
            array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = 2097152,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

    -- Anyone may look at a photo; only its owner may put one there, and only
    -- in a folder named after their own user id.
    drop policy if exists "avatars: public read" on storage.objects;
    create policy "avatars: public read" on storage.objects
      for select using (bucket_id = 'avatars');

    drop policy if exists "avatars: write own folder" on storage.objects;
    create policy "avatars: write own folder" on storage.objects
      for insert to authenticated
      with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "avatars: replace own" on storage.objects;
    create policy "avatars: replace own" on storage.objects
      for update to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    drop policy if exists "avatars: remove own" on storage.objects;
    create policy "avatars: remove own" on storage.objects
      for delete to authenticated
      using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

    raise notice 'OK    the avatars bucket is ready (2 MB, png/jpeg/webp)';
  else
    raise notice 'NOTE  no storage schema here, so the bucket was skipped — expected outside Supabase';
  end if;
end $$;

-- ────────────────────────────────────────────────── 2. closing an account
alter table public.profiles
  add column if not exists closed_at   timestamptz,
  add column if not exists closed_kind text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_closed_kind_check'
  ) then
    alter table public.profiles
      add constraint profiles_closed_kind_check
      check (closed_kind is null or closed_kind in ('deactivated', 'deleted'));
  end if;
end $$;

comment on column public.profiles.closed_at is
  'When the person closed their account. They cannot sign in from that moment.';
comment on column public.profiles.closed_kind is
  'deactivated = suspended, kept. deleted = destroyed 30 days after closed_at.';

/*
 * The person closes their own account.
 *
 * SECURITY DEFINER because the trigger from 018 guards this table and because
 * the answer should not depend on the shape of a policy: a person is always
 * allowed to close their own account and never anybody else's, and auth.uid()
 * is the only thing that decides which is which.
 */
create or replace function public.close_my_account(p_kind text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_when timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  if p_kind not in ('deactivated', 'deleted') then
    raise exception 'unknown_kind';
  end if;

  update public.profiles
  set closed_at = v_when, closed_kind = p_kind
  where id = auth.uid();

  return v_when;
end;
$$;

revoke all on function public.close_my_account(text) from public, anon;
grant execute on function public.close_my_account(text) to authenticated;

/** Is this account closed? The sign-in screen asks before letting anyone in. */
create or replace function public.account_closed(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select closed_kind from public.profiles where id = p_user_id and closed_at is not null;
$$;

revoke all on function public.account_closed(uuid) from public;
grant execute on function public.account_closed(uuid) to anon, authenticated;

/*
 * The thirty days, finished.
 *
 * Deleting the auth user cascades: profile, drafts, versions, usage, credits,
 * settings and billing rows all reference it with ON DELETE CASCADE. A
 * DEACTIVATED account is never touched by this — suspended is not deleted.
 */
create or replace function public.prune_closed_accounts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_gone integer;
begin
  with removed as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id
      and p.closed_kind = 'deleted'
      and p.closed_at < now() - interval '30 days'
    returning 1
  )
  select count(*) into v_gone from removed;
  return v_gone;
end;
$$;

revoke all on function public.prune_closed_accounts() from public, anon, authenticated;

do $$
declare v_cols integer;
begin
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'profiles'
    and column_name in ('avatar_url', 'closed_at', 'closed_kind');
  if v_cols = 3 then
    raise notice 'OK    profiles has avatar_url, closed_at and closed_kind (% closed today)',
      (select count(*) from public.profiles where closed_at is not null);
  else
    raise notice 'FAIL  expected 3 columns on profiles, found %', v_cols;
  end if;
end $$;

-- ───────────────────────────────────────────────────────────── scheduling
-- With pg_cron enabled, this finishes the thirty days off. Until it is
-- scheduled nothing is destroyed, which is the safe direction to fail:
--
--   select cron.schedule(
--     'fdai-prune-closed-accounts',
--     '45 3 * * *',                      -- 03:45 UTC = 11:45 Singapore
--     $$select public.prune_closed_accounts()$$
--   );
