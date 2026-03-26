
-- ========== 001_chat.sql ==========
-- Chat sessions + messages

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
-- RAG tables + pgvector

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

create index if not exists rag_chunks_document_id_idx
  on rag_chunks(document_id);

create index if not exists rag_chunks_embedding_idx
  on rag_chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ========== 003_account_companies.sql ==========
-- Компании (заказчики по ИНН) для учёток, авторизованных через Getcustomers

create table if not exists account_companies (
  login text not null,
  inn text not null,
  name text not null default '',
  created_at timestamptz not null default now(),
  primary key (login, inn)
);

create index if not exists account_companies_login_idx on account_companies(login);

-- ========== 004_chat_session_bindings.sql ==========
-- Привязка сессии чата к логину, ИНН и заказчику.
-- Нет записи или customer_name = null — в этой сессии «не авторизован» (активный заказчик не выбран).

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
-- Опрос по заказчику раз в час: логирование прогонов и отправленных уведомлений

-- Прогон опроса (раз в час)
create table if not exists notification_poll_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running, ok, partial, error
  inns_polled int not null default 0,
  notifications_sent int not null default 0,
  error_message text
);

create index if not exists notification_poll_runs_started_at_idx on notification_poll_runs(started_at desc);

-- Последнее известное состояние перевозки (для диффа по заказчику)
create table if not exists cargo_last_state (
  inn text not null,
  cargo_number text not null,
  state text,
  state_bill text,
  updated_at timestamptz not null default now(),
  primary key (inn, cargo_number)
);

create index if not exists cargo_last_state_inn_idx on cargo_last_state(inn);

-- Каждое отправленное уведомление (Telegram и т.д.) — логируем в БД
create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  poll_run_id uuid references notification_poll_runs(id) on delete set null,
  login text not null,
  inn text not null,
  cargo_number text not null,
  event text not null, -- accepted, in_transit, delivered, bill_paid
  channel text not null default 'telegram',
  sent_at timestamptz not null default now(),
  telegram_chat_id text,
  success boolean not null default true,
  error_message text
);

create index if not exists notification_deliveries_poll_run_idx on notification_deliveries(poll_run_id);
create index if not exists notification_deliveries_login_sent_idx on notification_deliveries(login, sent_at desc);

-- ========== 006_notification_preferences.sql ==========
-- 1. БЗ пуша: заказчик (login) / канал (telegram | web) / событие (accepted, in_transit, delivered, bill_created, bill_paid, daily_summary) / вкл или выкл

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

comment on table notification_preferences is 'Настройки пуша: кому (login), каким каналом (telegram/web), по каким событиям (вкл/выкл)';

