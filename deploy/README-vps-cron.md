# Cron VPS (выделенный worker)

Фоновые задачи (`/api/cron/*`, notification poll) выполняются на **отдельном VPS**, не на `api.haulz.ru`.

Публичный API: [README-vps-api.md](./README-vps-api.md) (`72.56.36.185`).

## Схема

```
api.haulz.ru (VPS API)     → nginx → haulz-api :3000   → пользователи
cron VPS (новый)           → crontab → haulz-cron :3000 → localhost only
Оба                        → Timeweb Postgres + Upstash + 1C
```

Cron **не** вызывает `https://api.haulz.ru` — только `http://127.0.0.1:3000` через [`cron-call.sh`](./cron-call.sh).

## 1. Создать VPS

- Timeweb Cloud, тот же регион, что Postgres
- **4 GB RAM**, Ubuntu 22/24
- Публичный IP только для SSH (порт 3000 наружу не открывать)

## 2. Первичная установка

На **новом cron-VPS** (root):

```bash
bash -s < <(curl -fsSL https://raw.githubusercontent.com/mannerdorf/mini_app/main/deploy/setup-cron-vps.sh)
```

Или после `git clone`:

```bash
cd /opt/haulz/app
bash deploy/setup-cron-vps.sh
```

Перед запуском скопируйте `.env` с API-VPS:

```bash
scp root@72.56.36.185:/opt/haulz/.env root@NEW_CRON_IP:/opt/haulz/.env
chmod 600 /opt/haulz/.env
```

## 3. Postgres whitelist

В Timeweb Cloud DBaaS добавьте **IP cron-VPS** в whitelist (рядом с `72.56.36.185`).

Проверка:

```bash
source /opt/haulz/.env
psql "$DATABASE_URL" -c 'select 1'
bash deploy/test-cron-smoke.sh
```

## 4. systemd

```bash
cp /opt/haulz/app/deploy/haulz-cron.service /etc/systemd/system/
cp /opt/haulz/app/deploy/cron-call.sh /opt/haulz/cron-call.sh
chmod +x /opt/haulz/cron-call.sh
systemctl daemon-reload
systemctl enable --now haulz-cron
curl -fsS http://127.0.0.1:3000/health
```

## 5. Crontab (после smoke-тестов)

```bash
cp /opt/haulz/app/deploy/crontab.haulz-cron.example /root/crontab-haulz-cron.txt
crontab /root/crontab-haulz-cron.txt
crontab -l
```

Затем на **API-VPS** убрать cache cron (см. [`cutover-api-remove-cron.sh`](./cutover-api-remove-cron.sh)).

## 6. Обновление кода

```bash
cd /opt/haulz/app && bash deploy/vps-sync-cron.sh
```

**Миграции БД** — только на API-VPS (`deploy/vps-sync-main.sh`).

## 7. Firewall

```bash
ufw allow OpenSSH
ufw enable
# порт 3000 не открывать
```

## 8. Мониторинг

```bash
bash /opt/haulz/app/deploy/monitor-vps-split.sh cron
journalctl -u haulz-cron -f
```

## Откат

1. `crontab -r` на cron-VPS
2. На API-VPS: восстановить `/root/crontab-before-split.txt`
3. `systemctl stop haulz-cron` на cron-VPS

## Скрипты

| Скрипт | Где запускать |
|--------|----------------|
| `setup-cron-vps.sh` | cron-VPS, первичная установка |
| `vps-sync-cron.sh` | cron-VPS, деплой |
| `test-cron-smoke.sh` | cron-VPS, ручные проверки |
| `cutover-cron-enable.sh` | cron-VPS, включить crontab |
| `cutover-api-remove-cron.sh` | API-VPS, убрать cron + nginx deny |
| `monitor-vps-split.sh` | оба VPS |
