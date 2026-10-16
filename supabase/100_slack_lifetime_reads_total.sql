-- ============================================================================
-- 100 — Slack says "Total", not "Lifetime"
--
-- Rachel: "lifetime should just be total". The second line of each
-- document's Slack message (added by 098) changes from
--
--     All documents · Lifetime: 340 · Daily: 9
--     All documents · Lifetime downloads: 210 · Daily: 4
-- to
--     All documents · Total: 340 · Daily: 9
--     All documents · Total downloads: 210 · Daily: 4
--
-- Same numbers, only the word. The live announcers are read from the
-- database and only that word replaced, so the channel routing added by 099
-- stays as it is. Safe to run twice. Run after 099.
-- ============================================================================

do $$
declare
  fn   text;
  def  text;
  done text[] := '{}';
begin
  foreach fn in array array['announce_draft_activity', 'announce_draft_download_all'] loop
    select pg_get_functiondef(p.oid) into def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = fn
    limit 1;

    if def is null then
      raise notice 'CHECK % not found', fn;
      continue;
    end if;
    if position('Lifetime' in def) = 0 then
      done := done || (fn || ' (already)');
      continue;
    end if;

    def := replace(def, 'All documents · Lifetime downloads: ', 'All documents · Total downloads: ');
    def := replace(def, 'All documents · Lifetime: ', 'All documents · Total: ');
    execute def;
    done := done || fn;
  end loop;
  raise notice 'OK    Slack now says Total: %', array_to_string(done, ', ');
end $$;
