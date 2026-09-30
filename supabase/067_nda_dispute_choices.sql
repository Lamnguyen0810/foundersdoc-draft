-- ============================================================================
-- 067 — NDA: the dispute question's choices
--
-- "How should a dispute be resolved?" now offers:
--   Courts · Arbitration · Help me choose
-- (were: In the courts of that jurisdiction · By arbitration · Not sure).
-- "Help me choose" asks one question on screen (same country → Courts,
-- different countries → Arbitration); left as it is, the drafter chooses
-- and says why in the notes. Drafts saved with the old wording still read
-- the same way (lib/prompt.ts).
--
-- The governing-law list is unchanged: the screen now shows Singapore, the
-- United Kingdom and the United States first under "Popular", and the rest
-- A–Z, whatever order the options are stored in.
--
-- Applied to the live form and to any saved, unpublished draft of it in the
-- admin Questions editor. The code already shows the new choices, so this
-- only makes the database agree. Safe to run twice.
-- ============================================================================

create or replace function pg_temp.nda_fields_067(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    else (
      select jsonb_agg(
               case when e->>'key' = 'dispute_resolution'
                    then e || '{"options": ["Courts", "Arbitration", "Help me choose"],
                                "help": "Courts suit most NDAs. Arbitration is private and its awards are easier to enforce abroad, which suits parties in different countries. Not sure? Choose Help me choose."}'::jsonb
                    else e end
               order by n)
        from jsonb_array_elements(f) with ordinality as x(e, n)
    )
  end
$$;

update public.doc_types set fields = pg_temp.nda_fields_067(fields)
 where slug = 'nda' and fields is distinct from pg_temp.nda_fields_067(fields);

update public.doc_types set draft = jsonb_set(draft, '{fields}', pg_temp.nda_fields_067(draft->'fields'))
 where slug = 'nda' and draft is not null and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields') is distinct from pg_temp.nda_fields_067(draft->'fields');

-- Check:
-- select f->'options' from public.doc_types, jsonb_array_elements(fields) f where slug = 'nda' and f->>'key' = 'dispute_resolution';
