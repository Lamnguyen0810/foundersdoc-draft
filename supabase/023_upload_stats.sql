-- ===========================================================================
-- FDAI — how many documents people upload while drafting
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- FD AI lets someone attach an existing agreement as a starting point rather
-- than answering every question from scratch. The app has recorded that all
-- along as a `source_uploaded` event; nothing on the dashboard showed it.
--
-- WHAT IS COUNTED, AND WHAT IS NOT
--   The count is of upload EVENTS: one per file attached. The file itself is
--   not stored by this, its name is never recorded, and its text never
--   reaches this table — the event carries the document type being drafted,
--   the rough length in words, and (from today) the file's format. A client's
--   agreement stays between the person and the draft they are writing.
--
--   Uploads by your own team are included, exactly as drafts are, because at
--   this stage the firm is most of the traffic and excluding it would leave
--   the panel empty. The visitor figures are the ones that exclude admins.
-- ===========================================================================

create or replace function public.admin_document_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
  v_prev timestamptz := v_from - (now() - v_from);
  v_out  jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'total',        (select count(*) from public.drafts),
    'period',       (select count(*) from public.drafts where created_at >= v_from),
    'previous',     (select count(*) from public.drafts
                      where created_at >= v_prev and created_at < v_from),
    'finalised',    (select count(*) from public.drafts
                      where status = 'final' and created_at >= v_from),
    'revisions',    (select count(*) from public.draft_versions where created_at >= v_from),
    'drafters',     (select count(distinct user_id) from public.drafts where created_at >= v_from),
    'untouched',    (select count(*) from public.drafts d
                      where d.created_at >= v_from
                        and not exists (select 1 from public.draft_versions v where v.draft_id = d.id)),
    'exported',     (select count(*) from public.events
                      where name = 'draft_exported' and created_at >= v_from),
    'failed',       (select count(*) from public.events
                      where name = 'draft_failed' and created_at >= v_from),
    -- ── uploads, new ─────────────────────────────────────────────────────
    -- One count per file attached while drafting, in the period.
    'uploaded',       (select count(*) from public.events
                        where name = 'source_uploaded' and created_at >= v_from),
    -- The same, all time, so the tile can carry a running total.
    'uploaded_total', (select count(*) from public.events where name = 'source_uploaded'),
    -- The equal period before this one, for an honest comparison.
    'uploaded_prev',  (select count(*) from public.events
                        where name = 'source_uploaded'
                          and created_at >= v_prev and created_at < v_from),
    -- How many different people did it. A signed-in person counts by account;
    -- anyone not signed in counts by their browser session.
    'uploaders',      (select count(distinct coalesce(user_id::text, anon_id))
                        from public.events
                        where name = 'source_uploaded' and created_at >= v_from)
  ) into v_out;

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Which file formats people attach
--
-- Reads props->>'format', which the drafting screen started sending with this
-- change. Events recorded before it have no format and are left out of this
-- list entirely rather than lumped under a made-up "unknown" — the tile above
-- still counts them, and the panel says how many are missing a format.
-- ---------------------------------------------------------------------------
create or replace function public.admin_upload_formats(p_days integer default 30)
returns table (label text, uploads bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_from timestamptz := public.admin_window(p_days);
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select lower(e.props->>'format'), count(*)
    from public.events e
    where e.name = 'source_uploaded'
      and e.created_at >= v_from
      and coalesce(e.props->>'format', '') <> ''
    group by 1
    order by 2 desc, 1
    limit 12;
end;
$$;

revoke all on function public.admin_upload_formats(integer) from public;
grant execute on function public.admin_upload_formats(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare ok boolean;
begin
  select pg_get_functiondef(oid) like '%uploaded_total%' into ok
    from pg_proc where proname = 'admin_document_stats' limit 1;
  raise notice '% admin_document_stats() now reports uploads', case when ok then 'OK   ' else 'FAIL ' end;

  select count(*) = 1 into ok from pg_proc where proname = 'admin_upload_formats';
  raise notice '% admin_upload_formats() — which file formats people attach', case when ok then 'OK   ' else 'FAIL ' end;
end $$;
