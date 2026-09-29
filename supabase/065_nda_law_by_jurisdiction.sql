-- ============================================================================
-- 065 — NDA: governing law by JURISDICTION, not country
--
-- Following the firm's review (R W): where contract law is set state by state
-- — the United States, Australia, Canada, the United Kingdom — the choice is
-- the state or part, listed under its country, and there is an Other option
-- to type one that is not listed.
--
--   "Which country’s law should govern the NDA?"
--      → "Which jurisdiction’s law should govern the NDA?"
--      options: a country ("Singapore"), or "Country › State"
--               ("United States › California", "United Kingdom › England and Wales")
--   "In the courts of that country" → "In the courts of that jurisdiction"
--   The step's question says "jurisdiction" too.
--
-- The code already shows it this way; this makes the database (and the admin
-- Questions editor) agree. Safe to run twice.
-- ============================================================================

create or replace function pg_temp.jurisdictions_065() returns jsonb
language sql immutable as $$
  select '["Singapore", "Malaysia", "Indonesia", "Vietnam", "Thailand", "Philippines", "Hong Kong", "China", "India", "Japan", "South Korea",
           "Australia › New South Wales", "Australia › Victoria", "Australia › Queensland", "Australia › Western Australia",
           "Australia › South Australia", "Australia › Tasmania", "Australia › Australian Capital Territory", "Australia › Northern Territory",
           "New Zealand",
           "United Kingdom › England and Wales", "United Kingdom › Scotland", "United Kingdom › Northern Ireland",
           "Ireland",
           "United States › Delaware", "United States › New York", "United States › California", "United States › Texas",
           "United States › Florida", "United States › Illinois", "United States › Massachusetts", "United States › Washington",
           "United States › Nevada", "United States › Georgia",
           "Canada › Ontario", "Canada › British Columbia", "Canada › Alberta", "Canada › Quebec",
           "Germany", "France", "Netherlands", "Switzerland", "United Arab Emirates", "Cayman Islands", "British Virgin Islands"]'::jsonb
$$;

create or replace function pg_temp.nda_fields_065(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    else (
      select jsonb_agg(
               case
                 when e->>'key' = 'governing_law' and not (e->'options')::text like '%›%' then
                   e || jsonb_build_object(
                          'label', 'Which jurisdiction’s law should govern the NDA?',
                          'options', pg_temp.jurisdictions_065(),
                          'help', 'Usually where you are based. For the United States, Australia, Canada or the United Kingdom, choose the state or part. Choose Other to type one that is not listed.')
                 when e->>'key' = 'dispute_resolution' then
                   e || jsonb_build_object('options',
                          (select jsonb_agg(case when o #>> '{}' = 'In the courts of that country'
                                                 then to_jsonb('In the courts of that jurisdiction'::text) else o end order by m)
                             from jsonb_array_elements(e->'options') with ordinality as y(o, m)))
                 else e
               end
               order by n)
        from jsonb_array_elements(f) with ordinality as x(e, n)
    )
  end
$$;

create or replace function pg_temp.nda_groups_065(g jsonb) returns jsonb
language sql immutable as $$
  select case
    when g is null or jsonb_typeof(g) <> 'array' then g
    else (
      select jsonb_agg(
               case when e->>'name' = 'Law and disputes'
                    then e || '{"question": "Which jurisdiction’s law should govern the NDA, and how should a dispute be resolved?"}'::jsonb
                    else e end
               order by n)
        from jsonb_array_elements(g) with ordinality as x(e, n)
    )
  end
$$;

update public.doc_types set fields = pg_temp.nda_fields_065(fields)
 where slug = 'nda' and fields is distinct from pg_temp.nda_fields_065(fields);

update public.doc_types set groups = pg_temp.nda_groups_065(groups)
 where slug = 'nda' and groups is distinct from pg_temp.nda_groups_065(groups);

update public.doc_types set draft = jsonb_set(draft, '{fields}', pg_temp.nda_fields_065(draft->'fields'))
 where slug = 'nda' and draft is not null and jsonb_typeof(draft->'fields') = 'array'
   and (draft->'fields') is distinct from pg_temp.nda_fields_065(draft->'fields');

update public.doc_types set draft = jsonb_set(draft, '{groups}', pg_temp.nda_groups_065(draft->'groups'))
 where slug = 'nda' and draft is not null and jsonb_typeof(draft->'groups') = 'array'
   and (draft->'groups') is distinct from pg_temp.nda_groups_065(draft->'groups');

-- Check:
-- select e->>'label', jsonb_array_length(e->'options') from public.doc_types, jsonb_array_elements(fields) e
--  where slug = 'nda' and e->>'key' in ('governing_law', 'dispute_resolution');
