-- ============================================================================
-- 097 — The IP assignment agreement
--
-- A twelfth assembled document, set up like the convertible loan agreement
-- (095):
--
--   1. The document type: slug 'ipaa', engine 'assembly', in the People
--      folder of the catalogue, with its own screen (Ipaa.tsx) and its own
--      link (/draft?type=ipassignmentagreement). The wording is Founders
--      Doc's own, built into src/lib/ipaa on the FD Lite menu: Basic,
--      Standard or Complex (the level slider), the creator's or the
--      recipient's pathway, and any governing law (Singapore, England and
--      Wales, Hong Kong, Delaware, New York, or another, left as [●] and
--      flagged). Where no fee is paid for the IP it is signed as a deed.
--      FD AI reviews the answers for points for the lawyer
--      (src/lib/ai/review.ts). Listed read-only in Admin → AI files →
--      Questions → IP Assignment Agreement.
--   2. Its folder in AI files: "IP Assignment Agreements", for a playbook.
--   3. Slack calls it "IP Assignment Agreement".
--
-- One credit per agreement; a red flag (an answer that cannot be used, or
-- the creator also named as the recipient) stops the draft, refunds the
-- credit and Slack hears (draft_activity_ipaa if set, else draft_activity).
-- Test accounts (096) stay quiet as for every document.
--
-- Slack: select public.set_webhook('draft_activity_ipaa', '<hook url>');
--
-- Safe to run twice. Run after 096.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'ipaa',
  'IP Assignment Agreement',
  'An agreement (or, where no fee is paid for the IP, a deed) under which a creator — an employee, contractor, consultant, freelancer, agency or service provider — assigns past, existing and future IP in a project to the recipient, waives moral rights and keeps confidences. Basic, Standard or Complex, as on the FD Lite menu: Standard adds a licence back and background IP; Complex adds joint ownership or the creator keeping the IP under licence, the right to sue, warranties, delivery and permitted disclosure. Singapore, England and Wales, Hong Kong, Delaware, New York or another law. The usual answers lean to the side of the user (creator or recipient). Assembled by rule; FD AI flags points for the lawyer.',
  '[]'::jsonb,
  'Assembled from Founders Doc''s IP assignment agreement wording. The AI only flags points for the lawyer (upload the playbook under Playbook → IP Assignment Agreement).',
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
insert into public.ai_folders (name) values ('IP Assignment Agreements') on conflict (name) do nothing;

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
    when 'cofounder'  then 'Co-Founder Agreement'
    when 'sha'        then 'Shareholders Agreement'
    when 'spa'        then 'SPA'
    when 'ssa'        then 'SSA'
    when 'ia'         then 'Investment Agreement'
    when 'services'   then 'Services Agreement'
    when 'loan'       then 'Loan Agreement'
    when 'cln'        then 'Convertible Loan Agreement'
    when 'ipaa'       then 'IP Assignment Agreement'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    IP Assignment Agreement is live in the catalogue (%).',
    (select case when is_active then 'active' else 'NOT active' end from public.doc_types where slug = 'ipaa');
  raise notice 'NEXT  Zapier: duplicate the Loan Agreement Zap for the IP assignment channel, then select public.set_webhook(''draft_activity_ipaa'', ''<hook url>''); — until then it posts to the general channel.';
end $$;
