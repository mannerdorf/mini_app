# Vercel (preview / отдельный контур)

Фронт `*.vercel.app` → **свой** `/api/*` (serverless), **не** VPS Timeweb.

## 504 на `/api/perevozki` и `/api/invoices`

1. **Edge middleware** не должен оборачивать тяжёлые маршруты (см. `middleware.ts`).
2. Данные берутся из **Postgres cache_*** (крон `refresh-cache` каждые 5 мин). Проверьте на Vercel:
   - `DATABASE_URL`
   - `CRON_SECRET` и включённые crons в `vercel.json`
3. На Vercel **по умолчанию 1С не вызывается** — только кэш. Если кэш пустой, API вернёт `[]` (пустой список), не 504. Запустите cron `refresh-cache` или задайте `ALLOW_VERCEL_1C=1` для прямых запросов в 1С.

## 429 на `/api/auth-registered-login`

Лимит попыток входа с одного IP — подождите 1 минуту.

## Отличие от Timeweb

| | Vercel | Timeweb |
|---|--------|---------|
| Фронт | `*.vercel.app` | `haulz.ru` |
| API | Serverless в проекте | VPS `72.56.36.185` |
