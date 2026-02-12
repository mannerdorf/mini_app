-- Доступ ко всем заказчикам (всем ИНН) для зарегистрированных пользователей
alter table registered_users add column if not exists access_all_inns boolean not null default false;
