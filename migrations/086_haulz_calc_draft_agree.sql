-- Статусы согласования перевозки и ссылка из КП на почту.

alter table haulz_calc_drafts drop constraint if exists haulz_calc_drafts_status_check;

alter table haulz_calc_drafts add constraint haulz_calc_drafts_status_check
  check (status in ('draft', 'new', 'awaiting_call', 'agreed', 'rejected', 'submitted'));

alter table haulz_calc_drafts add column if not exists recipient_email text;
alter table haulz_calc_drafts add column if not exists agree_token text;
alter table haulz_calc_drafts add column if not exists transport_agreed_at timestamptz;

create unique index if not exists haulz_calc_drafts_agree_token_uidx
  on haulz_calc_drafts(agree_token) where agree_token is not null;

create index if not exists haulz_calc_drafts_status_updated_idx
  on haulz_calc_drafts(status, updated_at desc);
