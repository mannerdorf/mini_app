# Переменные окружения HAULZ mini_app

Справочник для Vercel, Layero/haulz.ru, VPS (`server/`) и локальной разработки.  
Секреты не коммитить: `.env`, `.env*.local` (см. корневой `.gitignore`).

---

## Фронт (Vite, build-time)

| Переменная | Где | Назначение |
|------------|-----|------------|
| `VITE_API_ORIGIN` | Layero, Amvera, Capacitor build | Базовый URL API **без** завершающего `/`. Пример: `https://mini-app-lake-phi.vercel.app`. Переписывает `fetch` на `/api/*` в `src/main.tsx`. |
| `VITE_SINGLEFILE` | Опционально | `1` — один `index.html` (legacy деплой). |
| `VITE_PROD_SOURCEMAP` | Опционально | `1` — source maps в production build. |

**Не задавать** на Layero `VITE_API_ORIGIN=https://api.haulz.ru`, если API на Vercel (см. `deploy/README-vercel.md`).

Partner API v1 для внешних интеграторов: базовый URL **`https://mini-app-lake-phi.vercel.app`** — см. [PARTNER_API.md](./PARTNER_API.md).

---

## База и кэш

| Переменная | Назначение |
|------------|------------|
| `DATABASE_URL` | Postgres (кэш 1С, пользователи, претензии, …) |
| `UPSTASH_REDIS_REST_URL` | Redis REST (ссылки, 2FA, MAX/Alice) |
| `UPSTASH_REDIS_REST_TOKEN` | Токен Upstash |
| `CACHE_HISTORY_DAYS` | Глубина истории кэша (по умолчанию 365) |

---

## Cron и админ

| Переменная | Назначение |
|------------|------------|
| `CRON_SECRET` | Авторизация вызовов `/api/cron/*` |
| `VERCEL_CRON_SECRET` | Альтернативное имя для cron |
| `ALLOW_VERCEL_1C` | `1` — разрешить прямые запросы в 1С с Vercel (иначе только кэш) |
| `SERVICE_MODE_PASSWORD` | Пароль сервисного режима |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | Суперадмин (sendlk, служебные операции) |

---

## 1С / перевозки

| Переменная | Назначение |
|------------|------------|
| `PEREVOZKI_SERVICE_LOGIN` | Сервисный логин 1С (кэш, perevozki) |
| `PEREVOZKI_SERVICE_PASSWORD` | Пароль |
| `HAULZ_1C_SERVICE_LOGIN` | Алиас для plan-date и др. |
| `HAULZ_1C_SERVICE_PASSWORD` | Алиас |
| `SUPPLIERS_1C_LOGIN` / `SUPPLIERS_1C_PASSWORD` | Поставщики |
| `PLAN_DATE_SERVICE_LOGIN` / `PLAN_DATE_SERVICE_PASSWORD` | Плановая дата отправок |
| `POLL_SERVICE_LOGIN` / `POLL_SERVICE_PASSWORD` | Опросы / уведомления |
| `ONE_C_SUPERADMIN_LOGIN` / `ONE_C_SUPERADMIN_PASSWORD` | SendLK |
| `SENDLK_SUPERADMIN_*` | Алиасы sendlk |

---

## Боты и мессенджеры

| Переменная | Назначение |
|------------|------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot |
| `HAULZ_TELEGRAM_BOT_TOKEN` | Основной HAULZ bot |
| `TG_BOT_TOKEN` | Алиас |
| `MAX_BOT_TOKEN` | MAX bot |
| `MAX_WEBHOOK_SECRET` | Секрет webhook MAX |

---

## Почта, push, AI

| Переменная | Назначение |
|------------|------------|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | Исходящая почта |
| `FROM_EMAIL`, `FROM_NAME` | Отправитель |
| `EMAIL_TEMPLATE_REGISTRATION` / `EMAIL_TEMPLATE_PASSWORD_RESET` | Шаблоны |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push |
| `OPENAI_API_KEY` | RAG / embeddings |
| `RAG_EMBEDDING_MODEL`, `RAG_TOP_K`, `RAG_MIN_SCORE` | RAG tuning |

---

## Прочее

| Переменная | Назначение |
|------------|------------|
| `VERCEL` | `1` на Vercel runtime |
| `VERCEL_URL` | Хост деплоя |
| `NEXT_PUBLIC_APP_URL` / `APP_URL` | Публичный URL приложения |
| `TINYURL_API_TOKEN` | Сокращение ссылок |
| `MARINESIA_API_KEY` / `VESSELAPI_API_KEY` | Суда / MMSI |
| `OPENSHIPDATA_API_KEY` | OpenShipData |
| `POSTB_*` | PostB интеграция |
| `ALICE_VERIFICATION_CODE` | Яндекс Алиса |
| `AUTO_REGISTER_FROM_CUSTOMERS` | `true` — автрегистрация из клиентов |

---

## Локально

```bash
# .env.local (не в git)
DATABASE_URL=postgresql://...
CRON_SECRET=...
PEREVOZKI_SERVICE_LOGIN=...
PEREVOZKI_SERVICE_PASSWORD=...
```

Фронт с API на Vercel preview:

```bash
VITE_API_ORIGIN=https://<project>.vercel.app npm run build
```

---

## Связанные документы

- [deploy/README-vercel.md](../deploy/README-vercel.md)
- [deploy/README-vps-api.md](../deploy/README-vps-api.md)
- [API_CORS_CHECKLIST.md](./API_CORS_CHECKLIST.md)
