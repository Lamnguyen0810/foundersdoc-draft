/**
 * What the master dashboard reads from each table (0244), and nothing more.
 *
 * Kept on their own, with no server code, so a test can hold them to the privacy rule
 * (figures.ts): no request's title or file, and no signer's or holder's name or email, is ever
 * read for this page. owner_email / owner_name are the sending ACCOUNT, which is what the page
 * shows a request by.
 */
export const ENVELOPE_COLUMNS = "id, status, created_at, completed_at, owner_id, owner_email, owner_name, esop_holder_id, esop_tranche";
export const SIGNER_COLUMNS = "envelope_id, position, status, invited_at, viewed_at";
export const COMPANY_COLUMNS = "id, slug, name, plan, self_serve, email_override";
export const BATCH_COLUMNS = "company_id, batch, vesting_start, tranches";
export const HOLDER_COLUMNS = "id, company_id, batch, status";
export const RUN_COLUMNS = "company_id, ref, approved_at, sent_at, paid_at, simulation";
export const CERTIFICATE_COLUMNS = "holder_id, tranche";
export const ALERT_COLUMNS = "company_id, ref";
export const REQUEST_COLUMNS = "company_id, ref, kind";
export const SUBSCRIPTION_COLUMNS = "user_id, tier";

/** Every list, for the test. */
export const ALL_COLUMNS = { ENVELOPE_COLUMNS, SIGNER_COLUMNS, COMPANY_COLUMNS, BATCH_COLUMNS, HOLDER_COLUMNS, RUN_COLUMNS, CERTIFICATE_COLUMNS, ALERT_COLUMNS, REQUEST_COLUMNS, SUBSCRIPTION_COLUMNS };
