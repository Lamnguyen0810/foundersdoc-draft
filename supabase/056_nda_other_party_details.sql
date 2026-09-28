-- ============================================================================
-- 056 — NDA: an optional box for other party details
--
-- The parties step asks for names (053 took out the old "party details
-- required in your jurisdiction"). This adds an OPTIONAL box beneath them
-- for anything else the user wants in the NDA — an address, a registration
-- or ID number, who will sign. FD AI uses what it gives, exactly as written.
--
-- Adds the question after "Other party's name" on the live form and on any
-- saved, unpublished draft of it in the admin Questions editor, and updates
-- the step's wording. The code shows the box even before this is run.
--
-- Safe to run twice.
-- ============================================================================

create or replace function pg_temp.with_party_extra(f jsonb) returns jsonb
language sql immutable as $$
  select case
    when f is null or jsonb_typeof(f) <> 'array' then f
    when f @> '[{"key": "party_extra"}]' then f
    else coalesce((
      select jsonb_agg(x.e order by x.n, x.sub)
        from (
          select e, n, 0 as sub from jsonb_array_elements(f) with ordinality as a(e, n)
          union all
          select '{"key": "party_extra", "label": "Any other details about the parties (optional)", "type": "textarea", "required": false, "placeholder": "e.g. Meridian Logistics Pte. Ltd., UEN 201812345K, 8 Jurong Port Road, Singapore. Signing: Adeline Foo, COO.", "help": "Only what you want in the NDA — an address, a registration or ID number, who will sign. Say which party each detail belongs to. Leave blank if names are enough.", "group": "Parties"}'::jsonb, n, 1
            from jsonb_array_elements(f) with ordinality as b(e, n)
           where e->>'key' = 'party_b'
        ) x
    ), f)
  end
$$;

update public.doc_types
   set fields = pg_temp.with_party_extra(fields)
 where slug = 'nda'
   and not fields @> '[{"key": "party_extra"}]';

update public.doc_types
   set draft = jsonb_set(draft, '{fields}', pg_temp.with_party_extra(draft->'fields'))
 where slug = 'nda'
   and draft is not null
   and jsonb_typeof(draft->'fields') = 'array'
   and not (draft->'fields') @> '[{"key": "party_extra"}]';

update public.doc_types
   set groups = replace(groups::text,
         'Who are the parties? Just provide each person’s or organisation’s name.',
         'Who are the parties? Their names are enough — add any other details (an address, a registration number, who will sign) in the box below if you want them in the NDA.')::jsonb
 where slug = 'nda'
   and groups::text like '%Just provide each person’s or organisation’s name.%';

update public.doc_types
   set draft = replace(draft::text,
         'Who are the parties? Just provide each person’s or organisation’s name.',
         'Who are the parties? Their names are enough — add any other details (an address, a registration number, who will sign) in the box below if you want them in the NDA.')::jsonb
 where slug = 'nda'
   and draft::text like '%Just provide each person’s or organisation’s name.%';

-- Check (party_extra should follow party_b):
-- select jsonb_path_query_array(fields, '$[*].key') from public.doc_types where slug = 'nda';
