# Чеклист split API + Cron VPS

Выполняйте по порядку. Код и скрипты — в `deploy/` после `git pull origin main`.

## A. Подготовка API-VPS (72.56.36.185)

```bash
ssh root@72.56.36.185
crontab -l > /root/crontab-backup-$(date +%F).txt
cp /opt/haulz/.env /root/.env.backup-$(date +%F)
cd /opt/haulz/app && git pull origin main
```

## B. Создать cron-VPS (Timeweb)

- 4 GB RAM, Ubuntu 22/24, тот же регион что Postgres
- Записать **NEW_CRON_IP**

## C. Установка cron-VPS

```bash
ssh root@NEW_CRON_IP
scp root@72.56.36.185:/opt/haulz/.env /opt/haulz/.env   # или с Mac
mkdir -p /opt/haulz && git clone https://github.com/mannerdorf/mini_app.git /opt/haulz/app
cd /opt/haulz/app && git checkout main && bash deploy/setup-cron-vps.sh
```

## D. Postgres whitelist (Timeweb панель)

- DBaaS → доступ → добавить **NEW_CRON_IP**
- На cron-VPS: `source /opt/haulz/.env && psql "$DATABASE_URL" -c 'select 1'`

## E. Smoke-тесты (cron-VPS, crontab ещё на API)

```bash
bash /opt/haulz/app/deploy/test-cron-smoke.sh
```

## F. Cutover

**1. Cron-VPS** — включить crontab:

```bash
bash /opt/haulz/app/deploy/cutover-cron-enable.sh
```

**2. API-VPS** — убрать cron, nginx deny:

```bash
bash /opt/haulz/app/deploy/cutover-api-remove-cron.sh
```

## G. Мониторинг 48ч

```bash
# API-VPS
bash /opt/haulz/app/deploy/monitor-vps-split.sh api

# Cron-VPS
bash /opt/haulz/app/deploy/monitor-vps-split.sh cron
```

## Откат

```bash
# Cron-VPS
crontab -r && systemctl stop haulz-cron

# API-VPS
crontab /root/crontab-before-split-*.txt
systemctl restart haulz-api
```
