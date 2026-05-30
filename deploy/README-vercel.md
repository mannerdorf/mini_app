# Vercel (preview / отдельный контур)

Фронт `*.vercel.app` → **свой** `/api/*` (serverless), **не** VPS Timeweb.

## Фронт на Layero → API на Vercel

1. **Layero** → Environment Variables (на этапе сборки):

   `VITE_API_ORIGIN=https://<ваш-проект>.vercel.app` (без `/` в конце, Production URL из Vercel Dashboard).

2. **Vercel** — в том же проекте должны работать **Functions** (папка `api/`, не только `dist`):
   - Framework: **Vite** (не «Static Site»)
   - Root Directory: пусто
   - Build: `npm run build`, Output: `dist`
   - Redeploy после push в `main`/`staging`

3. На Vercel задайте `DATABASE_URL`, `CRON_SECRET`, креды 1С — данные из кэша Postgres (см. ниже).

4. Проверка: `curl -X POST https://<project>.vercel.app/api/auth-registered-login -H 'Content-Type: application/json' -d '{}'`  
   Должен быть **JSON** (400/401), не HTML `405 Not Allowed` от nginx.

5. **Не** ставьте на Layero `VITE_API_ORIGIN=https://api.haulz.ru`, если API нужен с Vercel.

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
