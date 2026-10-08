-- ============================================================================
-- 085 — Videos added from the admin console
--
-- An admin pastes a YouTube link under Admin → Videos. The title and
-- thumbnail are read from YouTube; the admin picks the shelf, the topic and
-- the date, and the video is on /podcast within a minute — in the featured
-- carousel (if featured), in New episodes and on its shelf — with no code
-- change and no deploy. The blog's pattern (055), for videos.
--
--   podcast_videos  one row per video. youtube_id is the 11-character id in
--                   the link. shelf is where it sits on the page besides New
--                   episodes; category is the colour and the filter chip.
--
-- Anyone may read a LIVE video (it is the public website). Only admins
-- (public.is_admin(), 001) may read the rest or write.
--
-- Safe to run twice.
-- ============================================================================

create table if not exists public.podcast_videos (
  id            uuid primary key default gen_random_uuid(),
  youtube_id    text not null unique check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  title         text not null check (length(title) between 1 and 200),
  description   text not null default '' check (length(description) <= 600),
  category      text not null default 'general'
                check (category in ('general', 'fundraising', 'companydocs', 'hr', 'ma')),
  shelf         text not null default 'general'
                check (shelf in ('general', 'fundraising', 'companydocs', 'stories', 'shorts', 'none')),
  kind          text not null default 'video' check (kind in ('video', 'short')),
  published_on  date not null default current_date,
  featured      boolean not null default true,
  status        text not null default 'live' check (status in ('live', 'hidden')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists podcast_videos_live_idx on public.podcast_videos (status, published_on desc);

comment on table public.podcast_videos is
  'Videos on /podcast added from the admin console: a YouTube link, a shelf, a topic, a date. Live rows are public.';

alter table public.podcast_videos enable row level security;

drop policy if exists "videos: read live" on public.podcast_videos;
create policy "videos: read live" on public.podcast_videos
  for select using (status = 'live');

drop policy if exists "videos: admins read all" on public.podcast_videos;
create policy "videos: admins read all" on public.podcast_videos
  for select to authenticated using (public.is_admin());

drop policy if exists "videos: admins write" on public.podcast_videos;
create policy "videos: admins write" on public.podcast_videos
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.podcast_videos to anon, authenticated;
grant insert, update, delete on public.podcast_videos to authenticated;

create or replace function public.podcast_videos_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists podcast_videos_touch on public.podcast_videos;
create trigger podcast_videos_touch before update on public.podcast_videos
  for each row execute function public.podcast_videos_touch();

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    podcast_videos is ready. Admin → Videos → paste a YouTube link.';
end $$;
