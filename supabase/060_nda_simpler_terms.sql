-- ============================================================================
-- 060 — NDA: simpler Terms step
--
--   * "Let them use what they remember? (residuals)" — taken out. The NDA
--     never has a residuals clause.
--   * "Protect trade secrets for ever?" — taken out. The confidentiality
--     period can now be a number of years OR "Perpetual" (no time limit).
--   * Clearer wording:
--       "How long after it ends must secrets be kept? (years)"
--         → "How long must information stay confidential after the agreement ends? (years)"
--       "You own anything they create from your info?"
--         → "Do you own the rights to anything created using the information you provide?"
--
-- Applied to the live form and to any saved, unpublished draft of it in the
-- admin Questions editor. The code already shows the form this way.
--
-- Safe to run twice.
-- ============================================================================

create or replace function pg_temp.nda_terms_060(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    else coalesce((
      select jsonb_agg(
               case e->>'key'
                 when 'survival_years' then e || '{"label": "How long must information stay confidential after the agreement ends? (years)"}'::jsonb
                 when 'ip_assignment'  then e || '{"label": "Do you own the rights to anything created using the information you provide?"}'::jsonb
                 else e
               end
               order by n)
        from jsonb_array_elements(f) with ordinality as x(e, n)
       where e->>'key' not in ('residuals', 'trade_secret_tail')
    ), '[]'::jsonb)
  end
$$;

update public.doc_types
   set fields = pg_temp.nda_terms_060(fields)
 where slug = 'nda'
   and fields is distinct from pg_temp.nda_terms_060(fields);

update public.doc_types
   set draft = jsonb_set(draft, '{fields}', pg_temp.nda_terms_060(draft->'fields'))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields') is distinct from pg_temp.nda_terms_060(draft->'fields');

-- Check:
-- select jsonb_path_query_array(fields, '$[*].label') from public.doc_types where slug = 'nda';
