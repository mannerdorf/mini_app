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
  event_id text not null check (event_id in ('accepted', 'in_transit', 'delivered', 'bill_paid')),
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
