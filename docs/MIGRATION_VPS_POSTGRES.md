# Миграция: Vercel + Neon → VPS + свой Postgres

Пошаговый runbook для независимой работы основного сервера (`api.haulz.ru`) без Vercel и Neon.

---

## Целевая схема

```
Браузер (haulz.ru)
    → fetch /api/* → https://api.haulz.ru (VPS Node + nginx)
        → server/index.ts → api/*.ts handlers
        → DATABASE_URL → Postgres на VPS (или отдельный хост)
        → Upstash Redis (без изменений)

Crons: systemd/crontab на VPS → api.haulz.ru/api/cron/*
```

Фронт **не** ходит на Vercel. API **не** зависит от `VERCEL_URL` / Neon.

---

## Часть 1. Свой Postgres

### 1.1 Требования

- PostgreSQL **15+** (рекомендуется 16)
- Расширение **pgvector** (миграция `migrations/002_rag.sql`)
- Доступ с VPS API: порт 5432 (локально или по VPN/внутренней сети)

На Ubuntu/Debian:

```bash
sudo apt install postgresql postgresql-contrib
sudo apt install postgresql-16-pgvector   # версия под ваш PG
```

### 1.2 Создание БД и пользователя

```bash
sudo -u postgres psql <<'SQL'
CREATE USER haulz WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE haulz OWNER haulz;
\c haulz
CREATE EXTENSION IF NOT EXISTS vector;
GRANT ALL ON SCHEMA public TO haulz;
SQL
```

### 1.3 Перенос данных из Neon

**Вариант A — pg_dump (рекомендуется, если есть доступ к Neon):**

```bash
# На машине с доступом к Neon
pg_dump "$NEON_DATABASE_URL" --no-owner --no-acl -F c -f haulz-neon.dump

# На VPS
pg_restore -d "postgresql://haulz:STRONG_PASSWORD@127.0.0.1:5432/haulz" --no-owner --no-acl haulz-neon.dump
```

**Вариант B — только схема (пустая БД):**

```bash
cd /opt/haulz/app
for f in migrations/[0-9]*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
```

Проверка:

```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
psql "$DATABASE_URL" -c "SELECT extname FROM pg_extension WHERE extname='vector';"
```

### 1.4 DATABASE_URL на VPS

В `/opt/haulz/.env`:

```bash
# Локальный Postgres без SSL
DATABASE_URL=postgresql://haulz:STRONG_PASSWORD@127.0.0.1:5432/haulz
PGSSLMODE=disable

# Или удалённый Postgres с SSL
# DATABASE_URL=postgresql://haulz:pass@db.internal:5432/haulz
# PGSSLMODE=require
```

Переменные SSL (см. `api/_db.ts`):

| Переменная | Значение | Эффект |
|------------|----------|--------|
| `PGSSLMODE=disable` | локальный PG | без SSL |
| `PGSSLMODE=require` | облако / Neon | SSL |
| *(не задано)* | auto | SSL выкл. для localhost, вкл. для внешних хостов |

Перезапуск API:

```bash
sudo systemctl restart haulz-api
curl -sS https://api.haulz.ru/api/auth-config | head -c 200
```

---

## Часть 2. API на VPS без Vercel

### 2.1 Переменные `/opt/haulz/.env`

Скопируйте секреты **из текущего production**, но задайте свои URL:

```bash
PUBLIC_API_ORIGIN=https://api.haulz.ru
APP_URL=https://haulz.ru
NEXT_PUBLIC_APP_URL=https://haulz.ru

DATABASE_URL=postgresql://...
PGSSLMODE=disable
CRON_SECRET=...
# остальное — 1С, Redis, SMTP, боты (как на Vercel)
```

**Не нужны на VPS:** `VERCEL`, `VERCEL_URL`, `VERCEL_CRON_SECRET` (можно оставить `CRON_SECRET`).

На VPS `preferCacheOnlyOnVercel()` = false → прямые запросы в 1С разрешены (кэш + live).

### 2.2 Кроны

```bash
sudo cp /opt/haulz/app/deploy/crontab.haulz-api.example /root/crontab-haulz.txt
# отредактируйте CRON_SECRET
sudo crontab /root/crontab-haulz.txt
```

Отключите crons на Vercel (Dashboard → Cron Jobs или уберите секцию `crons` из деплоя).

### 2.3 Фронт haulz.ru

Сборка с явным API origin (Dockerfile уже задаёт по умолчанию):

```bash
VITE_API_ORIGIN=https://api.haulz.ru npm run build
```

В коде fallback для `haulz.ru` / Layero / Capacitor → `https://api.haulz.ru` (см. `src/main.tsx`).

Пересоберите и задеployte статику на haulz.ru.

### 2.4 Webhooks (Telegram, MAX, Алиса)

Обновите URL webhook у провайдеров:

| Сервис | URL |
|--------|-----|
| Telegram | `https://api.haulz.ru/api/tg-webhook` |
| MAX | `https://api.haulz.ru/api/max-webhook` |
| Яндекс Алиса | skill endpoint → `https://api.haulz.ru/api/alice` |

### 2.5 Partner API

Публичный базовый URL: **`https://api.haulz.ru`** — см. `docs/PARTNER_API.md`.

Сообщите интеграторам о смене хоста.

---

## Часть 3. Отключение Vercel (опционально)

1. Убедитесь, что haulz.ru + api.haulz.ru работают ≥ 24–48 ч.
2. Отключите Vercel Cron.
3. Перестаньте деплоить API на Vercel (можно оставить preview только для фронта).
4. Удалите `DATABASE_URL` из Vercel env (чтобы preview не писал в prod БД).
5. Отмените Neon (после финального бэкапа).

---

## Чеклист проверки

- [ ] `curl https://api.haulz.ru/health`
- [ ] `curl https://api.haulz.ru/api/auth-config`
- [ ] Логин в мини-апп с haulz.ru (POST уходит на api.haulz.ru, не vercel.app)
- [ ] Грузы / документы загружаются
- [ ] Cron `refresh-cache` в логах / таблицах `cache_*`
- [ ] Telegram / MAX webhook отвечает 200
- [ ] Partner API `GET /api/partner/v1/health`
- [ ] pgvector: RAG / chat (если используется)

---

## Откат

1. Вернуть `DATABASE_URL` на Neon в Vercel env.
2. Временно вернуть `VITE_API_ORIGIN` на Vercel URL в сборке фронта.
3. Включить Vercel Cron, отключить VPS crontab.

Держите последний `pg_dump` Neon до стабилизации.

---

## Связанные файлы

- [deploy/README-vps-api.md](../deploy/README-vps-api.md)
- [deploy/env.backend.example](../deploy/env.backend.example)
- [deploy/crontab.haulz-api.example](../deploy/crontab.haulz-api.example)
- [docs/ENV.md](./ENV.md)
