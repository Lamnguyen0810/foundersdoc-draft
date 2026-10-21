-- ============================================================================
-- 104 — The SEO agent's memory
--
-- What the SEO research finds is kept here, so it can be shown in Admin →
-- SEO, deduplicated from day to day, approved, and measured:
--
--   seo_settings         one row: the website, markets, competitors, seed
--                        keywords, budget, scoring weights, and the hash of
--                        the private key the daily research sends with its
--                        findings
--   seo_runs             each research run or website scan: when, what,
--                        how it went, what it could not check
--   seo_findings         each finding, with its sources (link + date), how
--                        sure we are (confidence) and whether it is measured
--                        (verified) or a guess (estimate); repeats are
--                        counted, not added again
--   seo_keywords         the keyword list; numbers (search volume,
--                        difficulty, position) only with their source —
--                        a number without a source is not stored
--   seo_recommendations  what to do, why, how to check it worked, and its
--                        status: proposed → approved → done → measuring
--                        (or rejected)
--
-- Admins read and change everything (row-level security). The daily
-- research (a scheduled Claude task, no account) writes only through
-- seo_ingest(key, payload), which checks the key, validates every field
-- and caps volume. Nothing here publishes anything on the website.
--
-- Set the key once (keep it private; put the same value where the research
-- and the website scan read it — see SEO_AGENT.md):
--   select public.set_seo_ingest_key('<a long random key>');
--
-- Safe to run twice. Run after 103.
-- ============================================================================

-- 1. Settings ---------------------------------------------------------------------
create table if not exists public.seo_settings (
  id                 smallint primary key default 1 check (id = 1),
  site_url           text not null default 'https://foundersdoc.com',
  business           text not null default 'Founders Doc is a Singapore law practice for founders and start-ups. FD AI drafts start-up legal documents online from the firm''s own wording.',
  audience           text not null default 'Founders, start-ups and small businesses',
  goals              text not null default 'More people finding FD AI on Google, starting a draft and creating a free account',
  countries          text[] not null default array['Singapore', 'United Kingdom', 'United States'],
  languages          text[] not null default array['English'],
  categories         text[] not null default array['NDA', 'Term sheet', 'Employment agreement', 'Contractor agreement', 'Shareholders'' agreement', 'Share purchase agreement', 'Share subscription agreement', 'Investment agreement', 'Services agreement', 'Loan agreement', 'Convertible loan agreement', 'IP assignment agreement', 'Joint venture agreement'],
  competitors        text[] not null default array['lawdepot.com', 'rocketlawyer.com', 'docpro.com', 'sprintlaw.com.au'],
  seed_keywords      text[] not null default array['NDA template Singapore', 'draft NDA online', 'employment contract template Singapore', 'shareholders agreement template Singapore'],
  platform           text not null default 'Next.js on Vercel, Supabase, static marketing pages in public/',
  frequency          text not null default 'daily' check (frequency in ('daily', 'weekdays', 'weekly', 'paused')),
  monthly_budget_sgd numeric not null default 0 check (monthly_budget_sgd >= 0),
  scoring            jsonb not null default '{"relevance": 3, "intent": 2, "demand": 2, "position": 2, "competition": 1, "effort": 1}'::jsonb,
  ingest_key_hash    text,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id) on delete set null
);
insert into public.seo_settings (id) values (1) on conflict (id) do nothing;

-- 2. Runs -------------------------------------------------------------------------
create table if not exists public.seo_runs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  source      text not null check (source in ('website_scan', 'daily_research', 'weekly_summary', 'manual')),
  status      text not null default 'ok' check (status in ('ok', 'partial', 'failed')),
  summary     text check (length(summary) <= 4000),
  stats       jsonb not null default '{}'::jsonb,
  limitations text check (length(limitations) <= 2000),
  cost_sgd    numeric not null default 0 check (cost_sgd >= 0),
  created_by  uuid references auth.users (id) on delete set null
);
create index if not exists seo_runs_created on public.seo_runs (created_at desc);

