-- ============================================================================
-- 134 — SEO by region: Search Console exports uploaded on Admin → SEO
--
-- Run once in Supabase (SQL editor), after 104. Safe to run twice.
--
-- WHY. The daily SEO check's "found / not found" came from a free web search run
-- from the United States, which is not Google and not where our customers search.
-- Google's own figures, by country, are in Search Console. An admin exports them
-- (Performance → Export → Download CSV) and drops the file on Admin → SEO; each
-- upload is kept here, so the page can show where we appear in each region and
-- how that moved since the last upload.
--
-- One row per upload. `country` is null for an all-countries export, or the
-- country a filtered export was made for. Nothing personal is stored: countries,
-- search phrases and their counts only.
--
-- Founders Doc admins only (row-level security), like the other SEO tables (104).
-- ============================================================================

create table if not exists public.seo_region_uploads (
  id           uuid primary key default gen_random_uuid(),
  uploaded_at  timestamptz not null default now(),
  uploaded_by  text,
  date_from    date,
  date_to      date,
  country      text check (country is null or length(country) <= 80),
  countries    jsonb not null default '[]'::jsonb,
  queries      jsonb not null default '[]'::jsonb,
  constraint seo_region_uploads_size check (jsonb_array_length(countries) <= 300 and jsonb_array_length(queries) <= 1000)
);
create index if not exists seo_region_uploads_latest on public.seo_region_uploads (uploaded_at desc);

alter table public.seo_region_uploads enable row level security;
revoke all on table public.seo_region_uploads from anon;
grant select, insert, delete on table public.seo_region_uploads to authenticated;
drop policy if exists seo_region_uploads_admin on public.seo_region_uploads;
create policy seo_region_uploads_admin on public.seo_region_uploads
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

do $$ begin
  raise notice 'OK    SEO by region ready · % upload(s) so far', (select count(*) from public.seo_region_uploads);
end $$;
