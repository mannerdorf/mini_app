-- Пресеты ролей (настраиваемые в админке)
create table if not exists admin_role_presets (
  id serial primary key,
  label text not null,
  permissions jsonb not null default '{}',
  financial_access boolean not null default false,
  service_mode boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_role_presets_label_key on admin_role_presets(label);

-- Дефолтные пресеты (при первом запуске; при повторном — по label не дублируем)
insert into admin_role_presets (label, permissions, financial_access, service_mode, sort_order)
values
  ('Менеджер', '{"cms_access":false,"cargo":true,"doc_invoices":true,"doc_acts":true,"doc_orders":true,"doc_claims":true,"doc_contracts":true,"doc_acts_settlement":true,"doc_tariffs":true,"chat":true,"service_mode":false}', true, false, 1),
  ('Бухгалтерия', '{"cms_access":false,"cargo":true,"doc_invoices":true,"doc_acts":true,"doc_orders":true,"doc_claims":true,"doc_contracts":true,"doc_acts_settlement":true,"doc_tariffs":true,"chat":false,"service_mode":false}', true, false, 2),
  ('Служебный режим', '{"cms_access":true,"cargo":true,"doc_invoices":true,"doc_acts":true,"doc_orders":true,"doc_claims":true,"doc_contracts":true,"doc_acts_settlement":true,"doc_tariffs":true,"chat":true,"service_mode":true}', true, true, 3),
  ('Пустой', '{"cms_access":false,"cargo":false,"doc_invoices":false,"doc_acts":false,"doc_orders":false,"doc_claims":false,"doc_contracts":false,"doc_acts_settlement":false,"doc_tariffs":false,"chat":false,"service_mode":false}', false, false, 4)
on conflict (label) do nothing;
