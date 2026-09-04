# Android / iOS FCM Push Notifications

Push-уведомления в установленном приложении через Firebase Cloud Messaging (FCM).
Android APK и iOS (TestFlight / устройство) используют **один** Firebase-проект и один `FIREBASE_SERVICE_ACCOUNT_JSON` на API.

## 1. Firebase Console

1. Создайте проект в [Firebase Console](https://console.firebase.google.com).
2. Добавьте Android-приложение с package name **`ru.haulz.miniapp`** (см. `android/app/build.gradle`).
3. Скачайте **`google-services.json`** и положите в `android/app/google-services.json` (файл не коммитить — см. `.gitignore`).
4. В Project Settings → Service accounts → **Generate new private key** — JSON сервисного аккаунта для сервера.

## 1b. iOS (тот же Firebase-проект)

1. Add app → **iOS**, bundle ID **`ru.haulz.miniapp`**.
2. `GoogleService-Info.plist` → `ios/App/App/` (не коммитить), добавить в target App в Xcode.
3. Cloud Messaging → загрузить **APNs Authentication Key** (.p8) из Apple Developer → Keys.
4. App ID: галка **Push Notifications**, **Broadcast** не включать.
5. Шаги на Mac: `docs/IOS.md` → «Push-уведомления».

Сервисный аккаунт API тот же, что в разделе 2.

## 2. Переменные окружения API

На VPS / в `.env` API-сервера:

```bash
# Весь JSON service account одной строкой (рекомендуется для VPS)
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
```

Альтернатива: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json`

Также нужны (как для других уведомлений):

- `DATABASE_URL`
- `POLL_SERVICE_LOGIN` / `POLL_SERVICE_PASSWORD`
- `CRON_SECRET`
- Cron: `0 * * * * ... /api/notification-poll`

## 3. Миграция БД

```bash
psql "$DATABASE_URL" -f migrations/089_fcm_push.sql
```

Таблица `fcm_device_tokens` хранит FCM-токены устройств. PK = `token`: у одного логина могут быть Android и iOS одновременно. `POST /api/fcm-unsubscribe` **обязан** передать `token` — без него API больше не удаляет все устройства логина (это обнуляло админку «Кто включил push»).

## 4. Сборка APK

```bash
# google-services.json должен лежать в android/app/
npm run android:sync
npm run android:release
```

Gradle автоматически подключит `com.google.gms.google-services`, если файл найден.

## 5. Проверка в приложении

1. Установите APK с `app.haulz.space`.
2. Войдите в аккаунт.
3. **Профиль → Уведомления → Включить push-уведомления**.
4. Разрешите уведомления в системном диалоге Android.
5. Включите нужные события переключателями (этапы перевозки, документы, **ежедневная сводка в 10:00**).

Токен сохраняется через `POST /api/fcm-subscribe`. Отправка:
- **события перевозок** — из `notification-poll` (каждый час) и cache refresh;
- **ежедневная сводка в 10:00** — из `/api/notification-daily-summary` (cron `0 10 * * *`, TZ `Europe/Moscow` на **cron-VPS** `194.87.140.125`).
  - В профиле → Уведомления включите **Push → «Ежедневная сводка в 10:00»** (по умолчанию выкл.).
  - На `main` до мержа PR push-сводка не отправлялась (только Telegram) — на cron-VPS нужен код с FCM daily summary.
  - Лог вызовов cron: `/var/log/haulz-cron-call.log`.

## 6. Тестовая отправка

После подписки можно проверить доставку, вызвав cron poll или дождаться изменения статуса перевозки.

Логи отправок: таблица `notification_deliveries`, channel = `push`.

## UI

В разделе **Уведомления** остались:

- **Push-уведомления (приложение)** — Android APK и iOS (TestFlight)
- **Email** — как раньше

Разделы Telegram и Web Push убраны из UI (API на сервере сохранён для обратной совместимости).
