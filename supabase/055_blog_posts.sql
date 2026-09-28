-- ============================================================================
-- 055 — Blog posts written in the admin console
--
-- An admin uploads an article (Word, Markdown or text) and a photo, chooses
-- which words become links, and publishes. The post is live at
-- /resources/<slug> within a minute and appears on the blog page — no code
-- change, no deploy.
--
--   blog_posts  one row per article. body_html is the cleaned article; the
--               links are kept apart and applied when the page is built, so
--               a link can be changed later without re-uploading the file.
--   blog        a public storage bucket for the photos (5 MB, png/jpeg/webp).
--
-- Anyone may read a PUBLISHED post (it is the public website). Only admins
-- (public.is_admin(), 001) may read drafts, write posts or upload photos.
--
-- Safe to run twice.
-- ============================================================================

create table if not exists public.blog_posts (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 90),
  title         text not null check (char_length(title) between 3 and 200),
  deck          text not null default '' check (char_length(deck) <= 400),
  summary       text not null default '' check (char_length(summary) <= 800),
  category      text not null default 'contracts'
                check (category in ('fundraising', 'contracts', 'company', 'hiring', 'ai')),
  cta           text not null default 'nda' check (cta in ('nda', 'term', 'draft', 'none')),
  body_html     text not null default '',
  links         jsonb not null default '[]'::jsonb,
  hero_url      text,
  hero_alt      text not null default '',
  hero_caption  text not null default '',
  read_minutes  int not null default 1 check (read_minutes between 1 and 120),
  source_name   text not null default '',
  status        text not null default 'draft' check (status in ('draft', 'published')),
  published_at  date,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists blog_posts_live_idx on public.blog_posts (status, published_at desc);

comment on table public.blog_posts is
  'Articles written in the admin console (055). Published rows are served at /resources/<slug>.';

alter table public.blog_posts enable row level security;

drop policy if exists "blog: read published" on public.blog_posts;
create policy "blog: read published" on public.blog_posts
  for select using (status = 'published');

drop policy if exists "blog: admins read all" on public.blog_posts;
create policy "blog: admins read all" on public.blog_posts
  for select to authenticated using (public.is_admin());

drop policy if exists "blog: admins write" on public.blog_posts;
create policy "blog: admins write" on public.blog_posts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;

create or replace function public.blog_posts_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists blog_posts_touch on public.blog_posts;
create trigger blog_posts_touch before update on public.blog_posts
  for each row execute function public.blog_posts_touch();

-- ── the photos ────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('blog', 'blog', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
    on conflict (id) do update
      set public = true,
          file_size_limit = 5242880,
          allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

    drop policy if exists "blog: public read" on storage.objects;
    create policy "blog: public read" on storage.objects
      for select using (bucket_id = 'blog');

    drop policy if exists "blog: admins upload" on storage.objects;
    create policy "blog: admins upload" on storage.objects
      for insert to authenticated with check (bucket_id = 'blog' and public.is_admin());

    drop policy if exists "blog: admins replace" on storage.objects;
    create policy "blog: admins replace" on storage.objects
      for update to authenticated using (bucket_id = 'blog' and public.is_admin());

    drop policy if exists "blog: admins remove" on storage.objects;
    create policy "blog: admins remove" on storage.objects
      for delete to authenticated using (bucket_id = 'blog' and public.is_admin());

    raise notice 'OK    the blog photo bucket is ready (5 MB, png/jpeg/webp)';
  else
    raise notice 'NOTE  no storage schema here, so the bucket was skipped — expected outside Supabase';
  end if;
end $$;

-- Check:
-- select slug, status, published_at from public.blog_posts order by updated_at desc;
