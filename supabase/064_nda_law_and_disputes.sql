-- ============================================================================
-- 064 — NDA: governing law and disputes are asked again
--
-- A step of its own, "Law and disputes", before "Anything else":
--   "Which country’s law should govern the NDA?"  — a list of countries, or
--      "Other (type it)" for any other country or a state such as New York.
--   "How should a dispute be resolved?"            — In the courts of that
--      country / By arbitration / Not sure.
-- For arbitration the draft names the usual centre and seat for that law
-- (the same table the term sheet uses: SIAC for Singapore, and so on).
-- Skipped: the country is left as a gap for the user to fill in.
--
-- The length question's hint now says years AND months can both be given.
--
-- (The old "Which country's law?" question, key "jurisdiction", stays
-- retired; these are new questions with new keys.)
--
-- Applied to the live form and to any saved, unpublished draft of it in the
-- admin Questions editor. The code already shows the step, so this only makes
-- the database agree. Safe to run twice.
-- ============================================================================

create or replace function pg_temp.nda_fields_064(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    when exists (select 1 from jsonb_array_elements(f) e where e->>'key' = 'governing_law') then f
    else (
      select jsonb_agg(x.e order by x.n, x.sub)
        from (
          select case when e->>'key' = 'confidentiality_period'
                      then e || '{"help": "Years, months or both, or Perpetual for no time limit."}'::jsonb
                      else e end,
                 n, 0 as sub
            from jsonb_array_elements(f) with ordinality as a(e, n)
          union all
          select q.e,
                 coalesce((select n from jsonb_array_elements(f) with ordinality as b(e, n) where e->>'key' = 'special_terms'),
                          (select count(*) + 1 from jsonb_array_elements(f))) - 1,
                 q.sub
            from (values
              ('{"key": "governing_law",
                 "label": "Which country’s law should govern the NDA?",
                 "type": "select",
                 "options": ["Singapore", "Malaysia", "Indonesia", "Vietnam", "Thailand", "Philippines", "Hong Kong", "China",
                             "India", "Japan", "South Korea", "Australia", "New Zealand", "England and Wales", "Ireland",
                             "United States", "Canada", "Germany", "France", "Netherlands", "Switzerland", "United Arab Emirates"],
                 "required": true,
                 "help": "Usually the country where you are based. Choose Other to type another country, or a state such as New York.",
                 "group": "Law and disputes"}'::jsonb, 1),
              ('{"key": "dispute_resolution",
                 "label": "How should a dispute be resolved?",
                 "type": "select",
                 "options": ["In the courts of that country", "By arbitration", "Not sure"],
                 "required": true,
                 "help": "Courts are the default. Arbitration is private and its awards are easier to enforce abroad, which suits parties in different countries.",
                 "group": "Law and disputes"}'::jsonb, 2)
            ) as q(e, sub)
        ) x
    )
  end
$$;

create or replace function pg_temp.nda_groups_064(g jsonb) returns jsonb
language sql immutable as $$
  select case
    when g is null or jsonb_typeof(g) <> 'array' then g
    when exists (select 1 from jsonb_array_elements(g) e where e->>'name' = 'Law and disputes') then g
    else (
      select jsonb_agg(x.e order by x.n, x.sub)
        from (
          select e, n, 0 as sub from jsonb_array_elements(g) with ordinality as a(e, n)
          union all
          select '{"name": "Law and disputes", "title": "Law and disputes",
                   "question": "Which country’s law should govern the NDA, and how should a dispute be resolved?"}'::jsonb,
                 coalesce((select n from jsonb_array_elements(g) with ordinality as b(e, n) where e->>'name' = 'Anything else'),
                          (select count(*) + 1 from jsonb_array_elements(g))) - 1,
                 1
        ) x
    )
  end
$$;

update public.doc_types set fields = pg_temp.nda_fields_064(fields)
 where slug = 'nda' and fields is distinct from pg_temp.nda_fields_064(fields);

update public.doc_types set groups = pg_temp.nda_groups_064(groups)
 where slug = 'nda' and groups is distinct from pg_temp.nda_groups_064(groups);

update public.doc_types set draft = jsonb_set(draft, '{fields}', pg_temp.nda_fields_064(draft->'fields'))
 where slug = 'nda' and draft is not null and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields') is distinct from pg_temp.nda_fields_064(draft->'fields');

update public.doc_types set draft = jsonb_set(draft, '{groups}', pg_temp.nda_groups_064(draft->'groups'))
 where slug = 'nda' and draft is not null and jsonb_typeof(draft->'groups') = 'array'
   and (draft->'groups') is distinct from pg_temp.nda_groups_064(draft->'groups');

-- Check:
-- select jsonb_path_query_array(fields, '$[*].key') from public.doc_types where slug = 'nda';
-- select jsonb_path_query_array(groups, '$[*].name') from public.doc_types where slug = 'nda';
