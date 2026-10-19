-- ============================================================================
-- 103 — The joint venture agreement
--
-- A thirteenth assembled document, set up like the IP assignment agreement
-- (097):
--
--   1. The document type: slug 'jva', engine 'assembly', in the Company
--      folder of the catalogue, with its own screen (Jva.tsx) and its own
--      link (/draft?type=jointventureagreement). The wording is Founders
--      Doc's own, built into src/lib/jva: Basic, Standard or Complex (the
--      level slider), 50:50 or with a majority partner (the usual answers
--      lean to the user's side), individuals or companies, and any
--      governing law (Singapore, England and Wales, Hong Kong, Delaware, New
--      York, or another, left as [●] and flagged). Always an agreement.
--      FD AI reviews the answers for points for the lawyer
--      (src/lib/ai/review.ts). Listed read-only in Admin → AI files →
--      Questions → Joint Venture Agreement.
--   2. Its folder in AI files: "Joint Venture Agreements", for a playbook.
--   3. Slack calls it "Joint Venture Agreement" and posts it to
--      #fdai-draft-jva through the router Zap (099).
--
-- One credit per agreement; a red flag (an answer that cannot be used, a
-- majority of 50% or less, or the same party on both sides) stops the
-- draft, refunds the credit and Slack hears. Test accounts (096) stay quiet
-- as for every document.
--
-- Safe to run twice. Run after 102.
-- ============================================================================

-- 1. The document type --------------------------------------------------------
insert into public.doc_types (slug, label, description, fields, system_prompt, examples, engine, is_active)
values (
  'jva',
  'Joint Venture Agreement',
  'An agreement between two parties — individuals or companies — who own a joint venture company, 50:50 or with one holding the majority: the company and its business, the shares and what each party pays, the board and casting vote, the decisions that need both parties, deadlock, transfers and pre-emption, and confidentiality. Basic, Standard or Complex: Standard adds further funding, the full reserved matters, the business plan, information, dividends, a buy-out or winding up on deadlock, a lock-in, default at fair value, restrictions on competing and a deed of adherence; Complex adds tag- and drag-along, a discount for a party at fault and anti-corruption. Singapore, England and Wales, Hong Kong, Delaware, New York or another law. With a majority, the usual answers lean to the user''s side. Assembled by rule; FD AI flags points for the lawyer.',
  '[]'::jsonb,
  'Assembled from Founders Doc''s joint venture agreement wording. The AI only flags points for the lawyer (upload the playbook under Playbook → Joint Venture Agreement).',
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
insert into public.ai_folders (name) values ('Joint Venture Agreements') on conflict (name) do nothing;

-- 3. Slack's name for it, and its channel ---------------------------------------
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
    when 'jva'        then 'Joint Venture Agreement'
    else initcap(replace(coalesce(p_slug, 'document'), '_', ' '))
  end;
$$;

insert into public.slack_channels (slug, channel_id, channel_name)
values ('jva', 'C07JR5JAM9A', '#fdai-draft-jva')
on conflict (slug) do update
  set channel_id = excluded.channel_id, channel_name = excluded.channel_name, updated_at = now();

-- ────────────────────────────────────────────────────────────── the check
do $$
begin
  raise notice 'OK    Joint Venture Agreement is live in the catalogue (%), posting to %.',
    (select case when is_active then 'active' else 'NOT active' end from public.doc_types where slug = 'jva'),
    public.draft_channel_name('jva');
  raise notice 'NEXT  #fdai-draft-jva is private: invite the Zapier Slack app to it (/invite @Zapier) or posts will fail.';
end $$;
