-- 138 · OnPoint: send reminders from the client's own Microsoft 365 mailbox (0270).
--
-- The client opens a connect link, signs in to Microsoft themselves and approves "send mail as you".
-- Only the encrypted Microsoft refresh token is kept (AES-256-GCM, key in ONPOINT_TOKEN_KEY on Vercel);
-- never a password. Disconnecting clears it. Safe to run more than once.

alter table public.onpoint_workspaces
  add column if not exists mail_provider     text check (mail_provider is null or mail_provider in ('microsoft')),
  add column if not exists mail_address      text check (mail_address is null or (length(mail_address) <= 200 and mail_address like '%@%')),
  add column if not exists mail_name         text check (mail_name is null or length(mail_name) <= 160),
  add column if not exists mail_token_enc    text check (mail_token_enc is null or length(mail_token_enc) <= 20000),
  add column if not exists mail_connected_at timestamptz,
  add column if not exists mail_error        text check (mail_error is null or length(mail_error) <= 500);

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'onpoint_workspaces' and column_name = 'mail_token_enc') then
    raise exception 'FAILED: mailbox columns not added';
  end if;
  raise notice 'OK    OnPoint mailbox columns ready.';
end $$;
