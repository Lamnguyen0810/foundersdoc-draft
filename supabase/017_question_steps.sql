-- ===========================================================================
-- FDAI — the questions as steps, and a draft that is not yet live
-- Paste into the Supabase SQL editor and run once. Safe to re-run.
--
-- STEPS. The form asks its questions in steps — one per group — and each
-- step has a title and a question line the user reads at the top of it.
-- Until now the order of steps was whichever group happened to appear first
-- in the list, and the wording was fixed in the code. `groups` stores both
-- in step order, so the admin sees and sets what the user gets.
--
-- DRAFT. Saving the editor no longer changes the live form. Save writes to
-- `draft`; Publish copies the draft into `fields` and `groups`, which is what
-- the drafting screen reads. An admin can save half-done work at lunch and
-- nobody drafting an NDA that afternoon sees it.
-- ===========================================================================

alter table public.doc_types add column if not exists groups         jsonb;
alter table public.doc_types add column if not exists draft          jsonb;
alter table public.doc_types add column if not exists draft_saved_at timestamptz;
alter table public.doc_types add column if not exists published_at   timestamptz;

-- Every type whose steps are not yet stored gets them from its questions —
-- the groups in order of first appearance, which is the order the form has
-- been using — with the NDA wording the form has been showing. Rows that
-- already have groups are left alone.
with wording(name, title, question) as (
  values
    ('The shape of it', 'Direction',              'Which direction are we going — mutual, or one-way?'),
    ('Parties',         'Who’s involved',         'Who are the parties? Just provide each person’s or organisation’s name.'),
    ('The deal',        'The deal',               'What’s the deal about, and what will be shared?'),
    ('Terms',           'How long and how strict','How long should confidentiality last, and how strict should it be? I’ve set sensible Singapore defaults — change only what you need.'),
    ('Anything else',   'Anything else',          'Anything else you’d like included?')
),
first_seen as (
  select d.slug, f.value->>'group' as name, min(f.ordinality) as pos
  from public.doc_types d
  cross join lateral jsonb_array_elements(coalesce(d.fields, '[]'::jsonb)) with ordinality as f(value, ordinality)
  where d.groups is null
  group by d.slug, f.value->>'group'
),
built as (
  select fs.slug,
         jsonb_agg(
           jsonb_build_object(
             'name',     fs.name,
             'title',    coalesce(w.title, fs.name),
             'question', coalesce(w.question, fs.name)
           )
           order by fs.pos
         ) as groups
  from first_seen fs
  left join wording w on w.name = fs.name
  group by fs.slug
)
update public.doc_types d
   set groups = built.groups
  from built
 where built.slug = d.slug
   and d.groups is null;

-- ---------------------------------------------------------------------------
-- Check
-- ---------------------------------------------------------------------------
do $$
declare n integer; g jsonb;
begin
  select count(*) into n from public.doc_types where is_active and groups is null;
  raise notice '% every active type has its steps stored (% without)', case when n = 0 then 'OK   ' else 'FAIL ' end, n;

  select groups into g from public.doc_types where slug = 'nda';
  raise notice 'NDA steps, in order: %',
    (select string_agg(x->>'title', ' → ') from jsonb_array_elements(coalesce(g, '[]'::jsonb)) x);
end $$;
