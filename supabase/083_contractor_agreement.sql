-- ============================================================================
-- 083 — The contractor agreement (Beta)
--
-- A third assembled document, set up like the employment agreement (066):
--
--   1. The document type: slug 'contractor', engine 'assembly'. The draft
--      page gives it its own screen (Contractor.tsx); the questions are the
--      firm's fifteen (TF Qns, 11 March 2025, proposed amendments), built
--      into src/lib/contractor, and listed read-only in Admin → AI files →
--      Questions → Contractor Agreement, with the master menu beneath.
--   2. Its folder in AI files: "Contractor Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading the
--      Word files from the dashboard:
--        - "FD Master Contractor Agreement"   — the master wording
--        - "Contractor Agreement — Master Menu" — the clause map
--      They are filed as needs_review and not permitted, so the AI never
--      reads them. Delete each placeholder once the real file is uploaded.
--
-- Until the master is transcribed into src/lib/contractor/data/master.ts,
-- a contractor draft is saved as `stopped` with the answers and the review
-- points, Slack hears (via draft_activity_contractor if set, else
-- draft_activity), and a lawyer sends the draft by hand. No credit is taken.
--
-- Slack: select public.set_webhook('draft_activity_contractor', 'https://hooks.zapier.com/…');
--
-- Safe to run twice.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'contractor',
  'Contractor Agreement',
  'Engage a freelancer or consultant in any country. Assembled from the FD Master Contractor Agreement by rule from fifteen questions; FD AI flags anything that makes the contractor look like an employee. Beta: until the master is loaded, the answers are saved and the firm sends the draft.',
  '[]'::jsonb,
  'Assembled from the FD master contractor agreement. The AI only flags points for the lawyer (upload the playbook under Playbook → Contractor Agreement).',
  '[]'::jsonb,
  'assembly',
  true
)
on conflict (slug) do update
  set label       = excluded.label,
      description = excluded.description,
      engine      = 'assembly',
      is_active   = true,
      updated_at  = now();

-- 2. Its folder ----------------------------------------------------------------
insert into public.ai_folders (name) values ('Contractor Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'contractor', 'FD Master Contractor Agreement', 'PLACEHOLDER_upload_the_master.docx', 'docx', 'Any', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the firm''s master contractor agreement (Word) into this folder with this title, then delete this row. Lam transcribes it into the assembler and the Beta goes live.',
       'Placeholder — the FD Master Contractor Agreement has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Contractor Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'contractor' and title = 'FD Master Contractor Agreement');

insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'contractor', 'Contractor Agreement — Master Menu', 'PLACEHOLDER_upload_the_master_menu.docx', 'docx', 'Any', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload the master menu (which question switches which clause) as Word into this folder with this title, then delete this row. The code''s own version is under Questions → Contractor Agreement.',
       'Placeholder — the master menu has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Contractor Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'contractor' and title = 'Contractor Agreement — Master Menu');

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Contractor Agreement (Beta) is live in the catalogue. Folder "Contractor Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'contractor' and version = 'placeholder');
  raise notice 'NEXT  Zapier: duplicate the employment Zap for #fdai-draft-contractor, then select public.set_webhook(''draft_activity_contractor'', ''<hook url>'');';
end $$;
