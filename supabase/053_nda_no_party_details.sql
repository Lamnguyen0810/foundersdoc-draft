-- ============================================================================
-- 053 — NDA: remove "Party details required in your jurisdiction"
--
-- The question was unclear, and the form is not tied to a set of
-- jurisdictions: the parties' names are the party details it needs. This
-- takes the question out of the live NDA form and out of any saved,
-- unpublished draft of it in the admin Questions editor. The code already
-- ignores it (RETIRED_FIELD_KEYS), so the form is right before and after.
--
-- Safe to run twice.
-- ============================================================================

update public.doc_types
   set fields = coalesce(
         (select jsonb_agg(f order by n)
            from jsonb_array_elements(fields) with ordinality as x(f, n)
           where f->>'key' <> 'party_details'),
         '[]'::jsonb)
 where slug = 'nda'
   and fields @> '[{"key": "party_details"}]';

update public.doc_types
   set draft = jsonb_set(
         draft, '{fields}',
         coalesce(
           (select jsonb_agg(f order by n)
              from jsonb_array_elements(draft->'fields') with ordinality as x(f, n)
             where f->>'key' <> 'party_details'),
           '[]'::jsonb))
 where slug = 'nda'
   and draft is not null
   and draft->'fields' @> '[{"key": "party_details"}]';

-- Check (should list no party_details):
-- select jsonb_path_query_array(fields, '$[*].key') from public.doc_types where slug = 'nda';
