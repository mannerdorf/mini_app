# API на VPS (api.haulz.ru)

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
sudo nginx -t && sudo systemctl reload nginx
curl -sS https://api.haulz.ru/api/auth-config
```

## 6. Кроны (после API работает)

```bash
sudo crontab -e
```

Пример (подставьте свой `CRON_SECRET`):

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer YOUR_CRON_SECRET" https://api.haulz.ru/api/cron/refresh-cache >/dev/null
```

Полный список путей — в `vercel.json` → `crons`.

## Обновление

```bash
cd /opt/haulz/app && sudo git pull && sudo npm ci && sudo systemctl restart haulz-api
```

## Статика haulz.ru

Фронт на **haulz.ru** (Caddy/nginx) не обслуживает `POST /api/*` — только **api.haulz.ru**.

При сборке для VPS можно явно задать:

```bash
VITE_API_ORIGIN=https://api.haulz.ru npm run build
```

В актуальных сборках `main.tsx` сам перенаправляет `/api/*` с `haulz.ru` на `api.haulz.ru`, если `VITE_API_ORIGIN` не задан.
