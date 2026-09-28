# Отделение push от обновления перевозок

Причина по рабочим логам: загрузка 1С 2–3 секунды, запись БД 30–40 мс, подготовка/отправка push 94–97 секунд. HTTP 504 возникал после сохранения перевозок.

Новая схема: syncNormalizedWindow сохраняет перевозки и неизменяемые задания cargo_notification_queue в одной транзакции. Одинаковые JSON-снимки дедуплицируются. Отправка происходит отдельным cron process-cargo-notifications раз в минуту. Он берёт до 10 снимков, сохраняет порядок по номеру перевозки, повторяет ошибки с увеличением интервала до 6 часов. Session advisory lock запрещает два одновременных обработчика очереди и снимается при потере соединения. Подготовка использует только кэш БД, без дополнительных запросов в 1С. Web Push имеет тайм-аут 10 секунд на подписку.

Доставка повторяемая, не exactly-once: авария между фактической доставкой и записью результата может дать дубль. Сохраняется существующая проверка успешных доставок и Redis-дедупликация. Другой notification-poll пока не переведён в эту очередь; его отдельный тайм-аут остаётся задачей. Задания без нужных данных могут оставаться pending и задерживать следующие снимки этой же перевозки; их возраст нужно контролировать. Успешные задания пока сохраняются для дедупликации, автоматической очистки нет.

## Установка

1. На backend-VPS обновить main, не перезапуская службу до миграции:

```bash
cd /opt/haulz/app
git fetch --no-auto-maintenance origin main:refs/remotes/origin/main && git merge --ff-only origin/main
```

2. В общей БД применить миграцию 118:

```bash
(
  set -e
  set -a
  source /opt/haulz/.env
  set +a
  psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f /opt/haulz/app/migrations/118_cargo_notification_queue.sql
)
```

3. Перезапустить haulz-api, проверить health. На cron-VPS обновить main, перезапустить haulz-cron, проверить health, затем `python3 deploy/install-document-queues.py`. Установщик сохраняет backup и ставит девять заданий вместо восьми; остальные cron сохраняет. Новых переменных .env нет. Если миграция не прошла, новый код не запускать.

## Проверка

Через 10 минут на cron-VPS:

```bash
grep -E 'path=/api/cron/(refresh-cache\?|process-cargo-notifications)' /var/log/haulz-cron-call.log | tail -n 25
```

В БД:

```sql
SELECT count(*) FILTER (WHERE completed_at IS NULL) AS pending,
       count(*) FILTER (WHERE completed_at IS NOT NULL) AS completed,
       max(attempts) AS max_attempts,
       min(created_at) FILTER (WHERE completed_at IS NULL) AS oldest_pending
FROM cargo_notification_queue;
```

Подтвердить: refresh возвращает HTTP 200 и detail notifications queued; completed растёт, возраст pending не увеличивается бесконечно. Проверить тестовое изменение статуса на разрешённом получателе. При rollback кода таблицу не удалять — pending остаются сохранены. Не восстанавливать синхронную отправку без учёта ожидающих заданий.
