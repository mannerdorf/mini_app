## Защита от перебора (bruteforce) через Vercel KV

В проекте добавлена защита в serverless API:
- `api/perevozki.ts`
- `api/download.ts`

### Как работает
- **Rate limit** по ключу **IP + login** (фиксированное окно 60 секунд)
- При превышении лимита API возвращает **429** и заголовок `Retry-After`
- **Бан после серии неудач**: если много неуспешных попыток подряд — ставится бан на 15 минут

Параметры можно поменять в коде при создании контекста `createRateLimitContext(...)`.

### Как включить Vercel KV
1. В Vercel открой проект → **Storage** → **KV** → **Create** (или **Connect**).
2. Привяжи KV к проекту (Environment: Production + Preview по желанию).
3. Vercel автоматически добавит env‑переменные для `@vercel/kv` (например `KV_REST_API_URL`, `KV_REST_API_TOKEN`).

### Локальная разработка
Если KV не настроен (env нет), защита **не блокирует** запросы (fail-open), чтобы dev не ломался.

