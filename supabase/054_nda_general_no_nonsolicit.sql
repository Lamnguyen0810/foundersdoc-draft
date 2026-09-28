-- ============================================================================
-- 054 — NDA: no non-solicit question, not tied to a country
--
-- The firm's decisions (R W, 28 Sep 2026):
--   * "Stop them poaching your staff?" (non_solicit) is taken out. The NDA
--     covers confidentiality only and never includes a non-solicit.
--   * "Which country's law?" (jurisdiction) is taken out. The NDA is general:
--     the governing law is left as a blank for the user to fill in.
--   * The Terms step no longer promises "Singapore defaults".
--
-- Removes both questions from the live NDA form and from any saved,
-- unpublished draft of it in the admin Questions editor. The code already
-- ignores them (RETIRED_NDA_KEYS), so the form is right before and after.
--
-- Safe to run twice.
-- ============================================================================

update public.doc_types
   set fields = coalesce(
         (select jsonb_agg(f order by n)
            from jsonb_array_elements(fields) with ordinality as x(f, n)
           where f->>'key' not in ('non_solicit', 'jurisdiction')),
         '[]'::jsonb)
 where slug = 'nda'
   and (fields @> '[{"key": "non_solicit"}]' or fields @> '[{"key": "jurisdiction"}]');

update public.doc_types
   set draft = jsonb_set(
         draft, '{fields}',
         coalesce(
           (select jsonb_agg(f order by n)
              from jsonb_array_elements(draft->'fields') with ordinality as x(f, n)
             where f->>'key' not in ('non_solicit', 'jurisdiction')),
           '[]'::jsonb))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields' @> '[{"key": "non_solicit"}]' or draft->'fields' @> '[{"key": "jurisdiction"}]');

update public.doc_types
   set groups = replace(groups::text, 'sensible Singapore defaults', 'sensible defaults')::jsonb
 where slug = 'nda'
   and groups::text like '%sensible Singapore defaults%';

update public.doc_types
   set draft = replace(draft::text, 'sensible Singapore defaults', 'sensible defaults')::jsonb
 where slug = 'nda'
   and draft::text like '%sensible Singapore defaults%';

-- Check (neither key should be listed):
-- select jsonb_path_query_array(fields, '$[*].key') from public.doc_types where slug = 'nda';
