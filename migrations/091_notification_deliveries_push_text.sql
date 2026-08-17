-- Текст push для истории в профиле (заголовок + тело).

alter table notification_deliveries
  add column if not exists push_title text,
  add column if not exists push_body text;
