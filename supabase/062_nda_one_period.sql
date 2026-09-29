-- ============================================================================
-- 062 — NDA: clearer direction choices, one confidentiality period
--
--   * The first question's choices say who discloses:
--       Mutual                → Mutual: both sides disclose information
--       One-way: we disclose  → One-way: we disclose information
--       One-way: we receive   → One-way: we receive information
--     (shown one-way first, as the firm asked).
--   * The Terms step: its two length questions — "How long does the
--     agreement last? (years)" and "How long must information stay
--     confidential after the agreement ends? (years)" — become ONE:
--       "How long should the confidentiality obligations last?"
--     answered as a number of years or months, or Perpetual. The step keeps
--     its two other questions, so it asks three in all.
--   * The Terms step's question reads:
--       "How long should the confidentiality obligations last, and how strict
--        should they be? I’ve set sensible defaults, so change only what you
--        need."
--
-- Applied to the live form and to any saved, unpublished draft of it in the
-- admin Questions editor. The code already shows the form this way, so this
-- only makes the database agree (and the admin editor show it).
--
-- Safe to run twice.
-- ============================================================================

create or replace function pg_temp.nda_fields_062(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    else coalesce((
      select jsonb_agg(x.e order by x.n, x.sub)
        from (
          -- every question but the two retired ones, the direction reworded
          select case
                   when e->>'key' = 'nda_direction'
                        and e->'options' = '["Mutual", "One-way: we disclose", "One-way: we receive"]'::jsonb
                   then e || '{"options": ["One-way: we disclose information", "One-way: we receive information", "Mutual: both sides disclose information"]}'::jsonb
                   else e
                 end as e,
                 n, 0 as sub
            from jsonb_array_elements(f) with ordinality as a(e, n)
           where e->>'key' not in ('term_years', 'survival_years')
          union all
          -- the one period, where the first of the old two was
          select '{"key": "confidentiality_period",
                   "label": "How long should the confidentiality obligations last?",
                   "type": "text",
                   "required": true,
                   "defaultValue": "2 years",
                   "help": "A number of years or months, or Perpetual for no time limit.",
                   "group": "Terms"}'::jsonb,
                 min(n), 0
            from jsonb_array_elements(f) with ordinality as b(e, n)
           where e->>'key' in ('term_years', 'survival_years')
             and not exists (select 1 from jsonb_array_elements(f) c where c->>'key' = 'confidentiality_period')
          having count(*) > 0
        ) x
    ), '[]'::jsonb)
  end
$$;

create or replace function pg_temp.nda_groups_062(g jsonb) returns jsonb
language sql immutable as $$
  select case
    when g is null or jsonb_typeof(g) <> 'array' then g
    else (
      select jsonb_agg(
               case when e->>'name' = 'Terms' and coalesce(e->>'question', '') like 'How long should confidentiality last%'
                    then e || '{"question": "How long should the confidentiality obligations last, and how strict should they be? I’ve set sensible defaults, so change only what you need."}'::jsonb
                    else e
               end
               order by n)
        from jsonb_array_elements(g) with ordinality as x(e, n)
    )
  end
$$;

update public.doc_types
   set fields = pg_temp.nda_fields_062(fields)
 where slug = 'nda'
   and fields is distinct from pg_temp.nda_fields_062(fields);

update public.doc_types
   set groups = pg_temp.nda_groups_062(groups)
 where slug = 'nda'
   and groups is distinct from pg_temp.nda_groups_062(groups);

update public.doc_types
   set draft = jsonb_set(draft, '{fields}', pg_temp.nda_fields_062(draft->'fields'))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields') is distinct from pg_temp.nda_fields_062(draft->'fields');

update public.doc_types
   set draft = jsonb_set(draft, '{groups}', pg_temp.nda_groups_062(draft->'groups'))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'groups') = 'array'
   and (draft->'groups') is distinct from pg_temp.nda_groups_062(draft->'groups');

-- Check:
-- select jsonb_path_query_array(fields, '$[*].key'), fields->0->'options' from public.doc_types where slug = 'nda';
-- select g->>'question' from public.doc_types, jsonb_array_elements(groups) g where slug = 'nda' and g->>'name' = 'Terms';
