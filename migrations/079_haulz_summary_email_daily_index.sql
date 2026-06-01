-- Быстрая проверка «не более 1 письма на login за сутки» (Europe/Moscow).
create index if not exists haulz_summary_email_send_login_sent_at_idx
  on haulz_summary_email_send (lower(trim(coalesce(target_login, to_email, ''))), sent_at desc);
