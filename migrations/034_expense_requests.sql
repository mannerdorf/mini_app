-- ========== 034_expense_requests.sql ==========
-- Заявки на расходы от руководителей подразделений.
-- Хранение заявок, вложений (файлов) и справочника ТС.

-- Справочник транспортных средств (используется в выпадающем меню при создании заявки).
create table if not exists expense_vehicles (
  id bigserial primary key,
  plate text not null,                    -- гос. номер (напр. А123БВ/39)
  model text,                             -- марка/модель ТС
  vin text,                               -- VIN-номер (необязательно)
  active boolean not null default true,   -- используется ли ТС в данный момент
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists expense_vehicles_plate_uidx
  on expense_vehicles (upper(replace(plate, ' ', '')));

comment on table expense_vehicles is 'Справочник транспортных средств для заявок на расходы';
comment on column expense_vehicles.plate is 'Государственный регистрационный номер ТС';

-- Справочник статей расходов (категорий).
create table if not exists expense_categories (
  id text primary key,                    -- slug: fuel, repair, salary, ...
  name text not null,                     -- отображаемое название
  cost_type text,                         -- COGS / OPEX / CAPEX (заполняется бухгалтером, не руководителем)
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table expense_categories is 'Справочник статей расходов (категорий) для заявок';

-- Начальное наполнение категорий.
insert into expense_categories (id, name, sort_order) values
  ('fuel',        'Топливо',                 1),
  ('repair',      'Ремонт и обслуживание',   2),
  ('spare_parts', 'Запасные части',          3),
  ('salary',      'Зарплата',                4),
  ('office',      'Офис',                    5),
  ('rent',        'Аренда',                  6),
  ('insurance',   'Страхование',             7),
  ('other',       'Прочее',                100)
on conflict (id) do nothing;

-- Заявки на расходы.
create table if not exists expense_requests (
  id bigserial primary key,
  uid text not null unique default ('er-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 7)),
  login text not null,                    -- логин автора (руководителя подразделения)
  department text not null,               -- подразделение из справочника сотрудников
  doc_number text not null default '',    -- номер документа (счёт, накладная)
  doc_date date,                          -- дата документа
  period text not null default '',        -- отчётный период (YYYY-MM)
  category_id text not null references expense_categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  vat_rate text not null default '',            -- ставка НДС: '', '0', '5', '7', '10', '20', '22'
  employee_name text not null default '',      -- ФИО сотрудника из справочника подразделения
  comment text not null default '',
  vehicle_id bigint references expense_vehicles(id),  -- связь со справочником ТС (null = не указано)
  vehicle_text text,                      -- текстовое представление ТС на момент создания
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'sent', 'approved', 'rejected', 'paid')),
  approved_by text,                       -- логин утвердившего (суперадмин)
  approved_at timestamptz,
  rejection_reason text,
  webhook_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Добавление колонок, если таблица уже существовала без них (идемпотентно).
alter table expense_requests add column if not exists doc_number text not null default '';
alter table expense_requests add column if not exists doc_date date;
alter table expense_requests add column if not exists period text not null default '';
alter table expense_requests add column if not exists vat_rate text not null default '';
alter table expense_requests add column if not exists employee_name text not null default '';
alter table expense_requests add column if not exists approved_by text;
alter table expense_requests add column if not exists approved_at timestamptz;
alter table expense_requests add column if not exists rejection_reason text;

-- Расширение check-constraint на status, если таблица была создана ранее с меньшим набором статусов.
do $$
begin
  if exists (
    select 1 from information_schema.table_constraints
    where table_name = 'expense_requests' and constraint_type = 'CHECK'
      and constraint_name = 'expense_requests_status_check'
  ) then
    alter table expense_requests drop constraint expense_requests_status_check;
  end if;
  alter table expense_requests add constraint expense_requests_status_check
    check (status in ('draft', 'pending_approval', 'sent', 'approved', 'rejected', 'paid'));
exception when others then null;
end $$;

create index if not exists expense_requests_login_idx
  on expense_requests(login);

create index if not exists expense_requests_department_idx
  on expense_requests(department);

create index if not exists expense_requests_status_idx
  on expense_requests(status);

create index if not exists expense_requests_created_at_idx
  on expense_requests(created_at desc);

create index if not exists expense_requests_category_id_idx
  on expense_requests(category_id);

create unique index if not exists expense_requests_login_doc_number_uidx
  on expense_requests (login, lower(trim(doc_number)))
  where doc_number <> '';

comment on table expense_requests is 'Заявки на расходы от руководителей подразделений';
create index if not exists expense_requests_period_idx
  on expense_requests(period);

comment on column expense_requests.doc_number is 'Номер документа (счёт / накладная). Уникален в пределах логина.';
comment on column expense_requests.doc_date is 'Дата документа (дата выставления счёта или накладной)';
comment on column expense_requests.period is 'Отчётный период в формате YYYY-MM (месяц/год)';
comment on column expense_requests.uid is 'Клиентский идентификатор заявки (генерируется на фронте)';
comment on column expense_requests.status is 'draft=черновик, pending_approval=на согласовании, sent=отправлено, approved=утверждено, rejected=отклонено, paid=оплачено';

-- Вложения (файлы) к заявкам.
create table if not exists expense_request_attachments (
  id bigserial primary key,
  request_id bigint not null references expense_requests(id) on delete cascade,
  file_name text not null,                -- оригинальное имя файла
  mime_type text,                         -- MIME-тип (image/jpeg, application/pdf, ...)
  file_size bigint,                       -- размер в байтах
  storage_path text,                      -- путь в S3/файловом хранилище (если используется)
  file_data bytea,                        -- содержимое файла (для хранения прямо в БД, если < ~10 МБ)
  created_at timestamptz not null default now()
);

create index if not exists expense_request_attachments_request_id_idx
  on expense_request_attachments(request_id);

comment on table expense_request_attachments is 'Вложения (счета, документы) к заявкам на расходы';
comment on column expense_request_attachments.file_data is 'Содержимое файла (bytea). Для больших файлов рекомендуется S3 + storage_path';
comment on column expense_request_attachments.storage_path is 'Путь к файлу в S3 / файловом хранилище (альтернатива file_data)';

-- Журнал изменений статусов заявок (аудит).
create table if not exists expense_request_status_log (
  id bigserial primary key,
  request_id bigint not null references expense_requests(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text not null,               -- логин, кто изменил статус
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists expense_request_status_log_request_id_idx
  on expense_request_status_log(request_id);

comment on table expense_request_status_log is 'Журнал изменений статусов заявок на расходы (аудит)';
