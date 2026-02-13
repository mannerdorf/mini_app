-- Время последнего входа для топа активных пользователей в админке
alter table registered_users add column if not exists last_login_at timestamptz;
create index if not exists registered_users_last_login_at_idx on registered_users(last_login_at desc nulls last);
