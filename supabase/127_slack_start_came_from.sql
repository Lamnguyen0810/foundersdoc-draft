-- ============================================================================
-- 127 — "Came from" on every "started answering" message
--
-- Rachel (10 Nov): "It doesnt say source though". A sign-up already says
-- where the person came from (091). Now the first message of a draft does
-- too, for visitors without an account as well:
--
--     A visitor (no account yet) started answering
--     Non-Disclosure Agreement · 10 Nov 2026, 5:49pm
--     Came from: NDA Template India — Draft an Indian-Law NDA Free | FD AI (via Google search)
--     NDA #132 · Cumulative: 132 · Daily: 1
--     All documents · Total: 157 · Daily: 1
--
-- The website (0211) adds the first page of the visit to the draft_started
-- event: its path and title, the referring SITE (host only, never the full
-- address) and any utm_ tags, the same things kept for a sign-up. The words
-- come from 091's signup_source_label(). Starts recorded before 0211 have no
-- source, so their messages stay as they were (no line).
--
-- The live announcer is read from the database and only the message line is
-- changed, so the channel routing (099) and "Total" (100) stay as they are.
-- Safe to run twice. Run after 100 (and 091).
-- ============================================================================

-- The event's first page as the jsonb 091's helpers read.
create or replace function public.event_landing(p jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when p is null or nullif(p ->> 'land_path', '') is null then null
    else jsonb_strip_nulls(jsonb_build_object(
      'path',         p ->> 'land_path',
      'title',        p ->> 'land_title',
      'kind',         p ->> 'land_kind',
      'ref',          coalesce(nullif(p ->> 'land_ref', ''), 'direct'),
      'utm_source',   p ->> 'utm_source',
      'utm_medium',   p ->> 'utm_medium',
      'utm_campaign', p ->> 'utm_campaign'
    ))
  end;
$$;

-- "Came from: …" as a line, or nothing when the start has no source.
create or replace function public.came_from_line(p jsonb)
returns text
language sql
immutable
as $$
  select case
    when public.event_landing(p) is null then ''
    else E'\n' || 'Came from: ' || public.signup_source_label(public.event_landing(p))
  end;
$$;

do $$
declare
  def  text;
  old  text := 'v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, 0, '''') || E''\n'' || v_count;';
  new_ text := 'v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, 0, '''') || public.came_from_line(new.props) || E''\n'' || v_count;';
begin
  select pg_get_functiondef(p.oid) into def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'announce_draft_activity'
  limit 1;

  if def is null then
    raise notice 'CHECK announce_draft_activity not found (run 098–100 first)';
  elsif position('came_from_line' in def) > 0 then
    raise notice 'OK    already says Came from';
  elsif position(old in def) = 0 then
    raise notice 'CHECK announce_draft_activity: message line not recognised, nothing changed';
  else
    execute replace(def, old, new_);
    raise notice 'OK    "started answering" now says Came from';
  end if;
end $$;

revoke all on function public.came_from_line(jsonb) from public, anon, authenticated;
revoke all on function public.event_landing(jsonb) from public, anon, authenticated;

-- Check (read-only): the last starts and what their line says
--   select created_at, props ->> 'doc_type' as doc, public.came_from_line(props) as line
--   from public.events where name = 'draft_started' order by created_at desc limit 10;
