-- ============================================================================
-- 092 · A visit that STARTS on the NDA draft screen came from the email campaign
-- ============================================================================
--
-- The campaign emails link straight to /draft?type=nda. Email apps (Outlook,
-- Apple Mail, the Gmail app) send no referrer, so 091 called those visits
-- "direct". Nothing else sends people to that screen as their FIRST page —
-- the blog and the homepage link to it too, but then the first page of the
-- visit is the article or the homepage, not the NDA screen. So:
--
--     first page = /draft?type=nda   ->   Came from: NDA draft screen (via email campaign)
--
-- A link with its own utm_source tag still says what the tag says.
-- Run after 091. Safe to run again.
-- ============================================================================

create or replace function public.signup_source_via(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null then null
    -- 092: the campaign's deep link, untagged.
    when p ->> 'path' = '/draft' and p ->> 'doc' = 'nda' and nullif(p ->> 'utm_source', '') is null
      then 'email campaign'
    when lower(coalesce(p ->> 'utm_medium', '')) in ('email', 'newsletter', 'e-mail')
      or lower(coalesce(p ->> 'utm_source', '')) in ('email', 'newsletter', 'mailing-list', 'emailoctopus', 'brevo')
      or coalesce(p ->> 'ref', '') ~* '(^|\.)(mail\.google\.com|outlook\.(live|office|office365)\.com|mail\.yahoo\.com|mail\.zoho\.com)$'
      then 'email'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(chatgpt\.com|chat\.openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com)$' then 'AI assistant'
    when coalesce(p ->> 'ref', '') ~* '^google\.[a-z.]+$' then 'Google search'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(bing\.com|duckduckgo\.com|search\.yahoo\.com|ecosia\.org|baidu\.com|yandex\.[a-z]+)$' then 'search engine'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(linkedin\.com|lnkd\.in)$' then 'LinkedIn'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(facebook\.com|fb\.me)$' then 'social media: Facebook'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)instagram\.com$' then 'social media: Instagram'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(t\.co|x\.com|twitter\.com)$' then 'social media: X'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(youtube\.com|youtu\.be)$' then 'social media: YouTube'
    when coalesce(p ->> 'ref', '') ~* '(^|\.)(reddit\.com|threads\.net|tiktok\.com)$' then 'social media: ' || (p ->> 'ref')
    when nullif(p ->> 'utm_source', '') is not null then p ->> 'utm_source'
    when coalesce(p ->> 'ref', '') in ('', 'direct', 'internal') then 'direct'
    else 'a link on ' || (p ->> 'ref')
  end;
$$;

create or replace function public.signup_source_channel(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '{}'::jsonb then 'Not recorded'
    else case
      when public.signup_source_via(p) in ('email', 'email campaign') then 'Email'
      when public.signup_source_via(p) in ('Google search', 'search engine') then 'Search'
      when public.signup_source_via(p) = 'AI assistant' then 'AI assistant'
      when public.signup_source_via(p) = 'LinkedIn' then 'LinkedIn'
      when public.signup_source_via(p) like 'social media%' then 'Other social'
      when public.signup_source_via(p) = 'direct' then 'Direct'
      else 'Other website'
    end
  end;
$$;

create or replace function public.signup_source_page(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or nullif(p ->> 'path', '') is null then null
    when p ->> 'path' = '/' then 'Homepage'
    -- 092: the screen for one document, e.g. /draft?type=nda
    when p ->> 'path' = '/draft' and p ->> 'doc' = 'nda' then 'NDA draft screen'
    when p ->> 'path' = '/draft' and nullif(p ->> 'doc', '') is not null then 'FD AI – ' || (p ->> 'doc') || ' screen'
    when p ->> 'kind' = 'article' or p ->> 'path' like '/resources/%'
      then 'Blog – ' || coalesce(nullif(p ->> 'title', ''), p ->> 'path')
    when p ->> 'path' = '/resources' then 'Blog'
    when p ->> 'path' = '/podcast' then 'Podcast'
    when p ->> 'path' = '/about' then 'About us'
    when p ->> 'path' = '/contact' then 'Contact page'
    when p ->> 'path' = '/fd-consult' then 'FD Consult page'
    when p ->> 'path' ~ '^/(signup|login|draft|auth)' then 'FD AI sign-up page'
    else coalesce(nullif(p ->> 'title', ''), p ->> 'path')
  end;
$$;

-- Check:
--   select public.signup_source_label('{"path":"/draft","doc":"nda","ref":"direct"}');
--   -> NDA draft screen (via email campaign)