-- 3. Findings ---------------------------------------------------------------------
create table if not exists public.seo_findings (
  id           uuid primary key default gen_random_uuid(),
  run_id       uuid references public.seo_runs (id) on delete set null,
  found_at     timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count   integer not null default 1,
  kind         text not null check (kind in ('keyword', 'competitor', 'content_gap', 'technical', 'question', 'trend', 'page_improvement')),
  title        text not null check (length(title) between 1 and 300),
  detail       text check (length(detail) <= 3000),
  page_url     text check (length(page_url) <= 500),
  keyword      text check (length(keyword) <= 200),
  evidence     jsonb not null default '[]'::jsonb,
  confidence   text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  certainty    text not null default 'estimate' check (certainty in ('verified', 'estimate')),
  fingerprint  text not null unique
);
create index if not exists seo_findings_seen on public.seo_findings (last_seen_at desc);

-- 4. Keywords ---------------------------------------------------------------------
create table if not exists public.seo_keywords (
  id                uuid primary key default gen_random_uuid(),
  keyword           text not null check (length(keyword) between 1 and 200),
  country           text not null default 'Singapore',
  language          text not null default 'English',
  intent            text not null default 'unknown' check (intent in ('informational', 'commercial', 'transactional', 'navigational', 'unknown')),
  variations        text[] not null default '{}',
  page_url          text,
  search_volume     integer check (search_volume >= 0),
  volume_source     text,
  difficulty        integer check (difficulty between 0 and 100),
  difficulty_source text,
  our_position      numeric check (our_position > 0),
  position_source   text,
  impressions       integer check (impressions >= 0),
  competitor_pages  text[] not null default '{}',
  content_type      text,
  relevance         smallint not null default 3 check (relevance between 1 and 5),
  effort            text not null default 'medium' check (effort in ('small', 'medium', 'large')),
  next_action       text,
  first_seen        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  /* A number without its source is not kept. */
  constraint seo_keywords_volume_sourced check (search_volume is null or volume_source is not null),
  constraint seo_keywords_difficulty_sourced check (difficulty is null or difficulty_source is not null),
  constraint seo_keywords_position_sourced check (our_position is null or position_source is not null)
);
create unique index if not exists seo_keywords_unique on public.seo_keywords (lower(keyword), country, language);

-- 5. Recommendations --------------------------------------------------------------
create table if not exists public.seo_recommendations (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  title         text not null check (length(title) between 1 and 300),
  description   text check (length(description) <= 3000),
  page_url      text,
  new_page      boolean not null default false,
  keyword       text,
  intent        text,
  why           text check (length(why) <= 2000),
  impact        text not null default 'medium' check (impact in ('high', 'medium', 'low')),
  effort        text not null default 'medium' check (effort in ('small', 'medium', 'large')),
  cost_note     text,
  priority      smallint not null default 2 check (priority between 1 and 3),
  steps         text[] not null default '{}',
  validation    text,
  evidence      jsonb not null default '[]'::jsonb,
  finding_id    uuid references public.seo_findings (id) on delete set null,
  status        text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'in_progress', 'done', 'measuring')),
  status_note   text check (length(status_note) <= 1000),
  decided_by    uuid references auth.users (id) on delete set null,
  decided_at    timestamptz,
  done_at       timestamptz,
  fingerprint   text not null unique
);
create index if not exists seo_recommendations_status on public.seo_recommendations (status, priority, created_at desc);

