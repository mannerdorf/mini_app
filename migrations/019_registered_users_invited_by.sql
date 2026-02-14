-- Кто пригласил сотрудника (для раздела «Сотрудники» в профиле)
alter table registered_users add column if not exists invited_by_user_id int references registered_users(id) on delete set null;
alter table registered_users add column if not exists invited_with_preset_label text;
create index if not exists registered_users_invited_by_idx on registered_users(invited_by_user_id) where invited_by_user_id is not null;
