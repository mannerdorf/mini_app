-- ========== 001_chat.sql ==========
create table if not exists chat_sessions (
  id text primary key,
  user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists chat_messages (
  id bigserial primary key,
  session_id text not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_created_at_idx
  on chat_messages(session_id, created_at);

-- ========== 002_rag.sql ==========
create extension if not exists vector;

create table if not exists rag_documents (
  id bigserial primary key,
  source_type text not null,
  source_id text not null,
  title text,
  content text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_type, source_id)
);

create table if not exists rag_chunks (
  id bigserial primary key,
  document_id bigint not null references rag_documents(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) not null,
  tokens int,
  created_at timestamptz not null default now()
);

create index if not exists rag_chunks_document_id_idx on rag_chunks(document_id);

create index if not exists rag_chunks_embedding_idx
  on rag_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ========== 003_account_companies.sql ==========
create table if not exists account_companies (
  login text not null,
  inn text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (login, inn)
);

create index if not exists account_companies_login_idx on account_companies(login);

-- ========== 004_chat_session_bindings.sql ==========
create table if not exists chat_session_bindings (
  session_id text primary key references chat_sessions(id) on delete cascade,
  login text,
  inn text,
  customer_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_session_bindings_login_idx on chat_session_bindings(login) where login is not null;

-- ========== 005_notification_poll.sql ==========
create table if not exists notification_poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  inns_polled int not null default 0,
  notifications_sent int not null default 0,
  error_message text
);

create index if not exists notification_poll_runs_started_at_idx on notification_poll_runs(started_at desc);

create table if not exists cargo_last_state (
  inn text not null,
  cargo_number text not null,
  state text,
  state_bill text,
  updated_at timestamptz not null default now(),
  primary key (inn, cargo_number)
);

create index if not exists cargo_last_state_inn_idx on cargo_last_state(inn);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  poll_run_id uuid references notification_poll_runs(id) on delete set null,
  login text not null,
  inn text not null,
  cargo_number text not null,
  event text not null,
  channel text not null default 'telegram',
  sent_at timestamptz not null default now(),
  telegram_chat_id text,
  success boolean not null default true,
  error_message text
);

create index if not exists notification_deliveries_poll_run_idx on notification_deliveries(poll_run_id);
create index if not exists notification_deliveries_login_sent_idx on notification_deliveries(login, sent_at desc);

-- ========== 006_notification_preferences.sql ==========
create table if not exists notification_preferences (
  login text not null,
  channel text not null check (channel in ('telegram', 'web')),
  event_id text not null check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_created', 'bill_paid', 'daily_summary')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (login, channel, event_id)
);

create index if not exists notification_preferences_login_idx on notification_preferences(login);
create index if not exists notification_preferences_enabled_idx on notification_preferences(login, channel) where enabled = true;

