# Partner API v1 (Profile API)

Документация для внешних интеграций с HAULZ mini_app через персональные API-ключи из раздела **Профиль → API**.

Пользовательское описание в приложении: **Профиль → API → «Описание Partner API»** (контент: `src/pages/profile/partnerApiGuideContent.ts`).

## Базовый URL

```
https://api.haulz.ru
```

Фронт на **haulz.ru** — статика; все `fetch("/api/...")` из браузера переписываются на этот хост (см. `src/main.tsx`, `src/lib/resolveApiOrigin.ts`).

**Официальный хост для интеграторов:** `https://api.haulz.ru` (VPS production).

---

## Как получить ключ

1. Войти в приложение под **зарегистрированным** пользователем (email + пароль).
2. **Профиль → API** → «Создать ключ».
3. **Сохранить полный токен** — он показывается один раз.

Формат токена:

```
haulz_<12 hex public_id>_<64 hex secret>
```

Пример заголовка:

```
Authorization: Bearer haulz_a1b2c3d4e5f6_0123456789abcdef...
```

---

## Scopes (права ключа)

| Scope | Метод | Описание |
|-------|--------|----------|
| `cargo:read` | `POST /api/partner/v1/cargo` | Список перевозок из кэша |
| `sendings:read` | `POST /api/partner/v1/sendings` | Список отправок из кэша |
| `orders:read` | `POST /api/partner/v1/orders` | Список заявок из кэша |

При создании ключа можно выбрать один или несколько scope. Опционально — ограничение по **ИНН** (`allowed_inns`).

---

## Эндпоинты Partner API v1

### Health

```bash
curl -s "https://api.haulz.ru/api/partner/v1/health"
```

Ответ: `{ "ok": true, "version": "1", "partner_api": { ... }, "request_id": "..." }`

### Перевозки

```bash
curl -s -X POST "https://api.haulz.ru/api/partner/v1/cargo" \
  -H "Authorization: Bearer haulz_YOUR_FULL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-31",
    "inn": "",
    "serviceMode": false
  }'
```

### Отправки

```bash
curl -s -X POST "https://api.haulz.ru/api/partner/v1/sendings" \
  -H "Authorization: Bearer haulz_YOUR_FULL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-31",
    "inn": "",
    "serviceMode": false
  }'
```

### Заявки

```bash
curl -s -X POST "https://api.haulz.ru/api/partner/v1/orders" \
  -H "Authorization: Bearer haulz_YOUR_FULL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "dateFrom": "2026-01-01",
    "dateTo": "2026-01-31",
    "inn": "",
    "serviceMode": false
  }'
```

**Тело запроса:** как у соответствующих кэшированных методов приложения (`/api/perevozki`, `/api/sendings`, `/api/orders`) для зарегистрированного пользователя, **без** `login` / `password` в JSON.

**Даты:** формат `YYYY-MM-DD`.

---

## Управление ключами (только из приложения)

| Метод | Путь | Авторизация |
|-------|------|-------------|
| GET | `/api/my-api-keys` | Заголовки `x-login`, `x-password` |
| POST | `/api/my-api-keys` | JSON: `login`, `password`, `label`, `scopes`, `allowed_inns` |
| DELETE | `/api/my-api-keys?id=<uuid>` | `x-login`, `x-password` |

Доступно всем **зарегистрированным** пользователям (email + пароль).

---

## Ограничения v1

- **Только чтение** из Postgres-кэша (как в приложении). Прямые вызовы 1С по умолчанию на Vercel **не** выполняются.
- Ключ привязан к пользователю; при отзыве (`revoked_at`) перестаёт работать.
- Поле `last_used_at` обновляется при успешной авторизации Partner API.
- Запись данных (создание заявок, документов) через Partner API v1 **не поддерживается**.

---

## Коды ошибок

| HTTP | Причина |
|------|---------|
| 400 | Неверное тело (даты, ИНН вне allowed_inns) |
| 401 | Нет Bearer / неверный или отозванный ключ |
| 403 | Нет нужного scope; ключ отключён; ИНН запрещён для ключа |
| 405 | Неверный HTTP-метод |
| 500 | Ошибка сервера (см. `request_id` в JSON) |

---

## Инфраструктура

### Миграция БД

Таблица ключей: [`migrations/063_user_api_keys.sql`](../migrations/063_user_api_keys.sql).

Применить на Postgres Vercel Production (см. [migrations-apply.md](./migrations-apply.md#api-ключи-профиль--api)).

### Smoke-тест

```bash
bash scripts/smoke-partner-api.sh
```

### CORS

Запросы с `Origin: https://haulz.ru` к `/api/partner/v1/*` и `/api/my-api-keys` поддерживаются (Edge middleware + `lib/apiCorsHeaders.ts`).

---

## Пилотное внедрение (чеклист)

- [ ] Миграция `063` применена на prod Postgres
- [ ] Создан ключ с нужными scope и ИНН
- [ ] Успешный вызов `cargo`, `sendings`, `orders` с Bearer
- [ ] Проверен `last_used_at` в списке ключей в профиле
- [ ] Ключ отозван после теста (опционально)

---

## Связанные файлы

- Backend ключей: [`api/my-api-keys.ts`](../api/my-api-keys.ts)
- Partner v1: [`api/partner/v1/`](../api/partner/v1/)
- Авторизация: [`lib/partnerOrUserApiAuth.ts`](../lib/partnerOrUserApiAuth.ts)
- UI профиля: [`src/components/profile/ProfileApiKeysSection.tsx`](../src/components/profile/ProfileApiKeysSection.tsx)
- Справочник в приложении: [`src/constants/miniAppApiInventory.ts`](../src/constants/miniAppApiInventory.ts)
