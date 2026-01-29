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
