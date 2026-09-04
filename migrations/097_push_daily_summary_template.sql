-- Актуальный текст ежедневной сводки в push (цифры вместо «Доброе утро!…»).
UPDATE push_notification_templates
SET
  title_template = 'HAULZ: ежедневная сводка',
  body_template =
    'В пути: {in_transit}' || E'\n' ||
    'Готово к выдаче: {ready_for_pickup}' || E'\n' ||
    'Неоплаченные счета: {unpaid_count} шт. на сумму {unpaid_sum} ₽',
  updated_at = now(),
  updated_by = coalesce(updated_by, 'migration_097')
WHERE event_id = 'daily_summary'
  AND trim(body_template) IN (
    'Доброе утро! Ежедневная сводка HAULZ на 10:00.',
    'Доброе утро! Ежедневная сводка HAULZ на 10:00'
  );

INSERT INTO push_notification_templates (event_id, title_template, body_template, enabled, updated_at, updated_by)
SELECT
  'daily_summary',
  'HAULZ: ежедневная сводка',
  'В пути: {in_transit}' || E'\n' ||
  'Готово к выдаче: {ready_for_pickup}' || E'\n' ||
  'Неоплаченные счета: {unpaid_count} шт. на сумму {unpaid_sum} ₽',
  true,
  now(),
  'migration_097'
WHERE NOT EXISTS (
  SELECT 1 FROM push_notification_templates WHERE event_id = 'daily_summary'
);
