-- ===========================================================================
-- FDAI — Slack hears when a VISITOR starts answering
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- ── WHAT CHANGED IN THE APP ─────────────────────────────────────────────────
-- /draft is open to everybody. A person with no account can pick a document
-- and answer every question; the account is asked for when they press
-- Generate. So "started answering" now happens, most of the time, BEFORE
-- there is a user to name.
--
-- ── WHAT THIS FILE DOES ─────────────────────────────────────────────────────
-- 041's announcer ignored every event without a user, because at the time
-- nobody without one could draft. This lets the "started answering" message
-- through for a visitor, naming them as what they are:
--
--     A visitor (no account yet) started answering
--     Non-Disclosure Agreement · 24 Sep 2026, 4:12pm
--
-- Then, if they sign up, 037/040 announce the new account as before, and
-- "finished and downloaded" arrives under their name. The download message
-- still needs a signed-in person — a visitor cannot generate, so cannot
-- download.
--
-- The visitor is not identified beyond that. The events table has an
-- anonymous browser id, and it stays there; Slack gets none of it.
-- ===========================================================================

create or replace function public.announce_draft_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url     text;
  v_who     text;
  v_slug    text := new.props ->> 'doc_type';
  v_doc     text;
  v_draft   uuid;
  v_words   integer := 0;
  v_skipped text := '';
  v_message text;
begin
  if new.name not in ('draft_started', 'draft_exported') then
    return new;
  end if;
  -- A download always has a person behind it; a start need not.
  if new.name = 'draft_exported' and new.user_id is null then
    return new;
  end if;

  select url into v_url
  from public.webhooks
  where name = 'draft_activity' and enabled;

  if v_url is null or v_url = '' then
    return new;
  end if;

  if new.user_id is null then
    v_who := 'A visitor (no account yet)';
  else
    v_who := public.person_label(new.user_id);
    if v_who is null then
      return new;
    end if;
  end if;

  select label into v_doc from public.doc_types where slug = v_slug;
  v_doc := coalesce(v_doc, initcap(replace(coalesce(v_slug, 'document'), '_', ' ')));

  if new.name = 'draft_exported' then
    select d.id,
           array_length(regexp_split_to_array(btrim(coalesce(d.output, '')), '\s+'), 1)
      into v_draft, v_words
    from public.drafts d
    left join public.doc_types t on t.id = d.doc_type_id
    where d.user_id = new.user_id
      and d.deleted_at is null
      and (v_slug is null or t.slug = v_slug or t.slug is null)
    order by d.updated_at desc nulls last, d.created_at desc
    limit 1;

    if v_draft is null then
      return new;
    end if;

    insert into public.draft_announcements (draft_id, event)
    values (v_draft, 'draft_exported')
    on conflict do nothing;
    if not found then
      return new;
    end if;

    v_skipped := public.skipped_steps(v_draft);
  end if;

  v_message := public.draft_message(new.name, v_who, v_doc, new.created_at, v_words, v_skipped);

  perform net.http_post(
    url := v_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'event',        new.name,
      'who',          v_who,
      'doc_type',     v_doc,
      'words',        coalesce(v_words, 0),
      'skipped',      v_skipped,
      'at',           to_char(new.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'at_text',      public.in_singapore(new.created_at),
      'message',      v_message
    ),
    timeout_milliseconds := 5000
  );

  return new;

exception when others then
  raise warning 'announce_draft_activity: %', sqlerrm;
  return new;
end;
$$;

revoke all on function public.announce_draft_activity() from public, anon, authenticated;

-- The trigger from 041 is unchanged and still points at this function.

do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'on_event_draft_activity') then
    raise notice 'OK    visitors who start answering are announced; downloads still need an account';
  else
    raise notice 'WARN  run 041 first — the trigger on public.events is missing';
  end if;
end $$;
