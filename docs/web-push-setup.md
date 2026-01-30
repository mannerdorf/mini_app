# Web Push (уведомления в браузере)

## Требования

- **HTTPS** (обязательно)
- **Service Worker** (`public/sw.js`) — подписывается на пуши и показывает уведомления
- **VAPID ключи** — для подписки и отправки

## VAPID ключи

Сгенерировать ключи:

```bash
npx web-push generate-vapid-keys
```

Добавить в переменные окружения (Vercel / .env):

- `VAPID_PUBLIC_KEY` — публичный ключ (отдаётся клиенту для подписки)
- `VAPID_PRIVATE_KEY` — приватный ключ (только на сервере для отправки)

## API

- `GET /api/webpush-vapid` — вернуть публичный ключ
- `POST /api/webpush-subscribe` — сохранить подписку: `{ login, subscription }`
- `GET /api/webpush-preferences?login=` — настройки уведомлений по каналам (telegram, webpush) и событиям
- `POST /api/webpush-preferences` — сохранить настройки: `{ login, preferences: { telegram: {...}, webpush: {...} } }`
- `POST /api/webpush-send` — отправить пуш: `{ logins: string[], title, body?, url? }`

## Профиль → Уведомления

- **Кнопка Telegram**: привязка через «Привязать Telegram» (тот же поток, что и для 2FA: tg-link → открытие бота).
- Внутри Telegram: раздел **Перевозки** (Принята, В пути, Доставлено), раздел **Документы** (Счёт оплачен). Переключатели — как в 2FA (TapSwitch).
- **Web Push** — те же разделы и события, переключатели TapSwitch.

### Шаблоны текста для Telegram (при отправке уведомлений)

- **Принята** (accepted): «Создана Перевозка {номер} число мест {N}, вес {кг} кг, объем {м³} м3, платный вес {кг} кг».
- **В пути** (in_transit): «{номер} В пути».
- **Доставлено** (delivered): «Доставлено».
- **Счёт оплачен** (bill_paid): «Счёт по перевозке № {номер} оплачен».

Web Push работает в Chrome, Edge, Firefox; на iOS — только если сайт добавлен на экран «Домой» (PWA) и разрешены уведомления.

## Схема: БЗ пуша + лог + опрос по заказчику

### 1. БЗ пуша (настройки)

Таблица **notification_preferences** (миграция `006_notification_preferences.sql`):

- **login** — заказчик (учётная запись)
- **channel** — способ оповещения: `telegram` или `web`
- **event_id** — событие: `accepted`, `in_transit`, `delivered`, `bill_paid`
- **enabled** — вкл (true) или выкл (false)

Чтение/запись через тот же API: `GET /api/webpush-preferences?login=`, `POST /api/webpush-preferences` с телом `{ login, preferences: { telegram: {...}, webpush: {...} } }` — данные хранятся в Postgres.

### 2. База логов отправок

Таблица **notification_deliveries** (миграция `005_notification_poll.sql`):

- когда отправили пуш (`sent_at`)
- кому (`login`)
- по какому каналу (`channel`: `telegram` или `web`)
- событие (`event`), перевозка (`cargo_number`, `inn`), успех/ошибка (`success`, `error_message`)

### 3. Опрос раз в час (Vercel Cron)

Раз в час вызывается `GET/POST /api/notification-poll`:

1. Список заказчиков для опроса берётся из **БД пуша** (notification_preferences) и `account_companies` (у кого есть ИНН и хотя бы одно событие включено по telegram или web).
2. Для каждого ИНН запрашиваются перевозки в 1С (GetPerevozki) по сервисному логину/паролю.
3. В Neon сравниваем с последним состоянием (**cargo_last_state**); фиксируем только **изменённые** позиции.
4. Только по изменённым — нотифицируем в **Telegram** и/или **Web** (по настройкам в notification_preferences) и пишем каждую отправку в **notification_deliveries**.

RAG (chunk, document) в Neon используется для поиска по перевозкам; для диффа статусов используется таблица `cargo_last_state`.

### Переменные окружения

- `CRON_SECRET` — секрет вызова эндпоинта (Vercel Cron или `Authorization: Bearer <CRON_SECRET>` / `?secret=...`).
- `POLL_SERVICE_LOGIN`, `POLL_SERVICE_PASSWORD` — 1С для опроса GetPerevozki по ИНН.
- `TG_BOT_TOKEN` — бот Telegram (для канала telegram).
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — Web Push (для канала web).
- `DATABASE_URL` — Postgres (миграции 005, 006).

---

## Что дальше (чеклист)

1. **Neon** — скрипт `migrations/neon_notification_tasks.sql` уже выполнен в SQL Editor → таблицы созданы.
2. **Vercel** — в проекте задать переменные окружения:
   - `CRON_SECRET` — любой длинный секрет (для вызова крона; в Vercel можно задать Cron Secret в настройках).
   - `POLL_SERVICE_LOGIN`, `POLL_SERVICE_PASSWORD` — логин/пароль 1С для GetPerevozki по ИНН (один сервисный аккаунт).
   - `TG_BOT_TOKEN` — токен бота Telegram (уже есть, если бот работает).
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` — для Web Push (уже есть, если пуши в браузере работают).
   - `DATABASE_URL` — строка подключения к Neon (уже есть).
3. **Деплой** — задеплоить проект на Vercel (cron `0 * * * *` будет вызывать `/api/notification-poll` раз в час).
4. **Проверка** — в приложении: Профиль → Уведомления → включить события для Telegram и/или Web → сохранить. Для Telegram — «Привязать Telegram» (chat_id попадёт в Redis). Для Web — разрешить уведомления в браузере (подписка в Redis). После следующего прогона крона изменённые перевозки начнут приходить в Telegram и/или в браузер, записи появятся в `notification_deliveries`.
