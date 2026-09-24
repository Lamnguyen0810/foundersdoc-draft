/**
 * The playbook: the firm's drafting rules, as the dashboard and the drafter
 * both see them. Storage is supabase/044_playbook.sql.
 */

/** A saved version, as the dashboard lists it. `content` is only carried for
 *  the live one and for a version the person opens. */
export interface PlaybookVersion {
  id: string;
  scope: string;
  version: number;
  filename: string | null;
  note: string | null;
  live: boolean;
  saved_by_email: string | null;
  created_at: string;
  chars: number;
}

/** What drafting reads: one block per live playbook that applies, firm-wide first. */
export interface PlaybookBlock {
  scope: string;
  title: string;
  text: string;
}

/** The firm-wide scope, which applies to every document type. */
export const FIRM_WIDE = "*";

/** The longest playbook the prompt will carry. Rules are short by nature; a
 *  200-page manual is not a playbook, it is a reference the model would
 *  drown in — and the model's context is not free. */
export const MAX_PLAYBOOK_CHARS = 60_000;

export const PLAYBOOK_COLUMNS =
  "id,scope,version,filename,note,live,saved_by_email,created_at,chars";
