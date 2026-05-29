# Vercel (preview / отдельный контур)

Фронт `*.vercel.app` → **свой** `/api/*` (serverless), **не** VPS Timeweb.

## 504 на `/api/perevozki` и `/api/invoices`

1. **Edge middleware** не должен оборачивать тяжёлые маршруты (см. `middleware.ts`).
2. Данные берутся из **Postgres cache_*** (крон `refresh-cache` каждые 5 мин). Проверьте на Vercel:
   - `DATABASE_URL`
   - `CRON_SECRET` и включённые crons в `vercel.json`
3. При пустом кэше идёт прямой запрос в 1С (до 50 с, затем 504 с текстом).

## 429 на `/api/auth-registered-login`

Лимит попыток входа с одного IP — подождите 1 минуту.

## Отличие от Timeweb

| | Vercel | Timeweb |
|---|--------|---------|
| Фронт | `*.vercel.app` | `haulz.ru` |
| API | Serverless в проекте | VPS `72.56.36.185` |
