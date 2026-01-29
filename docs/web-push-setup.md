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

Три раздела (макс): **Telegram**, **Web Push**. В каждом — список событий (Ответ принято, В пути, На доставке, Доставлено, Счёт на оплату, Изменение статуса) с переключателем вкл/выкл.

Web Push работает в Chrome, Edge, Firefox; на iOS — только если сайт добавлен на экран «Домой» (PWA) и разрешены уведомления.
