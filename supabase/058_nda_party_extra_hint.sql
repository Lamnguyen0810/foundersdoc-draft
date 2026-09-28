-- ============================================================================
-- 058 — NDA: a short hint in "Any other details about the parties"
--
-- The box shows "Provide more information about the parties for the draft
-- (optional)" in grey — a hint, not an example. Replaces the example text
-- (or no text, if 057 was run) on the live form and on any saved,
-- unpublished draft of it in the admin Questions editor. Running 057 first
-- is not needed.
--
-- Safe to run twice.
-- ============================================================================

update public.doc_types
   set fields = (
         select jsonb_agg(case when f->>'key' = 'party_extra'
                               then f || '{"placeholder": "Provide more information about the parties for the draft (optional)"}'::jsonb
                               else f end order by n)
           from jsonb_array_elements(fields) with ordinality as x(f, n))
 where slug = 'nda'
   and exists (select 1 from jsonb_array_elements(fields) f
                where f->>'key' = 'party_extra'
                  and coalesce(f->>'placeholder', '') <> 'Provide more information about the parties for the draft (optional)');

update public.doc_types
   set draft = jsonb_set(draft, '{fields}', (
         select jsonb_agg(case when f->>'key' = 'party_extra'
                               then f || '{"placeholder": "Provide more information about the parties for the draft (optional)"}'::jsonb
                               else f end order by n)
           from jsonb_array_elements(draft->'fields') with ordinality as x(f, n)))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and exists (select 1 from jsonb_array_elements(draft->'fields') f
                where f->>'key' = 'party_extra'
                  and coalesce(f->>'placeholder', '') <> 'Provide more information about the parties for the draft (optional)');
