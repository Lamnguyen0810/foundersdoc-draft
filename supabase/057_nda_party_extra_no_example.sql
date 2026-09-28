-- ============================================================================
-- 057 — NDA: no example text in "Any other details about the parties"
--
-- The grey example (e.g. Meridian Logistics Pte. Ltd., UEN …) is taken out
-- of the box on the live form and on any saved, unpublished draft of it in
-- the admin Questions editor. The code already hides it.
--
-- Safe to run twice.
-- ============================================================================

update public.doc_types
   set fields = (
         select jsonb_agg(case when f->>'key' = 'party_extra' then f - 'placeholder' else f end order by n)
           from jsonb_array_elements(fields) with ordinality as x(f, n))
 where slug = 'nda'
   and exists (select 1 from jsonb_array_elements(fields) f where f->>'key' = 'party_extra' and f ? 'placeholder');

update public.doc_types
   set draft = jsonb_set(draft, '{fields}', (
         select jsonb_agg(case when f->>'key' = 'party_extra' then f - 'placeholder' else f end order by n)
           from jsonb_array_elements(draft->'fields') with ordinality as x(f, n)))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and exists (select 1 from jsonb_array_elements(draft->'fields') f where f->>'key' = 'party_extra' and f ? 'placeholder');