-- ========== 007_chat_api_results.sql ==========
create table if not exists chat_api_results (
  id bigserial primary key,
  session_id text not null,
  api_name text not null,
  request_payload jsonb not null default '{}',
  response_payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists chat_api_results_session_id_created_at_idx
  on chat_api_results(session_id, created_at desc);

-- ========== 008_chat_capabilities.sql ==========
create table if not exists chat_capabilities (
  id bigserial primary key,
  slug text not null unique,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_capabilities_slug_idx on chat_capabilities(slug);

insert into chat_capabilities (slug, title, content, updated_at) values
(
  'gruzik_abilities',
  'Что умеет Грузик',
  'Грузик — AI-помощник HAULZ. Возможности:

1. ПЕРЕВОЗКИ (API get_perevozki)
- Список перевозок за период: за сегодня, за неделю, за месяц, за вчера.
- Фильтр по статусу: в пути, готов к выдаче, на доставке, доставлено.
- Фильтр по типу: паром, авто.
- Фильтр по маршруту: Москва–Калининград (MSK-KGD), Калининград–Москва (KGD-MSK).
- Фильтр по оплате: не оплачен, оплачен, частично, отменён.
- По контрагенту: отправитель, получатель, заказчик.
- Комбинации: например «перевозки в пути за неделю», «неоплаченные паромом за месяц».

2. КОНТАКТЫ (API get_contacts)
- Адреса офисов, телефон, email, сайт HAULZ.

3. ДОКУМЕНТЫ ПО ПЕРЕВОЗКЕ
- ЭР, Счет, УПД, АПП по номеру перевозки (в веб-чате и Telegram).

4. ПОЛНАЯ ИНФОРМАЦИЯ ПО НОМЕРУ
- Детали перевозки по номеру из базы знаний (RAG).

Используй инструменты get_perevozki и get_contacts когда пользователь явно просит список перевозок или контакты. Для перевозок нужны учётные данные (логин/пароль) из контекста сессии.',
  now()
),
(
  'gruzik_examples',
  'Примеры запросов пользователей',
  'Варианты запросов, которые понимает Грузик:

ПЕРЕВОЗКИ:
- перевозки за сегодня; что за сегодня; грузы на сегодня;
- перевозки за неделю; за последнюю неделю; что за неделю;
- перевозки за месяц; за последний месяц;
- что в пути; перевозки в пути; отправленные;
- готовые к выдаче; готов к выдаче;
- на доставке; доставляются;
- доставлено; доставленные; что уже доставлено;
- паромом; паром; перевозки паромом;
- авто; автомобилем; перевозки авто;
- Москва Калининград; МСК КГД; туда;
- Калининград Москва; КГД МСК; обратно;
- неоплаченные; не оплачен; долги; какие счета не оплачены;
- оплаченные; оплачен;
- перевозки в пути за неделю; неоплаченные за месяц; паромом за сегодня;
- по отправителю ООО Ромашка; по заказчику X; по получателю Y;

КОНТАКТЫ:
- контакты; адрес; телефон; email; сайт; офис; как связаться;

ДОКУМЕНТЫ И ПЕРЕВОЗКА:
- документы по перевозке 12345; ЭР по 12345; счет на перевозку; УПД; АПП;
- полная информация по перевозке 12345; что по перевозке 12345;

ОБЩЕЕ:
- привет; что умеешь; помощь; отвяжи компанию.',
  now()
)
on conflict (slug) do update set
  title = excluded.title,
  content = excluded.content,
  updated_at = excluded.updated_at;

-- ========== 021_payment_calendar.sql ==========
-- Платёжный календарь: условия оплаты по заказчикам (ИНН).
-- days_to_pay — срок оплаты счёта в днях с момента выставления (0 = не задано).
create table if not exists payment_calendar (
  inn text not null primary key,
  days_to_pay int not null default 0,
  updated_at timestamptz not null default now()
);

comment on table payment_calendar is 'Условия оплаты по заказчикам: срок в днях с момента выставления счёта';
comment on column payment_calendar.days_to_pay is 'Количество дней на оплату с момента выставления счёта';

-- ========== 022_payment_calendar_weekdays.sql ==========
-- Платёжный календарь: платежные дни недели (например вторник и четверг).
alter table payment_calendar
  add column if not exists payment_weekdays integer[] not null default '{}';

comment on column payment_calendar.payment_weekdays is 'Платежные дни недели (0=вс, 1=пн, ..., 6=сб). При наступлении срока оплата в первый из этих дней. Пустой = первый рабочий день.';

-- ========== 023_request_error_log.sql ==========
-- Журнал запросов к API, завершившихся ошибкой или отказом (4xx, 5xx)
create table if not exists request_error_log (
  id bigserial primary key,
  path varchar(512) not null,
  method varchar(16) not null,
  status_code smallint not null,
  error_message text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists request_error_log_created_at_idx on request_error_log(created_at desc);
create index if not exists request_error_log_status_code_idx on request_error_log(status_code);

-- ========== 024_customer_work_schedule.sql ==========
-- Рабочий график заказчика: дни недели и часы работы.
create table if not exists customer_work_schedule (
  inn text not null primary key,
  days_of_week smallint[] not null default '{1,2,3,4,5}',
  work_start time not null default '09:00',
  work_end time not null default '18:00',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table customer_work_schedule is 'Рабочий график заказчика: дни недели (1=пн..7=вс) и часы работы';
comment on column customer_work_schedule.days_of_week is 'Дни недели: 1=понедельник, 2=вторник, ..., 7=воскресенье';
comment on column customer_work_schedule.work_start is 'Время начала рабочего дня';
comment on column customer_work_schedule.work_end is 'Время окончания рабочего дня';
create index if not exists customer_work_schedule_inn_idx on customer_work_schedule(inn);

-- ========== 025_telegram_chat_links.sql ==========
-- Привязка Telegram-чата к аккаунту HAULZ для уведомлений.
create table if not exists telegram_chat_links (
  id uuid primary key default gen_random_uuid(),
  login text not null,
  inn text,
  customer_name text,
  telegram_chat_id text not null,
  telegram_user_id text,
  chat_status text not null default 'pending' check (chat_status in ('pending', 'active', 'disabled')),
  activation_code_sent_at timestamptz,
  activated_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_chat_links_login_uidx on telegram_chat_links(lower(trim(login)));
create index if not exists telegram_chat_links_chat_id_idx on telegram_chat_links(telegram_chat_id);
create index if not exists telegram_chat_links_status_idx on telegram_chat_links(chat_status);

-- ========== 027_registered_users_employee_directory.sql ==========
-- Справочник сотрудников HAULZ: ФИО, подразделение, должность, роль и параметры начисления.
alter table registered_users add column if not exists full_name text;
alter table registered_users add column if not exists department text;
alter table registered_users add column if not exists position text;
alter table registered_users add column if not exists accrual_type text
  check (accrual_type in ('hour', 'shift'));
alter table registered_users add column if not exists accrual_rate numeric(12, 2);
alter table registered_users add column if not exists employee_role text
  check (employee_role in ('employee', 'department_head'));
create index if not exists registered_users_invited_by_employee_role_idx
  on registered_users(invited_by_user_id, employee_role)
  where invited_by_user_id is not null;

-- ========== 028_employee_timesheet_entries.sql ==========
-- Табель сотрудников: хранение значений по дням.
create table if not exists employee_timesheet_entries (
  id bigserial primary key,
  employee_id bigint not null references registered_users(id) on delete cascade,
  work_date date not null,
  value_text text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, work_date)
);
create index if not exists employee_timesheet_entries_work_date_idx
  on employee_timesheet_entries(work_date);
create index if not exists employee_timesheet_entries_employee_id_idx
  on employee_timesheet_entries(employee_id);

-- ========== 029_employee_timesheet_month_exclusions.sql ==========
-- Исключение сотрудника из табеля конкретного месяца.
create table if not exists employee_timesheet_month_exclusions (
  id bigserial primary key,
  employee_id bigint not null references registered_users(id) on delete cascade,
  month_key date not null,
  created_by_user_id bigint references registered_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (employee_id, month_key)
);
create index if not exists employee_timesheet_month_exclusions_month_idx
  on employee_timesheet_month_exclusions(month_key);

-- ========== 032_sendings_eor.sql ==========
-- EOR-статусы для строк отправок (раздел Документы -> Отправки)
create table if not exists sendings_eor (
  id bigserial primary key,
  login text not null,
  inn text,
  row_key text not null,
  sending_number text,
  sending_date date,
  statuses text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint sendings_eor_statuses_chk check (
    statuses <@ array['entry_allowed','full_inspection','turnaround']::text[]
  )
);

create unique index if not exists sendings_eor_login_row_key_uidx
  on sendings_eor (lower(trim(login)), row_key);

create index if not exists sendings_eor_login_idx
  on sendings_eor (lower(trim(login)));

create index if not exists sendings_eor_login_updated_idx
  on sendings_eor (lower(trim(login)), updated_at desc);

create index if not exists sendings_eor_sending_number_idx
  on sendings_eor (sending_number);

-- ========== 033_cache_suppliers.sql ==========
-- Кэш поставщиков из GETAPI?metod=GETALLKontragents.
create table if not exists cache_suppliers (
  inn text not null primary key,
  supplier_name text not null default '',
  email text default '',
  fetched_at timestamptz not null default now()
);

create index if not exists cache_suppliers_supplier_name_idx on cache_suppliers(supplier_name);
create index if not exists cache_suppliers_email_idx on cache_suppliers(email);

-- ========== 034_expense_requests.sql ==========
-- Заявки на расходы от руководителей подразделений.
-- Хранение заявок, вложений (файлов) и справочника ТС.

create table if not exists expense_vehicles (
  id bigserial primary key,
  plate text not null,
  model text,
  vin text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists expense_vehicles_plate_uidx
  on expense_vehicles (upper(replace(plate, ' ', '')));

create table if not exists expense_categories (
  id text primary key,
  name text not null,
  cost_type text,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

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

create table if not exists expense_requests (
  id bigserial primary key,
  uid text not null unique default ('er-' || extract(epoch from now())::bigint || '-' || substr(md5(random()::text), 1, 7)),
  login text not null,
  department text not null,
  doc_number text not null default '',
  doc_date date,
  period text not null default '',
  category_id text not null references expense_categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  comment text not null default '',
  vehicle_id bigint references expense_vehicles(id),
  vehicle_text text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'sent', 'approved', 'rejected', 'paid')),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  webhook_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists expense_requests_login_idx on expense_requests(login);
create index if not exists expense_requests_department_idx on expense_requests(department);
create index if not exists expense_requests_status_idx on expense_requests(status);
create index if not exists expense_requests_created_at_idx on expense_requests(created_at desc);
create index if not exists expense_requests_category_id_idx on expense_requests(category_id);

create unique index if not exists expense_requests_login_doc_number_uidx
  on expense_requests (login, lower(trim(doc_number)))
  where doc_number <> '';

create index if not exists expense_requests_period_idx on expense_requests(period);

create table if not exists expense_request_attachments (
  id bigserial primary key,
  request_id bigint not null references expense_requests(id) on delete cascade,
  file_name text not null,
  mime_type text,
  file_size bigint,
  storage_path text,
  file_data bytea,
  created_at timestamptz not null default now()
);

create index if not exists expense_request_attachments_request_id_idx
  on expense_request_attachments(request_id);

create table if not exists expense_request_status_log (
  id bigserial primary key,
  request_id bigint not null references expense_requests(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by text not null,
  comment text,
  created_at timestamptz not null default now()
);

create index if not exists expense_request_status_log_request_id_idx
  on expense_request_status_log(request_id);
