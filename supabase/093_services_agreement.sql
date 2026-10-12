-- ============================================================================
-- 093 — The services agreement (Beta)
--
-- A ninth assembled document, set up like the investment agreement (090):
--
--   1. The document type: slug 'services', engine 'assembly'. It was already
--      in the catalogue as "coming soon"; this row makes it live, and the
--      draft page gives it its own screen (Services.tsx). There is no FD
--      Lite question bank: the questions and wording come from two
--      precedents — A, a platform service agreement (with FD AI's review of
--      it for each side), and B, an advisory services agreement — built into
--      src/lib/services. The user says whether they are the Service Provider
--      or the Customer, and the usual answers lean to that side. Listed
--      read-only in Admin → AI files → Questions → Services Agreement.
--   2. Its folder in AI files: "Services Agreements".
--   3. Two PLACEHOLDERS in that folder, for FD to replace by uploading the
--      REDACTED precedents from the dashboard:
--        - "FD Services Precedent A — Platform Service Agreement (redacted)"
--        - "FD Services Precedent B — Advisory Services Agreement (redacted)"
--      Filed as needs_review and not permitted, so the AI never reads them.
--      Delete each placeholder once the real file is uploaded.
--   4. Slack calls it "Services Agreement".
--
-- One credit per agreement; a red flag (an answer that cannot be used, or
-- the same party on both sides) stops the draft, refunds the credit and
-- Slack hears (draft_activity_services if set, else draft_activity).
--
-- Slack: select public.set_webhook('draft_activity_services', 'https://hooks.zapier.com/…');
--
-- Safe to run twice. Run after 090.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'services',
  'Services Agreement',
  'A Singapore-law agreement to provide or buy services: a platform or software subscription, or professional work such as consulting or advisory services. The usual answers lean to the side of the user (Service Provider or Customer). Assembled by rule from two services agreements and FD AI''s review of them; FD AI flags points for the lawyer. Beta.',
  '[]'::jsonb,
  'Assembled from two services agreements and FD AI''s review of them. The AI only flags points for the lawyer (upload the playbook under Playbook → Services Agreement).',
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
insert into public.ai_folders (name) values ('Services Agreements') on conflict (name) do nothing;

-- 3. The placeholders ------------------------------------------------------------
insert into public.ai_sources
  (folder_id, doc_type_slug, title, filename, file_ext, jurisdiction, version,
   privacy, status, permitted, note, content, bytes, uploaded_by_email)
select f.id, 'services', t.title, t.filename, 'docx', 'Singapore', 'placeholder',
       'clear', 'needs_review', false, t.note,
       'Placeholder — not uploaded yet. Not for AI use.',
       0, 'setup@foundersdoc.com'
from public.ai_folders f
cross join (values
  ('FD Services Precedent A — Platform Service Agreement (redacted)', 'PLACEHOLDER_upload_Services_Precedent_A_Platform_REDACTED.docx',
   'PLACEHOLDER. Upload the REDACTED platform service agreement (never the client original) into this folder with this title, then delete this row. Its wording, and the positions from FD AI''s review of it, are built into the code (src/lib/services/data/master.ts).'),
  ('FD Services Precedent B — Advisory Services Agreement (redacted)', 'PLACEHOLDER_upload_Services_Precedent_B_Advisory_REDACTED.docx',
   'PLACEHOLDER. Upload the REDACTED advisory services agreement (never the client original) into this folder with this title, then delete this row. Its wording is built into the code (src/lib/services/data/master.ts).')
) as t(title, filename, note)
where f.name = 'Services Agreements'
  and not exists (select 1 from public.ai_sources s where s.doc_type_slug = 'services' and s.title = t.title);

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
    when 'ssa'        then 'SSA'
    when 'ia'         then 'Investment Agreement'
    when 'services'   then 'Services Agreement'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Services Agreement (Beta) is live in the catalogue. Folder "Services Agreements" has % placeholder(s).',
    (select count(*) from public.ai_sources where doc_type_slug = 'services' and version = 'placeholder');
  raise notice 'NEXT  Upload the two REDACTED precedents into AI files → Services Agreements and delete the placeholders. Zapier: duplicate the Investment Agreement Zap for the services channel, then select public.set_webhook(''draft_activity_services'', ''<hook url>'');';
end $$;
