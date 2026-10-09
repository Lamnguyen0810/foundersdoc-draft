-- ============================================================================
-- 088 — The share purchase agreement (Beta)
--
-- A sixth assembled document, set up like the shareholders agreement (087):
--
--   1. The document type: slug 'spa', engine 'assembly'. The draft page
--      gives it its own screen (Spa.tsx). There is no FD Lite SPA master or
--      question bank yet, so the questions were written for FD AI and the
--      agreement is assembled from the firm's one SPA precedent, redacted
--      and generalised for one to five sellers (src/lib/spa). Listed
--      read-only in Admin → AI files → Questions → Share Purchase
--      Agreement, with what was taken out, what was reworded, the FD
--      supplementary wording and the precedent's slips.
--   2. Its folder in AI files: "Share Purchase Agreements".
--   3. A PLACEHOLDER in that folder, for FD to replace by uploading from the
--      dashboard: "Share Purchase Agreement — Precedent (redacted)", the
--      file SPA_Precedent_REDACTED.docx (tracked changes accepted, comments
--      and hidden metadata removed, every client name, ID, address, email
--      and figure replaced by a placeholder). Filed as needs_review and not
--      permitted, so the AI never reads it. Delete the placeholder once the
--      file is uploaded.
--   4. Slack calls it "SPA".
--
-- One credit per agreement, as for the SHA; a red flag stops the draft,
-- refunds the credit and Slack hears (draft_activity_spa if set, else
-- draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_spa', 'https://hooks.zapier.com/…');
--
-- Safe to run twice. Run after 087.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'spa',
  'Share Purchase Agreement',
  'Buy or sell shares in a Singapore company: the price and how it is paid, conditions, Closing, warranties, indemnities, restrictions on the sellers. Assembled by rule from a Founders Doc precedent (Singapore); FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from a Founders Doc share purchase agreement precedent. The AI only flags points for the lawyer (upload the playbook under Playbook → Share Purchase Agreement).',
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
insert into public.ai_folders (name) values ('Share Purchase Agreements') on conflict (name) do nothing;

-- 3. The placeholder -------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'spa', 'Share Purchase Agreement — Precedent (redacted)', 'PLACEHOLDER_upload_the_precedent.docx', 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false,
       'PLACEHOLDER. Upload SPA_Precedent_REDACTED.docx into this folder with this title, then delete this row. The same wording, generalised, is in the code (src/lib/spa/data/master.ts and warranties.ts).',
       'Placeholder — the SPA precedent has not been uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
where f.name = 'Share Purchase Agreements'
  and not exists (select 1 from public.ai_sources where doc_type_slug = 'spa' and title = 'Share Purchase Agreement — Precedent (redacted)');

-- 4. Slack's name for it ----------------------------------------------------------
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
    when 'cofounder'  then 'Co-Founder Agreement'
    when 'sha'        then 'Shareholders Agreement'
    when 'spa'        then 'SPA'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Share Purchase Agreement (Beta) is live in the catalogue. Folder "Share Purchase Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'spa' and version = 'placeholder');
  raise notice 'NEXT  Upload SPA_Precedent_REDACTED.docx into AI files → Share Purchase Agreements and delete its placeholder. Zapier: duplicate the SHA Zap for #fdl-spa (or an #fdai-draft-spa channel), then select public.set_webhook(''draft_activity_spa'', ''<hook url>'');';
end $$;
