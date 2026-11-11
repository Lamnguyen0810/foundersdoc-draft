-- ============================================================================
-- 128 — "Country" on the sign-up and "started answering" messages
--
-- Rachel (11 Nov), on a new sign-up: "Which country". The "Came from:" line
-- now ends with the visitor's country:
--
--     ELENA … just signed up!
--     …
--     Came from: Homepage (via direct) · Country: Singapore
--
--     A visitor (no account yet) started answering
--     Non-Disclosure Agreement · 11 Nov 2026, 9:12am
--     Came from: NDA Template India — … (via Google search) · Country: India
--
-- Where the country comes from: Vercel's view of the request's IP address,
-- as 2 letters. A draft start already stores it on the event (events.country,
-- 003). A sign-up gets it from the website (0215) inside signup_source. Only
-- the country is kept: no city, no IP address. A visit with no country simply
-- has no "Country" part.
--
-- Run after 127 (and 091). Safe to run twice.
-- ============================================================================

-- 1. "SG" → "Singapore" (the countries we see most; any other shows its 2 letters)
create or replace function public.country_name(p_code text)
returns text
language sql
immutable
as $$
  select case upper(coalesce(p_code, ''))
    when '' then null
    when 'SG' then 'Singapore'     when 'MY' then 'Malaysia'       when 'ID' then 'Indonesia'
    when 'VN' then 'Vietnam'       when 'PH' then 'Philippines'    when 'TH' then 'Thailand'
    when 'MM' then 'Myanmar'       when 'KH' then 'Cambodia'       when 'BN' then 'Brunei'
    when 'IN' then 'India'         when 'PK' then 'Pakistan'       when 'BD' then 'Bangladesh'
    when 'LK' then 'Sri Lanka'     when 'NP' then 'Nepal'          when 'CN' then 'China'
    when 'HK' then 'Hong Kong'     when 'TW' then 'Taiwan'         when 'JP' then 'Japan'
    when 'KR' then 'South Korea'   when 'AU' then 'Australia'      when 'NZ' then 'New Zealand'
    when 'US' then 'United States' when 'CA' then 'Canada'         when 'MX' then 'Mexico'
    when 'BR' then 'Brazil'        when 'GB' then 'United Kingdom' when 'IE' then 'Ireland'
    when 'DE' then 'Germany'       when 'FR' then 'France'         when 'NL' then 'Netherlands'
    when 'BE' then 'Belgium'       when 'CH' then 'Switzerland'    when 'ES' then 'Spain'
    when 'IT' then 'Italy'         when 'PT' then 'Portugal'       when 'SE' then 'Sweden'
    when 'NO' then 'Norway'        when 'DK' then 'Denmark'        when 'FI' then 'Finland'
    when 'PL' then 'Poland'        when 'UA' then 'Ukraine'        when 'RU' then 'Russia'
    when 'TR' then 'Türkiye'       when 'AE' then 'United Arab Emirates'
    when 'SA' then 'Saudi Arabia'  when 'QA' then 'Qatar'          when 'IL' then 'Israel'
    when 'EG' then 'Egypt'         when 'NG' then 'Nigeria'        when 'KE' then 'Kenya'
    when 'ZA' then 'South Africa'
    else upper(p_code)
  end;
$$;

-- 2. The sign-up line: 091's label, plus the country when there is one
create or replace function public.signup_source_label(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '{}'::jsonb then 'not recorded'
    when (p - 'country') = '{}'::jsonb then 'not recorded · Country: ' || public.country_name(p ->> 'country')
    else coalesce(public.signup_source_page(p), 'unknown page')
      || ' (via ' || public.signup_source_via(p) || ')'
      || coalesce(' · campaign: ' || nullif(p ->> 'utm_campaign', ''), '')
      || coalesce(' · Country: ' || public.country_name(nullif(p ->> 'country', '')), '')
  end;
$$;

-- 3. The "started answering" line (127's), with the event's own country
create or replace function public.came_from_line(p jsonb, p_country text)
returns text
language sql
immutable
as $$
  select case
    when public.event_landing(p) is not null then
      E'\n' || 'Came from: '
        || public.signup_source_label(public.event_landing(p) || jsonb_strip_nulls(jsonb_build_object('country', nullif(upper(p_country), ''))))
    when nullif(p_country, '') is not null then E'\n' || 'Country: ' || public.country_name(p_country)
    else ''
  end;
$$;
revoke all on function public.came_from_line(jsonb, text) from public, anon, authenticated;
revoke all on function public.country_name(text) from public, anon, authenticated;

-- 4. The live announcer passes the event's country (only that call changes; 099 / 100 / 127 kept)
do $$
declare
  def text;
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'announce_draft_activity'
  limit 1;

  if def is null then
    raise notice 'CHECK announce_draft_activity not found (run 098–100 and 127 first)';
  elsif position('came_from_line(new.props, new.country)' in def) > 0 then
    raise notice 'OK    already says Country';
  elsif position('came_from_line(new.props)' in def) = 0 then
    raise notice 'CHECK run 127 first (no "Came from" line yet), nothing changed';
  else
    execute replace(def, 'came_from_line(new.props)', 'came_from_line(new.props, new.country)');
    raise notice 'OK    "started answering" and sign-ups now say Country';
  end if;
end $$;

-- Check (read-only):
--   select public.signup_source_label('{"path":"/","ref":"direct","country":"SG"}'::jsonb);
--   select created_at, country, public.came_from_line(props, country) from public.events
--   where name = 'draft_started' order by created_at desc limit 5;
