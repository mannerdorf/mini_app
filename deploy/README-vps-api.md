# API на VPS (api.haulz.ru)

Основной production API — **самостоятельный Node-сервер** на VPS `72.56.36.185`. Vercel не нужен для haulz.ru.

**Cron / cache refresh** — на **отдельном cron-VPS**: [README-vps-cron.md](./README-vps-cron.md).

Полный runbook миграции с Neon: [docs/MIGRATION_VPS_POSTGRES.md](../docs/MIGRATION_VPS_POSTGRES.md).

## 1. Клонировать проект

```bash
sudo mkdir -p /opt/haulz
sudo git clone https://github.com/mannerdorf/mini_app.git /opt/haulz/app
```

## 2. Переменные

```bash
sudo cp /opt/haulz/app/deploy/env.backend.example /opt/haulz/.env
sudo nano /opt/haulz/.env
```

Обязательно:

- `DATABASE_URL` — Timeweb Cloud DBaaS (`PGSSLMODE=require`)
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
curl -sS http://127.0.0.1:3000/health
```

## 5. nginx → localhost:3000

```bash
bash /opt/haulz/app/deploy/apply-nginx-api.sh
curl -sS https://api.haulz.ru/api/auth-config
```

Nginx блокирует внешний доступ к `/api/cron/*` (cron только на cron-VPS).

## 6. Crontab на API-VPS (после split)

**Только watchdog TLS**, не cache jobs:

```bash
sudo cp /opt/haulz/app/deploy/crontab.haulz-api.example /root/crontab-haulz-api.txt
sudo crontab /root/crontab-haulz-api.txt
```

Или: `bash deploy/cutover-api-remove-cron.sh`

## Production baseline

Эталон — **`origin/main`**.

| VPS | Скрипт деплоя | Миграции |
|-----|---------------|----------|
| API (`72.56.36.185`) | `deploy/vps-sync-main.sh` | да |
| Cron (отдельный) | `deploy/vps-sync-cron.sh` | нет |

```bash
cd /opt/haulz/app && bash deploy/vps-sync-main.sh
```

## Скрипты

| Скрипт | Назначение |
|--------|------------|
| `deploy/vps-sync-main.sh` | Sync API + migrations + restart |
| `deploy/vps-sync-cron.sh` | Sync cron worker (см. README-vps-cron) |
| `deploy/SPLIT_ROLLOUT_CHECKLIST.md` | Пошаговый cutover API + cron VPS |
| `deploy/cutover-api-remove-cron.sh` | Убрать cron с API, nginx deny |
| `deploy/monitor-vps-split.sh api` | Health-check API-VPS |
| `deploy/apply-vps-env.sh` | Замена `.env` с бэкапом |
| `deploy/stabilize-vps.sh` | nginx + watchdog + restart |

Фронт Timeweb: **`VITE_API_ORIGIN` пустой** если nginx проксирует `/api` → VPS :80.

## Статика haulz.ru

Same-origin `/api` → VPS :80 (`deploy/nginx.miniapp-static.conf`, `docker-compose.yml`).

## Postgres

Production: **Timeweb Cloud DBaaS** — whitelist IP API-VPS и cron-VPS.
