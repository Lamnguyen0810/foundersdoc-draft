-- ============================================================================
-- 051 — AI files: one folder per document type
--
-- Uploads now go into their document type's folder by default (NDAs, Term
-- Sheets…; see /api/admin/ai-sources). This files what is already there:
-- makes the two folders if they are missing and moves every Unfiled sample
-- into its type's folder. Samples already in a folder stay where they are.
-- Folders only group documents; nothing about drafting changes.
--
-- Safe to run twice.
-- ============================================================================

insert into public.ai_folders (name)
values ('NDAs'), ('Term Sheets')
on conflict (name) do nothing;

update public.ai_sources s
   set folder_id = f.id
  from public.ai_folders f
 where s.folder_id is null
   and ((s.doc_type_slug = 'nda'  and f.name = 'NDAs')
     or (s.doc_type_slug = 'term' and f.name = 'Term Sheets'));

-- Check:
-- select f.name, s.doc_type_slug, count(*) from public.ai_sources s
--   left join public.ai_folders f on f.id = s.folder_id group by 1, 2 order by 1, 2;