-- 6. Who may read and write: admins only -------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['seo_settings', 'seo_runs', 'seo_findings', 'seo_keywords', 'seo_recommendations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t || '_admin', t);
  end loop;
end $$;
/* The key's hash never leaves the database, not even to admins: the settings
   row is readable and editable column by column, every column but the hash. */
revoke all on table public.seo_settings from authenticated;
grant select (id, site_url, business, audience, goals, countries, languages, categories, competitors, seed_keywords, platform, frequency, monthly_budget_sgd, scoring, updated_at, updated_by) on public.seo_settings to authenticated;
grant update (site_url, business, audience, goals, countries, languages, categories, competitors, seed_keywords, platform, frequency, monthly_budget_sgd, scoring, updated_at, updated_by) on public.seo_settings to authenticated;

-- 7. The private key ---------------------------------------------------------------
create or replace function public.set_seo_ingest_key(p_key text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_key is null or length(p_key) < 24 then
    raise exception 'Use a key of at least 24 characters.';
  end if;
  update public.seo_settings set ingest_key_hash = encode(sha256(convert_to(p_key, 'UTF8')), 'hex'), updated_at = now() where id = 1;
  return 'SEO key set.';
end;
$$;
revoke all on function public.set_seo_ingest_key(text) from public, anon, authenticated;

/* Whether the key is set — for the SEO tab's setup list. Admins only; never the key. */
create or replace function public.seo_has_ingest_key()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case when public.is_admin() then (select ingest_key_hash is not null from public.seo_settings where id = 1) end;
$$;
revoke all on function public.seo_has_ingest_key() from public, anon;
grant execute on function public.seo_has_ingest_key() to authenticated;

-- 8. The only way in for the daily research ----------------------------------------
create or replace function public.seo_ingest(p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hash    text;
  v_run     uuid;
  v_source  text := coalesce(p_payload ->> 'source', 'daily_research');
  v_status  text := coalesce(p_payload ->> 'status', 'ok');
  v_new     int := 0;
  v_seen    int := 0;
  v_kw      int := 0;
  v_recs    int := 0;
  f         jsonb;
  k         jsonb;
  r         jsonb;
  v_fp      text;
  v_ins     boolean;
  v_vol     int;
  v_diff    int;
  v_pos     numeric;
  txt       text;
begin
  select ingest_key_hash into v_hash from public.seo_settings where id = 1;
  if v_hash is null or p_key is null or encode(sha256(convert_to(p_key, 'UTF8')), 'hex') <> v_hash then
    raise exception 'not allowed';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 200000 then
    raise exception 'bad payload';
  end if;
  if v_source not in ('website_scan', 'daily_research', 'weekly_summary', 'manual') then v_source := 'daily_research'; end if;
  if v_status not in ('ok', 'partial', 'failed') then v_status := 'ok'; end if;
  /* A lid on volume: 12 runs a day is far more than the schedule needs. */
  if (select count(*) from public.seo_runs where created_at > now() - interval '1 day') >= 12 then
    raise exception 'too many runs today';
  end if;

  insert into public.seo_runs (source, status, summary, limitations, stats)
  values (
    v_source, v_status,
    nullif(left(coalesce(p_payload ->> 'summary', ''), 4000), ''),
    nullif(left(coalesce(p_payload ->> 'limitations', ''), 2000), ''),
    case when jsonb_typeof(p_payload -> 'stats') = 'object' and length((p_payload -> 'stats')::text) < 20000 then p_payload -> 'stats' else '{}'::jsonb end
  )
  returning id into v_run;

  -- Findings: new ones added, repeats counted.
  for f in select * from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'findings') = 'array' then p_payload -> 'findings' else '[]'::jsonb end) limit 60 loop
    txt := left(btrim(coalesce(f ->> 'title', '')), 300);
    continue when txt = '' or coalesce(f ->> 'kind', '') not in ('keyword', 'competitor', 'content_gap', 'technical', 'question', 'trend', 'page_improvement');
    v_fp := md5(lower(f ->> 'kind') || '|' || lower(txt) || '|' || lower(coalesce(f ->> 'page_url', '')) || '|' || lower(coalesce(f ->> 'keyword', '')));
    insert into public.seo_findings (run_id, kind, title, detail, page_url, keyword, evidence, confidence, certainty, fingerprint)
    values (
      v_run, f ->> 'kind', txt,
      nullif(left(coalesce(f ->> 'detail', ''), 3000), ''),
      nullif(left(coalesce(f ->> 'page_url', ''), 500), ''),
      nullif(left(coalesce(f ->> 'keyword', ''), 200), ''),
      case when jsonb_typeof(f -> 'evidence') = 'array' and length((f -> 'evidence')::text) < 6000 then f -> 'evidence' else '[]'::jsonb end,
      case when f ->> 'confidence' in ('high', 'medium', 'low') then f ->> 'confidence' else 'medium' end,
      case when f ->> 'certainty' = 'verified' then 'verified' else 'estimate' end,
      v_fp
    )
    on conflict (fingerprint) do update
      set seen_count = public.seo_findings.seen_count + 1, last_seen_at = now(), run_id = excluded.run_id
    returning (xmax = 0) into v_ins;
    if v_ins then v_new := v_new + 1; else v_seen := v_seen + 1; end if;
  end loop;

  -- Keywords: a number is kept only with its source; a known value is not wiped by a blank.
  for k in select * from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'keywords') = 'array' then p_payload -> 'keywords' else '[]'::jsonb end) limit 100 loop
    txt := left(btrim(coalesce(k ->> 'keyword', '')), 200);
    continue when txt = '';
    v_vol  := case when nullif(k ->> 'volume_source', '') is not null and (k ->> 'search_volume') ~ '^\d{1,9}$' then (k ->> 'search_volume')::int end;
    v_diff := case when nullif(k ->> 'difficulty_source', '') is not null and (k ->> 'difficulty') ~ '^\d{1,3}$' and (k ->> 'difficulty')::int <= 100 then (k ->> 'difficulty')::int end;
    v_pos  := case when nullif(k ->> 'position_source', '') is not null and (k ->> 'our_position') ~ '^\d{1,3}(\.\d+)?$' and (k ->> 'our_position')::numeric > 0 then (k ->> 'our_position')::numeric end;
    insert into public.seo_keywords (keyword, country, language, intent, page_url, search_volume, volume_source, difficulty, difficulty_source, our_position, position_source, competitor_pages, content_type, relevance, effort, next_action)
    values (
      txt,
      left(coalesce(nullif(k ->> 'country', ''), 'Singapore'), 60),
      left(coalesce(nullif(k ->> 'language', ''), 'English'), 40),
      case when k ->> 'intent' in ('informational', 'commercial', 'transactional', 'navigational') then k ->> 'intent' else 'unknown' end,
      nullif(left(coalesce(k ->> 'page_url', ''), 500), ''),
      v_vol, case when v_vol is not null then left(k ->> 'volume_source', 200) end,
      v_diff, case when v_diff is not null then left(k ->> 'difficulty_source', 200) end,
      v_pos, case when v_pos is not null then left(k ->> 'position_source', 200) end,
      coalesce((select array_agg(left(x, 500)) from (select jsonb_array_elements_text(case when jsonb_typeof(k -> 'competitor_pages') = 'array' then k -> 'competitor_pages' else '[]'::jsonb end) x limit 5) s), '{}'),
      nullif(left(coalesce(k ->> 'content_type', ''), 80), ''),
      case when (k ->> 'relevance') ~ '^[1-5]$' then (k ->> 'relevance')::smallint else 3 end,
      case when k ->> 'effort' in ('small', 'medium', 'large') then k ->> 'effort' else 'medium' end,
      nullif(left(coalesce(k ->> 'next_action', ''), 500), '')
    )
    on conflict (lower(keyword), country, language) do update set
      intent            = case when excluded.intent <> 'unknown' then excluded.intent else public.seo_keywords.intent end,
      page_url          = coalesce(excluded.page_url, public.seo_keywords.page_url),
      search_volume     = coalesce(excluded.search_volume, public.seo_keywords.search_volume),
      volume_source     = case when excluded.search_volume is not null then excluded.volume_source else public.seo_keywords.volume_source end,
      difficulty        = coalesce(excluded.difficulty, public.seo_keywords.difficulty),
      difficulty_source = case when excluded.difficulty is not null then excluded.difficulty_source else public.seo_keywords.difficulty_source end,
      our_position      = coalesce(excluded.our_position, public.seo_keywords.our_position),
      position_source   = case when excluded.our_position is not null then excluded.position_source else public.seo_keywords.position_source end,
      competitor_pages  = case when cardinality(excluded.competitor_pages) > 0 then excluded.competitor_pages else public.seo_keywords.competitor_pages end,
      content_type      = coalesce(excluded.content_type, public.seo_keywords.content_type),
      next_action       = coalesce(excluded.next_action, public.seo_keywords.next_action),
      updated_at        = now();
    v_kw := v_kw + 1;
  end loop;

  -- Recommendations: new ones only; an existing one keeps its status.
  for r in select * from jsonb_array_elements(case when jsonb_typeof(p_payload -> 'recommendations') = 'array' then p_payload -> 'recommendations' else '[]'::jsonb end) limit 20 loop
    txt := left(btrim(coalesce(r ->> 'title', '')), 300);
    continue when txt = '';
    v_fp := md5(lower(txt) || '|' || lower(coalesce(r ->> 'page_url', '')) || '|' || lower(coalesce(r ->> 'keyword', '')));
    insert into public.seo_recommendations (title, description, page_url, new_page, keyword, intent, why, impact, effort, cost_note, priority, steps, validation, evidence, fingerprint)
    values (
      txt,
      nullif(left(coalesce(r ->> 'description', ''), 3000), ''),
      nullif(left(coalesce(r ->> 'page_url', ''), 500), ''),
      coalesce((r ->> 'new_page')::boolean, false),
      nullif(left(coalesce(r ->> 'keyword', ''), 200), ''),
      nullif(left(coalesce(r ->> 'intent', ''), 40), ''),
      nullif(left(coalesce(r ->> 'why', ''), 2000), ''),
      case when r ->> 'impact' in ('high', 'medium', 'low') then r ->> 'impact' else 'medium' end,
      case when r ->> 'effort' in ('small', 'medium', 'large') then r ->> 'effort' else 'medium' end,
      nullif(left(coalesce(r ->> 'cost_note', ''), 300), ''),
      case when (r ->> 'priority') ~ '^[1-3]$' then (r ->> 'priority')::smallint else 2 end,
      coalesce((select array_agg(left(x, 500)) from (select jsonb_array_elements_text(case when jsonb_typeof(r -> 'steps') = 'array' then r -> 'steps' else '[]'::jsonb end) x limit 10) s), '{}'),
      nullif(left(coalesce(r ->> 'validation', ''), 500), ''),
      case when jsonb_typeof(r -> 'evidence') = 'array' and length((r -> 'evidence')::text) < 6000 then r -> 'evidence' else '[]'::jsonb end,
      v_fp
    )
    on conflict (fingerprint) do nothing;
    if found then v_recs := v_recs + 1; end if;
  end loop;

  update public.seo_runs
     set stats = stats || jsonb_build_object('findings_new', v_new, 'findings_repeated', v_seen, 'keywords', v_kw, 'recommendations_new', v_recs)
   where id = v_run;
  return jsonb_build_object('run_id', v_run, 'findings_new', v_new, 'findings_repeated', v_seen, 'keywords', v_kw, 'recommendations_new', v_recs);
end;
$$;
revoke all on function public.seo_ingest(text, jsonb) from public;
grant execute on function public.seo_ingest(text, jsonb) to anon, authenticated;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    SEO agent tables ready (% findings, % keywords, % recommendations).',
    (select count(*) from public.seo_findings), (select count(*) from public.seo_keywords), (select count(*) from public.seo_recommendations);
  if (select ingest_key_hash from public.seo_settings where id = 1) is null then
    raise notice 'NEXT  select public.set_seo_ingest_key(''<a long random key>''); — then put the same key in Vercel as SEO_INGEST_KEY.';
  end if;
end $$;
