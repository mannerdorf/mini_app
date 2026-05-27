-- Банковские реквизиты ООО «Холз» для QR оплаты счетов (ГОСТ ST00012), одна карточка.
create table if not exists haulz_company_payee (
  id int primary key default 1 check (id = 1),
  name text not null default 'ООО «Холз»',
  inn text not null default '9706037094',
  kpp text not null default '770601001',
  account text not null default '',
  bank_name text not null default '',
  bic text not null default '',
  corr_account text not null default '',
  updated_at timestamptz not null default now()
);

insert into haulz_company_payee (id, name, inn, kpp, account, bank_name, bic, corr_account)
values (
  1,
  'ООО «Холз»',
  '9706037094',
  '770601001',
  '40702810910001507546',
  'АО «ТИНЬКОФФ БАНК»',
  '044525974',
  '30101810145250000974'
)
on conflict (id) do update set
  name = excluded.name,
  inn = excluded.inn,
  kpp = excluded.kpp,
  account = case when haulz_company_payee.account = '' then excluded.account else haulz_company_payee.account end,
  bank_name = case when haulz_company_payee.bank_name = '' then excluded.bank_name else haulz_company_payee.bank_name end,
  bic = case when haulz_company_payee.bic = '' then excluded.bic else haulz_company_payee.bic end,
  corr_account = case when haulz_company_payee.corr_account = '' then excluded.corr_account else haulz_company_payee.corr_account end,
  updated_at = now();

comment on table haulz_company_payee is 'Реквизиты получателя для QR оплаты счетов (singleton id=1)';
