-- ============================================================================
-- 084 — The contractor agreement drafts (the master of 11 March 2025 is in)
--
-- With 083 the Contractor Agreement was a Beta that saved the answers for a
-- lawyer. The FD Master Contractor Agreement (110325) and its Master Menu
-- are now transcribed into src/lib/contractor, so FD AI assembles the
-- agreement itself, in the version chosen (Basic / Standard / Complex).
--
--   1. The document type's description says so.
--   2. The two placeholder rows in AI files → Contractor Agreements say what
--      to upload now: the redacted master Word file, with the menu kept in
--      the code (Admin → Questions → Contractor Agreement).
--   3. Slack calls it "Contractor Agreement" rather than "Contractor".
--
-- Safe to run twice.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
update public.doc_types
   set description = 'Engage a freelancer or consultant in any country. Assembled from the FD Master Contractor Agreement by rule from fifteen questions, in the Basic, Standard or Complex version; FD AI flags anything that makes the contractor look like an employee. Beta.',
       updated_at  = now()
 where slug = 'contractor';

-- 2. The placeholders ------------------------------------------------------------
update public.ai_sources
   set note = 'PLACEHOLDER. Upload FD_Master_Contractor_Agreement_110325_REDACTED.docx (the master of 11 March 2025, hidden metadata removed) into this folder with this title, then delete this row. The same wording is transcribed in the code (src/lib/contractor/data/master.ts).'
 where doc_type_slug = 'contractor' and version = 'placeholder' and title = 'FD Master Contractor Agreement';

update public.ai_sources
   set note = 'PLACEHOLDER. The Master Menu of 11 March 2025 (43 clauses; Complex / Standard / Basic) is built into the code and shown under Admin → AI files → Questions → Contractor Agreement. Upload the menu as Word here for the record, then delete this row.'
 where doc_type_slug = 'contractor' and version = 'placeholder' and title = 'Contractor Agreement — Master Menu';

-- 3. Slack's name for it ----------------------------------------------------------
create or replace function public.doc_short_name(p_slug text)
returns text
language sql
immutable
as $$
  select case p_slug
    when 'nda'        then 'NDA'
    when 'term'       then 'Term Sheet'
    when 'employment' then 'Employment Contract'
    when 'contractor' then 'Contractor Agreement'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Contractor Agreement: description updated; placeholders say what to upload; Slack name set.';
  raise notice 'NEXT  Deploy the code (feat/contractor-master). Upload the redacted master into AI files → Contractor Agreements, then delete the placeholder rows.';
end $$;
