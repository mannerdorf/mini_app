# API на VPS (72.56.36.185, Timeweb)

Поддомен `api.haulz.ru` — тот же сервер (DNS → этот IP). В коде фронта по умолчанию: `http://72.56.36.185`.

## 1. Клонировать проект

```bash
sudo mkdir -p /opt/haulz
sudo git clone https://github.com/mannerdorf/mini_app.git /opt/haulz/app
# или: cd /opt/haulz/app && sudo git pull origin main
```

## 2. Переменные

```bash
sudo cp /opt/haulz/app/deploy/env.backend.example /opt/haulz/.env
sudo nano /opt/haulz/.env
```

Значения — из Vercel Production (те же ключи).

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
sudo ln -sf /etc/nginx/sites-available/api.haulz.ru /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
curl -sS http://72.56.36.185/api/auth-config
```

## 6. Кроны (после API работает)

```bash
sudo crontab -e
```

Пример (подставьте свой `CRON_SECRET`):

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" http://72.56.36.185/api/cron/refresh-cache >/dev/null
```

Полный список путей — в `vercel.json` → `crons`.

## Обновление

```bash
cd /opt/haulz/app && sudo git pull origin main && sudo npm ci && sudo systemctl restart haulz-api
```

После обновления с юридическими эндпоинтами (`/api/legal-public`, `/api/legal-status`) примените миграцию БД:

```bash
psql "$DATABASE_URL" -f /opt/haulz/app/migrations/075_legal_documents.sql
```

Проверка:

```bash
curl -sS http://72.56.36.185/api/legal-public | head -c 200
```

## Статика haulz.ru (Timeweb Apps)

Фронт на **haulz.ru** не обслуживает `POST /api/*` — запросы идут на **72.56.36.185**.

Сборка по умолчанию (уже в `src/constants/apiOrigin.ts`):

```bash
npm run build
```

Если сайт открыт по **HTTPS** и браузер блокирует `http://72.56.36.185` (mixed content), в Timeweb задайте переменную:

```bash
VITE_API_ORIGIN=https://api.haulz.ru
```

(тот же VPS, TLS на поддомене).

В `main.tsx` запросы `/api/*` с `haulz.ru` переписываются на `VITE_API_ORIGIN` или `http://72.56.36.185`.
