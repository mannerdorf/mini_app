# API на VPS (api.haulz.ru)

Основной production API — **самостоятельный Node-сервер** на VPS. Vercel не нужен для haulz.ru.

Полный runbook миграции с Neon: [docs/MIGRATION_VPS_POSTGRES.md](../docs/MIGRATION_VPS_POSTGRES.md).

## 1. Клонировать проект

```bash
sudo mkdir -p /opt/haulz
sudo git clone https://github.com/mannerdorf/mini_app.git /opt/haulz/app
# или: cd /opt/haulz/app && sudo git pull origin staging
```

## 2. Переменные

```bash
sudo cp /opt/haulz/app/deploy/env.backend.example /opt/haulz/.env
sudo nano /opt/haulz/.env
```

Обязательно:

- `DATABASE_URL` — **свой Postgres** (не Neon после миграции)
- `PGSSLMODE=disable` — для локального Postgres на том же VPS
- `PUBLIC_API_ORIGIN=https://api.haulz.ru`
- `APP_URL` / `NEXT_PUBLIC_APP_URL=https://haulz.ru`
- секреты 1С, Redis, ботов — из текущего production

## 3. Node 20 + зависимости

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
cd /opt/haulz/app && sudo npm ci
```

## 4. systemd

```bash
sudo cp /opt/haulz/app/deploy/haulz-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now haulz-api
sudo systemctl status haulz-api
```

Проверка локально на сервере:

```bash
curl -sS http://127.0.0.1:3000/api/auth-config
curl -sS http://127.0.0.1:3000/health
```

## 5. nginx → localhost:3000

```bash
sudo cp /opt/haulz/app/deploy/nginx-api.haulz.ru.conf /etc/nginx/sites-available/api.haulz.ru
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://api.haulz.ru/api/auth-config
```

## 6. Кроны

```bash
sudo cp /opt/haulz/app/deploy/crontab.haulz-api.example /root/crontab-haulz.txt
# подставьте CRON_SECRET
sudo crontab /root/crontab-haulz.txt
```

После переноса **отключите Vercel Cron**, иначе задачи дублируются.

## Обновление

```bash
cd /opt/haulz/app && sudo git pull origin staging && sudo npm ci && sudo systemctl restart haulz-api
```

После обновления с новыми миграциями:

```bash
psql "$DATABASE_URL" -f /opt/haulz/app/migrations/075_legal_documents.sql
```

## Статика haulz.ru

Фронт на **haulz.ru** не обслуживает `POST /api/*` — только **api.haulz.ru**.

При сборке:

```bash
VITE_API_ORIGIN=https://api.haulz.ru npm run build
```

В актуальных сборках `main.tsx` перенаправляет `/api/*` с `haulz.ru` / Layero на **`https://api.haulz.ru`** по умолчанию.

## Postgres на VPS

```bash
sudo apt install postgresql postgresql-contrib postgresql-16-pgvector
# см. docs/MIGRATION_VPS_POSTGRES.md — создание БД, pg_dump из Neon, PGSSLMODE
```
