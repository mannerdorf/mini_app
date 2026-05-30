# Чеклист CORS для новых `api/*`

Источник заголовков: **`lib/apiCorsHeaders.ts`** (`API_CORS_HEADERS`).

## Serverless (`api/*.ts`)

1. В начале handler:
   ```ts
   import { respondCorsPreflight } from "./_lib/cors.js";
   // ...
   if (respondCorsPreflight(req, res)) return;
   ```
2. На успешный ответ — те же заголовки (через `_lib/cors` или `setApiCorsHeaders`).

## Edge `middleware.ts`

- **Лёгкие** маршруты — в `matcher` (получают CORS на Edge).
- **Тяжёлые** (`perevozki`, `invoices`, `acts`, `orders`, `sendings`, `getperevozka`, `service-refresh-from-1c`, `cron/`, `wb/`, …) — **исключены** из matcher; CORS только в handler + preflight.

При добавлении тяжёлого API — добавить сегмент в negative lookahead `matcher` в `middleware.ts`.

## VPS (`server/`)

- Использовать `server/cors.ts` → реэкспорт из `lib/apiCorsHeaders.ts`.
- Не дублировать строки заголовков в других файлах.

## Проверка с haulz.ru

```bash
curl -i -X OPTIONS "https://<api-host>/api/<route>" \
  -H "Origin: https://haulz.ru" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type, X-Login, X-Password"
```

Ожидается `204` и `Access-Control-Allow-Headers` с `X-Login`, `X-Password`.