-- ========== 007_chat_api_results.sql ==========
-- Ответы API, вызванные из чата (GPT формирует запрос → мы вызываем API → пишем сюда)
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
-- Навыки/возможности чата Грузика — отдельная таблица (без RAG)
create table if not exists chat_capabilities (
  id bigserial primary key,
  slug text not null unique,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_capabilities_slug_idx on chat_capabilities(slug);

-- Начальное наполнение: что умеет Грузик и примеры запросов
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

-- ========== 009_cache_perevozki_invoices.sql ==========
-- Кэш перевозок и счетов: один снимок «за все время» от сервисного аккаунта 1С.
-- Обновляется кроном раз в 15 мин. Мини-апп читает из кэша по INN из account_companies.

create table if not exists cache_perevozki (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

create table if not exists cache_invoices (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

-- Первая вставка для последующего upsert
insert into cache_perevozki (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

insert into cache_invoices (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

-- ========== 010_cache_acts.sql ==========
-- Кэш УПД: один снимок «за все время» от сервисного аккаунта 1С.
-- Обновляется кроном раз в 15 мин. Мини-апп читает из кэша по INN из account_companies.

create table if not exists cache_acts (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

-- Первая вставка для последующего upsert
insert into cache_acts (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

-- ========== 011_registered_users_admin.sql ==========
-- Пользователи, зарегистрированные через админку (служебный режим)
-- Логин = email, пароль хэшируется. Вход в мини-апп по этим данным.

create table if not exists registered_users (
  id serial primary key,
  login text not null unique,
  password_hash text not null,
  inn text not null,
  company_name text not null default '',
  permissions jsonb not null default '{"cargo":true,"doc_invoices":true,"doc_acts":true,"doc_orders":false,"doc_claims":false,"doc_contracts":false,"doc_acts_settlement":false,"doc_tariffs":false,"chat":true}',
  financial_access boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists registered_users_login_idx on registered_users(login);
create index if not exists registered_users_inn_idx on registered_users(inn);
create index if not exists registered_users_active_idx on registered_users(active) where active = true;

-- Настройки почты для отправки паролей и уведомлений (один набор на всю систему)
create table if not exists admin_email_settings (
  id int primary key default 1 check (id = 1),
  smtp_host text,
  smtp_port int,
  smtp_user text,
  smtp_password_encrypted text,
  from_email text,
  from_name text default 'HAULZ',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into admin_email_settings (id) values (1) on conflict (id) do nothing;

-- ========== 012_registered_users_access_all_inns.sql ==========
-- Доступ ко всем заказчикам (всем ИНН) для зарегистрированных пользователей
alter table registered_users add column if not exists access_all_inns boolean not null default false;

-- ========== 013_cache_customers.sql ==========
-- Кэш заказчиков из Getcustomers (ИНН, Заказчик, email). Обновляется кроном каждые 15 мин.

create table if not exists cache_customers (
  inn text not null primary key,
  customer_name text not null default '',
  email text default '',
  fetched_at timestamptz not null default now()
);

create index if not exists cache_customers_customer_name_idx on cache_customers(customer_name);
create index if not exists cache_customers_email_idx on cache_customers(email);

-- ========== 014_admin_auth_config.sql ==========
create table if not exists admin_auth_config (
  id int primary key default 1 check (id = 1),
  api_v1 boolean not null default true,
  api_v2 boolean not null default true,
  cms boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into admin_auth_config (id) values (1) on conflict (id) do nothing;

-- ========== 015_registered_users_last_login.sql ==========
-- Время последнего входа для топа активных пользователей в админке
alter table registered_users add column if not exists last_login_at timestamptz;
create index if not exists registered_users_last_login_at_idx on registered_users(last_login_at desc nulls last);

-- ========== 016_email_templates.sql ==========
-- Шаблоны писем при регистрации и сбросе пароля (подстановка: [login], [password], [company_name])
alter table admin_email_settings
  add column if not exists email_template_registration text,
  add column if not exists email_template_password_reset text;

-- ========== 017_admin_audit_log.sql ==========
-- Журнал действий админа (изменения прав, регистрация, сброс пароля)
create table if not exists admin_audit_log (
  id serial primary key,
  action varchar(64) not null,
  target_type varchar(32) not null,
  target_id varchar(64),
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_at_idx on admin_audit_log(created_at desc);

-- ========== 018_admin_role_presets.sql ==========
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

-- ========== 019_registered_users_invited_by.sql ==========
-- Кто пригласил сотрудника (для раздела «Сотрудники» в профиле)
alter table registered_users add column if not exists invited_by_user_id int references registered_users(id) on delete set null;
alter table registered_users add column if not exists invited_with_preset_label text;
create index if not exists registered_users_invited_by_idx on registered_users(invited_by_user_id) where invited_by_user_id is not null;

-- ========== 020_inn_access_requests.sql ==========
-- Запросы доступа к компании по ИНН: код подтверждения отправляется на email из справочника заказчиков
create table if not exists inn_access_requests (
  id serial primary key,
  inn text not null,
  requester_login text not null,
  code_6 text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists inn_access_requests_inn_login_idx on inn_access_requests(inn, requester_login);
create index if not exists inn_access_requests_expires_idx on inn_access_requests(expires_at);

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
-- payment_weekdays — массив номеров дней недели (0=вс, 1=пн, ..., 6=сб). Пустой = не задано, оплата по первому рабочему дню.
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
-- days_of_week: массив 1=пн, 2=вт, ..., 7=вс (ISO 8601).
-- work_start, work_end: время начала и окончания рабочего дня.
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
-- Привязка Telegram-чата к аккаунту HAULZ для уведомлений и статуса активации.
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

comment on table telegram_chat_links is 'Связка Telegram chat/user с login в HAULZ и состоянием активации';

-- ========== 026_notification_preferences_events.sql ==========
-- Expand notification events: bill_created + daily_summary

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'notification_preferences'
  ) then
    alter table notification_preferences
      drop constraint if exists notification_preferences_event_id_check;

    alter table notification_preferences
      add constraint notification_preferences_event_id_check
      check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_created', 'bill_paid', 'daily_summary'));
  end if;
end $$;

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
-- Табель сотрудников: хранение помесячных значений по дням.
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

-- ========== 030_cache_orders.sql ==========
-- Кэш заявок (источник: GetPerevozki), отдельный снимок для раздела "Заявки".
-- Обновляется кроном раз в 15 минут.

create table if not exists cache_orders (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

insert into cache_orders (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

-- ========== 031_cache_sendings.sql ==========
-- Кэш отправок (источник: GETAPI?metod=Getotpravki).
-- Обновляется кроном раз в 15 минут.

create table if not exists cache_sendings (
  id int primary key default 1 check (id = 1),
  data jsonb not null default '[]',
  fetched_at timestamptz not null default now()
);

insert into cache_sendings (id, data, fetched_at) values (1, '[]', '1970-01-01')
on conflict (id) do nothing;

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

comment on table sendings_eor is 'EOR-статусы для строк отправок пользователя';
comment on column sendings_eor.row_key is 'Ключ строки отправки из UI';
comment on column sendings_eor.statuses is 'entry_allowed, full_inspection, turnaround';


-- ========== 033_cache_suppliers.sql ==========
-- Кэш поставщиков из GETAPI?metod=GETALLKontragents (ИНН, наименование, email).
-- Обновляется кроном каждые 15 минут через /api/cron/refresh-suppliers-cache.

create table if not exists cache_suppliers (
  inn text not null primary key,
  supplier_name text not null default '',
  email text default '',
  fetched_at timestamptz not null default now()
);

create index if not exists cache_suppliers_supplier_name_idx on cache_suppliers(supplier_name);
create index if not exists cache_suppliers_email_idx on cache_suppliers(email);

-- ========== 034_expense_requests.sql ==========
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
  ('mainline',    'Магистраль',              8),
  ('pickup_logistics', 'Заборная логистика', 9),
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

-- ========== 035_pnl.sql ==========
-- ========== 035_pnl.sql ==========
-- P&L и Unit Economics: таблицы для финансовой аналитики.

-- Операции (транзакции)
create table if not exists pnl_operations (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  counterparty text not null,
  purpose text not null,
  amount double precision not null,
  operation_type text not null,
  department text not null,
  logistics_stage text,
  direction text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pnl_operations_date_idx on pnl_operations(date);
create index if not exists pnl_operations_operation_type_idx on pnl_operations(operation_type);
create index if not exists pnl_operations_department_idx on pnl_operations(department);
create index if not exists pnl_operations_direction_idx on pnl_operations(direction);

-- Продажи
create table if not exists pnl_sales (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  client text not null,
  direction text not null,
  transport_type text,
  weight_kg double precision not null default 0,
  volume double precision,
  paid_weight_kg double precision,
  revenue double precision not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_sales_date_idx on pnl_sales(date);
create index if not exists pnl_sales_direction_idx on pnl_sales(direction);

-- Платежи по кредитам и лизингу
create table if not exists pnl_credit_payments (
  id text primary key default gen_random_uuid()::text,
  date timestamptz not null,
  counterparty text not null,
  purpose text,
  amount double precision not null,
  type text not null,
  created_at timestamptz not null default now()
);

create index if not exists pnl_credit_payments_date_idx on pnl_credit_payments(date);
create index if not exists pnl_credit_payments_type_idx on pnl_credit_payments(type);

-- Справочник доходов
create table if not exists pnl_income_categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  direction text not null default 'MSK_TO_KGD',
  transport_type text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Справочник расходов (PNL)
create table if not exists pnl_expense_categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  department text not null,
  type text not null default 'OPEX',
  logistics_stage text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_expense_categories_department_idx on pnl_expense_categories(department);

-- Подразделения
create table if not exists pnl_subdivisions (
  id text primary key default gen_random_uuid()::text,
  code text unique,
  name text not null,
  department text not null,
  logistics_stage text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pnl_subdivisions_department_idx on pnl_subdivisions(department);

-- Ручной ввод дохода за период
create table if not exists pnl_manual_revenues (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  category_id text not null references pnl_income_categories(id) on delete cascade,
  amount double precision not null,
  direction text not null default '',
  transport_type text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists pnl_manual_revenues_uniq
  on pnl_manual_revenues(period, category_id, direction, transport_type);
create index if not exists pnl_manual_revenues_period_idx on pnl_manual_revenues(period);

-- Ручной ввод расхода за период
create table if not exists pnl_manual_expenses (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  category_id text not null references pnl_expense_categories(id) on delete cascade,
  amount double precision not null,
  comment text,
  direction text not null default '',
  transport_type text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists pnl_manual_expenses_uniq
  on pnl_manual_expenses(period, category_id, direction, transport_type);
create index if not exists pnl_manual_expenses_period_idx on pnl_manual_expenses(period);

-- Свод расходов из выписки
create table if not exists pnl_statement_expenses (
  id text primary key default gen_random_uuid()::text,
  period timestamptz not null,
  counterparty text not null,
  total_amount double precision not null,
  operations_count int not null default 0,
  accounted boolean not null default false,
  category_id text references pnl_expense_categories(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pnl_statement_expenses_uniq
  on pnl_statement_expenses(period, counterparty);
create index if not exists pnl_statement_expenses_period_idx on pnl_statement_expenses(period);
create index if not exists pnl_statement_expenses_accounted_idx on pnl_statement_expenses(accounted);

-- Правила классификации по контрагенту
create table if not exists pnl_classification_rules (
  id text primary key default gen_random_uuid()::text,
  counterparty text not null unique,
  purpose_pattern text,
  operation_type text not null,
  department text not null,
  logistics_stage text,
  direction text,
  created_at timestamptz not null default now()
);

-- ========== 036_pnl_transport_type.sql ==========
-- ========== 036_pnl_transport_type.sql ==========
-- Добавляем transport_type в pnl_operations и pnl_classification_rules.
alter table pnl_operations add column if not exists transport_type text;
create index if not exists pnl_operations_transport_type_idx on pnl_operations(transport_type);

alter table pnl_classification_rules add column if not exists transport_type text;

-- ========== 037_unify_expense_categories.sql ==========
-- ========== 037_unify_expense_categories.sql ==========
-- Унификация справочника расходов: expense_categories — единый источник для заявок и PNL.
-- Добавляем cost_type (COGS/OPEX/CAPEX) и связь pnl_expense_categories с expense_categories.

-- Обновляем cost_type в expense_categories для существующих статей
update expense_categories set cost_type = 'COGS' where id in ('fuel', 'repair', 'spare_parts', 'mainline', 'pickup_logistics');
update expense_categories set cost_type = 'OPEX' where id in ('salary', 'office', 'rent', 'insurance', 'other');

-- Добавляем expense_category_id в pnl_expense_categories
alter table pnl_expense_categories add column if not exists expense_category_id text references expense_categories(id);

-- Сопоставление по имени для существующих записей
update pnl_expense_categories c set expense_category_id = e.id
from expense_categories e
where c.expense_category_id is null and trim(lower(c.name)) = trim(lower(e.name));

-- Подразделения (department, logistics_stage) для PNL
-- pickup_msk, warehouse_msk, mainline, warehouse_kgd, lastmile_kgd, administration, direction
insert into pnl_expense_categories (id, name, department, type, logistics_stage, expense_category_id, sort_order)
select
  gen_random_uuid()::text,
  e.name,
  s.department,
  coalesce(e.cost_type, 'OPEX'),
  s.logistics_stage,
  e.id,
  (e.sort_order * 10) + s.ord
from expense_categories e
cross join (
  values
    ('LOGISTICS_MSK', 'PICKUP', 1),
    ('LOGISTICS_MSK', 'DEPARTURE_WAREHOUSE', 2),
    ('LOGISTICS_MSK', 'MAINLINE', 3),
    ('LOGISTICS_KGD', 'ARRIVAL_WAREHOUSE', 4),
    ('LOGISTICS_KGD', 'LAST_MILE', 5),
    ('ADMINISTRATION', null, 6),
    ('DIRECTION', null, 7)
) as s(department, logistics_stage, ord)
where not exists (
  select 1 from pnl_expense_categories p
  where p.expense_category_id = e.id and p.department = s.department
    and (p.logistics_stage is null and s.logistics_stage is null or p.logistics_stage = s.logistics_stage)
);

create index if not exists pnl_expense_categories_expense_category_id_idx on pnl_expense_categories(expense_category_id);

-- ========== 038_sync_expense_categories_to_pnl.sql ==========
-- ========== 038_sync_expense_categories_to_pnl.sql ==========
-- Синхронизация текущих статей из expense_categories в pnl_expense_categories.
-- Гарантирует, что все статьи из заявок на расходы есть в Справочнике расходов (P&L).

-- Дополняем pnl_expense_categories статьями из expense_categories, которых ещё нет
insert into pnl_expense_categories (id, name, department, type, logistics_stage, expense_category_id, sort_order)
select
  gen_random_uuid()::text,
  e.name,
  s.department,
  coalesce(e.cost_type, 'OPEX'),
  s.logistics_stage,
  e.id,
  (e.sort_order * 10) + s.ord
from expense_categories e
cross join (
  values
    ('LOGISTICS_MSK', 'PICKUP', 1),
    ('LOGISTICS_MSK', 'DEPARTURE_WAREHOUSE', 2),
    ('LOGISTICS_MSK', 'MAINLINE', 3),
    ('LOGISTICS_KGD', 'ARRIVAL_WAREHOUSE', 4),
    ('LOGISTICS_KGD', 'LAST_MILE', 5),
    ('ADMINISTRATION', null, 6),
    ('DIRECTION', null, 7)
) as s(department, logistics_stage, ord)
where e.active = true
  and not exists (
    select 1 from pnl_expense_categories p
    where p.expense_category_id = e.id
      and p.department = s.department
      and (p.logistics_stage is null and s.logistics_stage is null or p.logistics_stage = s.logistics_stage)
  );

-- ========== 039_add_ferry_auto_categories.sql ==========
-- ========== 039_add_ferry_auto_categories.sql ==========
-- Добавляем статьи: Паром, Авто.

insert into expense_categories (id, name, cost_type, sort_order) values
  ('ferry', 'Паром', 'COGS', 10),
  ('auto', 'Авто', 'COGS', 11)
on conflict (id) do nothing;

-- Синхронизация в pnl_expense_categories
insert into pnl_expense_categories (id, name, department, type, logistics_stage, expense_category_id, sort_order)
select
  gen_random_uuid()::text,
  e.name,
  s.department,
  coalesce(e.cost_type, 'OPEX'),
  s.logistics_stage,
  e.id,
  (e.sort_order * 10) + s.ord
from expense_categories e
cross join (
  values
    ('LOGISTICS_MSK', 'PICKUP', 1),
    ('LOGISTICS_MSK', 'DEPARTURE_WAREHOUSE', 2),
    ('LOGISTICS_MSK', 'MAINLINE', 3),
    ('LOGISTICS_KGD', 'ARRIVAL_WAREHOUSE', 4),
    ('LOGISTICS_KGD', 'LAST_MILE', 5),
    ('ADMINISTRATION', null, 6),
    ('DIRECTION', null, 7)
) as s(department, logistics_stage, ord)
where e.id in ('ferry', 'auto')
  and not exists (
    select 1 from pnl_expense_categories p
    where p.expense_category_id = e.id
      and p.department = s.department
      and (p.logistics_stage is null and s.logistics_stage is null or p.logistics_stage = s.logistics_stage)
  );

-- ========== 040_expense_requests_supplier.sql ==========
-- ========== 040_expense_requests_supplier.sql ==========
-- Добавляем поля поставщика и расширяем хранение данных заявки для аналитики.

alter table expense_requests add column if not exists supplier_name text;
alter table expense_requests add column if not exists supplier_inn text;

-- ========== 041_expense_requests_schema_ref.sql ==========
-- ========== 041_expense_requests_schema_ref.sql ==========
-- Справочная схема заявок на расходы.
-- Все данные хранятся в БД, localStorage не используется.
-- employee_name — ФИО сотрудника из справочника подразделения.

-- Основная таблица заявок
create table if not exists expense_requests (
  id bigserial primary key,
  uid text not null unique,
  login text not null,
  department text not null,
  doc_number text not null default '',
  doc_date date,
  period text not null default '',
  category_id text not null references expense_categories(id),
  amount numeric(14, 2) not null check (amount > 0),
  vat_rate text not null default '',
  employee_name text not null default '',  -- ФИО сотрудника
  comment text not null default '',
  vehicle_text text,
  supplier_name text,
  supplier_inn text,
  status text not null default 'draft' check (status in ('draft', 'pending_approval', 'sent', 'approved', 'rejected', 'paid')),
  approved_by text,
  approved_at timestamptz,
  rejection_reason text,
  webhook_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Добавить колонки, если их нет (идемпотентно)
alter table expense_requests add column if not exists employee_name text not null default '';
alter table expense_requests add column if not exists supplier_name text;
alter table expense_requests add column if not exists supplier_inn text;
alter table expense_requests add column if not exists updated_at timestamptz;

comment on column expense_requests.employee_name is 'ФИО сотрудника из справочника подразделения';

-- ========== 042_cache_tariffs.sql ==========
-- Кэш тарифов из GETAPI?metod=GETTarifs. Обновляется кроном /api/cron/refresh-tariffs-cache.
create table if not exists cache_tariffs (
  id serial primary key,
  code text,
  name text not null default '',
  value numeric(18, 4),
  unit text,
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_tariffs_code_idx on cache_tariffs(code);
create index if not exists cache_tariffs_name_idx on cache_tariffs(name);
create index if not exists cache_tariffs_fetched_at_idx on cache_tariffs(fetched_at desc);

-- ========== 043_cache_tariffs_documents.sql ==========
-- Расширение кэша тарифов под структуру документов GETTarifs.
alter table cache_tariffs add column if not exists doc_date timestamptz;
alter table cache_tariffs add column if not exists doc_number text not null default '';
alter table cache_tariffs add column if not exists customer_name text not null default '';
alter table cache_tariffs add column if not exists customer_inn text not null default '';
alter table cache_tariffs add column if not exists city_from text not null default '';
alter table cache_tariffs add column if not exists city_to text not null default '';
alter table cache_tariffs add column if not exists transport_type text not null default '';
alter table cache_tariffs add column if not exists is_dangerous boolean not null default false;
alter table cache_tariffs add column if not exists is_vet boolean not null default false;
alter table cache_tariffs add column if not exists tariff numeric(18, 4);

create index if not exists cache_tariffs_customer_inn_idx on cache_tariffs(customer_inn);
create index if not exists cache_tariffs_doc_date_idx on cache_tariffs(doc_date desc);
create index if not exists cache_tariffs_doc_number_idx on cache_tariffs(doc_number);

-- ========== 044_cache_sverki.sql ==========
-- Кэш актов сверок из GETAPI?metod=GETsverki. Обновляется кроном /api/cron/refresh-sverki-cache.
create table if not exists cache_sverki (
  id serial primary key,
  doc_number text not null default '',
  doc_date timestamptz,
  period_from timestamptz,
  period_to timestamptz,
  customer_name text not null default '',
  customer_inn text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_sverki_customer_inn_idx on cache_sverki(customer_inn);
create index if not exists cache_sverki_doc_date_idx on cache_sverki(doc_date desc);
create index if not exists cache_sverki_doc_number_idx on cache_sverki(doc_number);
create index if not exists cache_sverki_fetched_at_idx on cache_sverki(fetched_at desc);

-- ========== 045_sverki_requests.sql ==========
-- Заявки на формирование акта сверки от клиентов.
create table if not exists sverki_requests (
  id serial primary key,
  login text not null default '',
  customer_inn text not null default '',
  contract text not null default '',
  period_from date not null,
  period_to date not null,
  status text not null default 'pending'
    check (status in ('pending', 'edo_sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz,
  processed_by text
);

create index if not exists sverki_requests_customer_inn_idx on sverki_requests(customer_inn);
create index if not exists sverki_requests_status_idx on sverki_requests(status);
create index if not exists sverki_requests_created_at_idx on sverki_requests(created_at desc);

-- ========== 046_cache_dogovors.sql ==========
-- Кэш договоров из GETAPI?metod=GETdogovors. Обновляется кроном /api/cron/refresh-dogovors-cache.
create table if not exists cache_dogovors (
  id serial primary key,
  doc_number text not null default '',
  doc_date timestamptz,
  customer_name text not null default '',
  customer_inn text not null default '',
  title text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_dogovors_customer_inn_idx on cache_dogovors(customer_inn);
create index if not exists cache_dogovors_doc_date_idx on cache_dogovors(doc_date desc);
create index if not exists cache_dogovors_doc_number_idx on cache_dogovors(doc_number);
create index if not exists cache_dogovors_fetched_at_idx on cache_dogovors(fetched_at desc);

-- ========== 047_claims.sql ==========
-- Раздел "Претензии": заявки, статусы, комментарии, вложения (фото/PDF в БД), ссылки на видео, очередь push.

-- 1) Счетчик номеров претензий по годам (для формата CLM-2026-000123)
create table if not exists claims_counters (
  year int primary key,
  last_number int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function next_claim_number(p_created_at timestamptz default now())
returns text
language plpgsql
as $$
declare
  y int;
  n int;
begin
  y := extract(year from p_created_at)::int;

  insert into claims_counters(year, last_number, updated_at)
  values (y, 1, now())
  on conflict (year) do update
    set last_number = claims_counters.last_number + 1,
        updated_at = now()
  returning last_number into n;

  return format('CLM-%s-%s', y, lpad(n::text, 6, '0'));
end;
$$;

-- 2) Основная таблица претензий
create table if not exists claims (
  id bigserial primary key,
  claim_number text not null unique,              -- CLM-YYYY-000001
  customer_login text not null default '',
  customer_company_name text not null default '',
  customer_inn text not null default '',
  customer_phone text not null default '',
  customer_email text not null default '',

  cargo_number text not null default '',          -- номер перевозки (по ТЗ)
  claim_type text not null default 'other' check (claim_type in (
    'cargo_damage',           -- Порча груза
    'quantity_mismatch',      -- Несоответствие по количеству
    'cargo_loss',             -- Утрата
    'other'                   -- Другое
  )),

  description text not null default '',
  requested_amount numeric(14,2),                 -- сумма требований клиента
  approved_amount numeric(14,2),                  -- сумма, признанная к компенсации

  status text not null default 'new' check (status in (
    'draft',
    'new',
    'under_review',
    'waiting_docs',
    'in_progress',
    'awaiting_leader',
    'sent_to_accounting',
    'approved',
    'rejected',
    'paid',
    'offset',
    'closed'
  )),
  status_changed_at timestamptz not null default now(),
  sla_due_at timestamptz not null default (now() + interval '10 days'), -- календарные 10 дней

  manager_login text not null default '',
  expert_login text not null default '',
  leader_login text not null default '',
  accountant_login text not null default '',

  manager_note text not null default '',
  leader_comment text not null default '',
  accounting_note text not null default '',
  customer_resolution text not null default 'pending' check (customer_resolution in ('pending', 'agree', 'disagree')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists claims_customer_login_idx on claims(customer_login);
create index if not exists claims_customer_inn_idx on claims(customer_inn);
create index if not exists claims_cargo_number_idx on claims(cargo_number);
create index if not exists claims_status_idx on claims(status);
create index if not exists claims_sla_due_at_idx on claims(sla_due_at);
create index if not exists claims_created_at_idx on claims(created_at desc);

-- Автогенерация claim_number
create or replace function claims_set_number_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.claim_number is null or btrim(new.claim_number) = '' then
    new.claim_number := next_claim_number(coalesce(new.created_at, now()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_claims_set_number_before_insert on claims;
create trigger trg_claims_set_number_before_insert
before insert on claims
for each row
execute function claims_set_number_before_insert();

-- Обновление updated_at
create or replace function claims_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_claims_set_updated_at on claims;
create trigger trg_claims_set_updated_at
before update on claims
for each row
execute function claims_set_updated_at();

-- 3) Фото (храним байты в БД), до 10 на претензию, до 5MB каждое
create table if not exists claim_photos (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  file_name text not null default '',
  mime_type text not null default '',
  caption text not null default '',
  file_bytes bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(file_bytes) <= 5242880)
);

create index if not exists claim_photos_claim_id_idx on claim_photos(claim_id);

-- 4) PDF-документы (ТТН, акт и т.д.), до 5MB
create table if not exists claim_documents (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  file_name text not null default '',
  mime_type text not null default 'application/pdf',
  doc_type text not null default 'other' check (doc_type in ('ttn', 'act', 'other')),
  file_bytes bytea not null,
  created_at timestamptz not null default now(),
  check (octet_length(file_bytes) <= 5242880)
);

create index if not exists claim_documents_claim_id_idx on claim_documents(claim_id);

-- 5) Видео (только ссылки)
create table if not exists claim_video_links (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  url text not null,
  title text not null default '',
  created_at timestamptz not null default now(),
  check (url ~* '^https?://')
);

create index if not exists claim_video_links_claim_id_idx on claim_video_links(claim_id);

-- 6) Комментарии внутри претензии
create table if not exists claim_comments (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  author_login text not null default '',
  author_role text not null default 'client' check (author_role in ('client', 'manager', 'leader', 'accountant', 'system')),
  comment_text text not null default '',
  is_internal boolean not null default false, -- служебный комментарий (скрыт от клиента)
  created_at timestamptz not null default now()
);

create index if not exists claim_comments_claim_id_idx on claim_comments(claim_id);
create index if not exists claim_comments_created_at_idx on claim_comments(created_at);

-- 7) История изменений (activity feed)
create table if not exists claim_events (
  id bigserial primary key,
  claim_id bigint not null references claims(id) on delete cascade,
  actor_login text not null default '',
  actor_role text not null default 'system',
  event_type text not null default '',         -- e.g. status_changed, comment_added, files_uploaded
  from_status text,
  to_status text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists claim_events_claim_id_idx on claim_events(claim_id);
create index if not exists claim_events_created_at_idx on claim_events(created_at);

-- 8) Очередь push-уведомлений
create table if not exists claim_push_queue (
  id bigserial primary key,
  claim_id bigint references claims(id) on delete cascade,
  recipient_login text not null default '',
  title text not null default '',
  body text not null default '',
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  error_text text,
  created_at timestamptz not null default now()
);

create index if not exists claim_push_queue_status_idx on claim_push_queue(status, scheduled_at);
create index if not exists claim_push_queue_recipient_idx on claim_push_queue(recipient_login);

-- ========== 048_notification_preferences_state.sql ==========
-- Atomic notification preferences per user (single JSON row).
-- This table is used as the primary source of truth for notification settings.

create table if not exists notification_preferences_state (
  login text primary key,
  preferences jsonb not null default '{"telegram":{},"webpush":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists notification_preferences_state_updated_idx
  on notification_preferences_state(updated_at desc);

-- ========== 048_sendings_metrics.sql ==========
-- Агрегированные метрики по отправкам для стабильного расчёта времени в пути.
create table if not exists sendings_metrics (
  customer_inn text not null,
  sending_number text not null,
  cargo_numbers jsonb not null default '[]'::jsonb,
  send_start_at timestamptz,
  first_ready_at timestamptz,
  in_transit_hours numeric(12, 2),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_inn, sending_number)
);

create index if not exists sendings_metrics_customer_inn_idx
  on sendings_metrics(customer_inn);

create index if not exists sendings_metrics_first_ready_at_idx
  on sendings_metrics(first_ready_at desc);

create index if not exists sendings_metrics_last_seen_at_idx
  on sendings_metrics(last_seen_at desc);

-- ========== 049_ferries.sql ==========
-- Справочник паромов. Наименование, MMSI, доп. данные из Marinesia (IMO, тип судна, вместимость, оператор).

create table if not exists ferries (
  id bigserial primary key,
  name text not null,
  mmsi text not null,
  imo text,
  vessel_type text,
  teu_capacity int,
  trailer_capacity int,
  operator text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mmsi)
);

create index if not exists ferries_name_idx on ferries(name);
create index if not exists ferries_mmsi_idx on ferries(mmsi);

-- Начальное наполнение
insert into ferries (name, mmsi) values
  ('Marshal Rokossovsky', '273214860'),
  ('General Chernyakhovsky', '273298390'),
  ('Baltiysk', '273317640'),
  ('Ambal', '273355410'),
  ('Novik Maria', '273257140'),
  ('Sparta II', '273394890'),
  ('Ursa Major', '273396130'),
  ('Sparta IV', '273413440'),
  ('Antey', '273549720'),
  ('Sparta', '273351920'),
  ('Maria', '273359830'),
  ('Pizhma', '273453210'),
  ('Lady D', '305973000'),
  ('Baltic Leader', '273549530'),
  ('Yaz', '273418650'),
  ('Kapitan Mironov', '273427610'),
  ('Kapitan Shevchenko', '273438720')
on conflict (mmsi) do update set
  name = excluded.name,
  updated_at = now();

-- ========== 050_sendings_ferry.sql ==========
-- Паром и ETA для строк отправок (раздел Документы -> Отправки, только паромные).
create table if not exists sendings_ferry (
  id bigserial primary key,
  login text not null,
  inn text,
  row_key text not null,
  ferry_id bigint not null references ferries(id) on delete cascade,
  eta text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists sendings_ferry_login_row_key_uidx
  on sendings_ferry (lower(trim(login)), row_key);

create index if not exists sendings_ferry_login_idx
  on sendings_ferry (lower(trim(login)));

comment on table sendings_ferry is 'Привязка парома и ETA к строкам паромных отправок';
comment on column sendings_ferry.eta is 'ETA судна из Marinesia (ISO datetime или текст)';

-- ========== 051_cache_pvz.sql ==========
-- Кэш ПВЗ из GETAPI?metod=GETPVZ. Обновляется кроном /api/cron/refresh-pvz-cache.
create table if not exists cache_pvz (
  id serial primary key,
  ssylka text not null default '',
  naimenovanie text not null default '',
  kod_dlya_pechati text not null default '',
  gorod text not null default '',
  region text not null default '',
  vladelec_inn text not null default '',
  vladelec_naimenovanie text not null default '',
  otpravitel_poluchatel text not null default '',
  kontaktnoe_litso text not null default '',
  data jsonb,
  sort_order int not null default 0,
  fetched_at timestamptz not null default now()
);

create index if not exists cache_pvz_gorod_idx on cache_pvz(gorod);
create index if not exists cache_pvz_vladelec_inn_idx on cache_pvz(vladelec_inn);
create index if not exists cache_pvz_fetched_at_idx on cache_pvz(fetched_at desc);

-- ========== 052_pending_order_requests.sql ==========
-- Заявки, созданные через «Новая заявка», ожидающие синхронизации с 1С.
create table if not exists pending_order_requests (
  id serial primary key,
  login text not null,
  inn text,
  punkt_otpravki text not null,
  punkt_naznacheniya text not null,
  nomer_zayavki text not null,
  data_zabora date not null,
  table_rows jsonb default '[]',
  created_at timestamptz not null default now()
);

create index if not exists pending_order_requests_login_idx on pending_order_requests(login);
create index if not exists pending_order_requests_created_at_idx on pending_order_requests(created_at desc);

-- ========== 053_add_expense_articles_telephony_bank_cafe_post_site.sql ==========
-- ========== 053_add_expense_articles_telephony_bank_cafe_post_site.sql ==========
-- Добавляем статьи расходов: Телефония, Банк, Кафе, Почта и сайт.

insert into expense_categories (id, name, cost_type, sort_order) values
  ('telephony', 'Телефония', 'OPEX', 12),
  ('bank', 'Банк', 'OPEX', 13),
  ('cafe', 'Кафе', 'OPEX', 14),
  ('post_site', 'Почта и сайт', 'OPEX', 15)
on conflict (id) do update
set
  name = excluded.name,
  cost_type = excluded.cost_type,
  sort_order = excluded.sort_order,
  active = true;

-- Синхронизация новых статей в pnl_expense_categories по всем подразделениям/этапам.
insert into pnl_expense_categories (id, name, department, type, logistics_stage, expense_category_id, sort_order)
select
  gen_random_uuid()::text,
  e.name,
  s.department,
  coalesce(e.cost_type, 'OPEX'),
  s.logistics_stage,
  e.id,
  (e.sort_order * 10) + s.ord
from expense_categories e
cross join (
  values
    ('LOGISTICS_MSK', 'PICKUP', 1),
    ('LOGISTICS_MSK', 'DEPARTURE_WAREHOUSE', 2),
    ('LOGISTICS_MSK', 'MAINLINE', 3),
    ('LOGISTICS_KGD', 'ARRIVAL_WAREHOUSE', 4),
    ('LOGISTICS_KGD', 'LAST_MILE', 5),
    ('ADMINISTRATION', null, 6),
    ('DIRECTION', null, 7)
) as s(department, logistics_stage, ord)
where e.id in ('telephony', 'bank', 'cafe', 'post_site')
  and not exists (
    select 1 from pnl_expense_categories p
    where p.expense_category_id = e.id
      and p.department = s.department
      and (
        (p.logistics_stage is null and s.logistics_stage is null)
        or p.logistics_stage = s.logistics_stage
      )
  );

-- ========== 054_expense_requests_transport_type.sql ==========
-- ========== 054_expense_requests_transport_type.sql ==========
alter table expense_requests
  add column if not exists transport_type text not null default 'auto';

update expense_requests
set transport_type = case
  when lower(trim(category_id)) = 'ferry' then 'ferry'
  else 'auto'
end
where transport_type is null
   or lower(trim(transport_type)) not in ('auto', 'ferry');


-- ========== 055_wildberries.sql ==========
-- WB module: inbound/returned/claims imports + summary

create table if not exists wb_inbound_import_batches (
  id bigserial primary key,
  block_type text not null check (block_type in ('inbound', 'returned', 'claims')),
  mode text not null check (mode in ('append', 'upsert')),
  source_filename text,
  uploaded_by_login text,
  uploaded_at timestamptz not null default now(),
  total_rows int not null default 0,
  inserted_rows int not null default 0,
  updated_rows int not null default 0,
  skipped_rows int not null default 0,
  error_rows int not null default 0,
  status text not null default 'completed' check (status in ('completed', 'failed', 'partial')),
  details jsonb not null default '{}'::jsonb
);

create index if not exists wb_inbound_import_batches_block_type_idx
  on wb_inbound_import_batches(block_type, uploaded_at desc);

create table if not exists wb_import_row_errors (
  id bigserial primary key,
  batch_id bigint not null references wb_inbound_import_batches(id) on delete cascade,
  row_number int,
  error_message text not null,
  row_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wb_import_row_errors_batch_id_idx
  on wb_import_row_errors(batch_id);

create table if not exists wb_inbound_items (
  id bigserial primary key,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  inventory_number text not null,
  inventory_created_at date,
  row_number int,
  box_number text not null,
  shk text not null,
  sticker text,
  barcode text,
  phone text,
  receiver_full_name text,
  article text,
  brand text,
  nomenclature text,
  size text,
  description text,
  kit text,
  price_rub numeric(14,2),
  tnv_ed text,
  mass_kg numeric(14,3),
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (inventory_number, box_number, shk)
);

create index if not exists wb_inbound_items_inventory_idx
  on wb_inbound_items(inventory_number, inventory_created_at);
create index if not exists wb_inbound_items_box_idx
  on wb_inbound_items(box_number);
create index if not exists wb_inbound_items_article_idx
  on wb_inbound_items(article);
create index if not exists wb_inbound_items_brand_idx
  on wb_inbound_items(brand);
create index if not exists wb_inbound_items_created_at_idx
  on wb_inbound_items(created_at desc);

create table if not exists wb_returned_items (
  id bigserial primary key,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  source text not null default 'import' check (source in ('import', 'manual')),
  box_id text not null,
  cargo_number text,
  description text,
  has_shk boolean not null default true,
  document_number text,
  document_date date,
  amount_rub numeric(14,2),
  source_row_number int,
  raw_row jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wb_returned_items_box_idx
  on wb_returned_items(box_id);
create index if not exists wb_returned_items_document_idx
  on wb_returned_items(document_number, document_date);
create index if not exists wb_returned_items_created_at_idx
  on wb_returned_items(created_at desc);

create table if not exists wb_claims_revisions (
  id bigserial primary key,
  revision_number int not null,
  source_filename text,
  uploaded_by_login text,
  uploaded_at timestamptz not null default now(),
  is_active boolean not null default false,
  batch_id bigint references wb_inbound_import_batches(id) on delete set null,
  notes text
);

create unique index if not exists wb_claims_revisions_revision_number_uidx
  on wb_claims_revisions(revision_number);
create unique index if not exists wb_claims_revisions_active_uidx
  on wb_claims_revisions(is_active) where is_active = true;

create table if not exists wb_claims_items (
  id bigserial primary key,
  revision_id bigint not null references wb_claims_revisions(id) on delete cascade,
  row_number int,
  claim_number text,
  box_id text,
  doc_number text,
  doc_date date,
  description text,
  amount_rub numeric(14,2),
  all_columns jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wb_claims_items_revision_idx
  on wb_claims_items(revision_id);
create index if not exists wb_claims_items_box_idx
  on wb_claims_items(box_id);
create index if not exists wb_claims_items_claim_number_idx
  on wb_claims_items(claim_number);
create index if not exists wb_claims_items_doc_date_idx
  on wb_claims_items(doc_date);

create table if not exists wb_summary (
  box_id text primary key,
  claim_number text,
  declared boolean not null default false,
  source_document_number text,
  source_document_date date,
  source_row_number int,
  description text,
  cost_rub numeric(14,2),
  inbound_item_id bigint references wb_inbound_items(id) on delete set null,
  returned_item_id bigint references wb_returned_items(id) on delete set null,
  claim_item_id bigint references wb_claims_items(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists wb_summary_declared_idx
  on wb_summary(declared, updated_at desc);
create index if not exists wb_summary_doc_idx
  on wb_summary(source_document_number, source_document_date);


-- ========== 056_wb_returned_source_row_number.sql ==========
-- Номер строки в исходном Excel при импорте возвратного груза
alter table wb_returned_items
  add column if not exists source_row_number int;

comment on column wb_returned_items.source_row_number is '1-based номер строки в файле импорта (Excel)';

-- ========== 057_wb_summary_shk_and_claim_rows.sql ==========
-- WB: ШК в претензиях и сводной; сводная — по строкам претензии, сопоставление с описью по ШК

alter table wb_claims_items add column if not exists shk text;

alter table wb_summary add column if not exists id bigserial;

alter table wb_summary drop constraint if exists wb_summary_pkey;
alter table wb_summary add primary key (id);

alter table wb_summary alter column box_id drop not null;

alter table wb_summary add column if not exists shk text;
alter table wb_summary add column if not exists is_returned boolean not null default false;

create index if not exists wb_summary_claim_item_id_idx on wb_summary(claim_item_id);
create index if not exists wb_summary_shk_idx on wb_summary(shk);
create index if not exists wb_summary_box_id_idx on wb_summary(box_id);

comment on column wb_claims_items.shk is 'ШК из файла претензий; сопоставление с wb_inbound_items.shk';
comment on column wb_summary.shk is 'ШК (претензия/опись); ключ поиска в описи';
comment on column wb_summary.is_returned is 'Возврат по ШК/коробу (wb_returned_items)';

-- ========== 058_wb_inbound_box_shk.sql ==========
-- ШК короба (единый на номер короба), подставляется текстовым списком короб:ШК

alter table wb_inbound_items add column if not exists box_shk text;

comment on column wb_inbound_items.box_shk is 'ШК короба; сопоставление с номером короба (box_number) по загруженному списку';

-- ========== 059_wb_1c_shk_status.sql ==========
-- Справочник ШК короба → статус 1С и номер перевозки для скачивания АПП (вкладка WB «Описи»).
-- Заполняется вручную (INSERT/импорт) или отдельным процессом.

create table if not exists wb_1c_shk_status (
  id bigserial primary key,
  shk text not null,
  status_1c text not null default '',
  cargo_number text not null default '',
  updated_at timestamptz not null default now()
);

create unique index if not exists wb_1c_shk_status_shk_lower_trim_uq
  on wb_1c_shk_status (lower(trim(shk)));

comment on table wb_1c_shk_status is 'WB: соответствие ШК короба данным 1С (статус, номер перевозки для GetFile АПП)';

-- ========== neon_notification_tasks.sql ==========
-- ============================================================
-- Neon SQL Terminal: задачи для уведомлений (миграции 005 + 006)
-- Выполнить целиком в SQL Editor Neon
-- ============================================================

-- --- 005: прогоны опроса и лог доставок ---

-- Прогон опроса (раз в час)
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

-- Последнее известное состояние перевозки (дифф по заказчику)
create table if not exists cargo_last_state (
  inn text not null,
  cargo_number text not null,
  state text,
  state_bill text,
  updated_at timestamptz not null default now(),
  primary key (inn, cargo_number)
);

create index if not exists cargo_last_state_inn_idx on cargo_last_state(inn);

-- Лог: когда и кому отправили пуш, по какому каналу
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

-- --- 006: БЗ пуша (настройки) ---

create table if not exists notification_preferences (
  login text not null,
  channel text not null check (channel in ('telegram', 'web')),
  event_id text not null check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_paid')),
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (login, channel, event_id)
);

create index if not exists notification_preferences_login_idx on notification_preferences(login);
create index if not exists notification_preferences_enabled_idx on notification_preferences(login, channel) where enabled = true;

comment on table notification_preferences is 'Настройки пуша: кому (login), канал (telegram/web), событие (вкл/выкл)';
