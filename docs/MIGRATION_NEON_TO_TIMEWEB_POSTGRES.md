# Миграция Neon → PostgreSQL Timeweb Cloud

Runbook для проекта HAULZ: перенос production БД с Neon на managed PostgreSQL в Timeweb Cloud.

**API:** VPS `haulzbackend` (`72.56.36.185`)  
**Фронт:** Timeweb App Platform (`haulz.ru`)

---

## Требования проекта

| Требование | Зачем |
|------------|--------|
| PostgreSQL **15+** (лучше **16**) | совместимость с миграциями |
| Расширение **pgvector** | RAG / chat (`migrations/002_rag.sql`) |
| TLS | Timeweb DBaaS по умолчанию с SSL |
| Доступ с VPS | firewall: IP `72.56.36.185` |

Timeweb Cloud → **Базы данных** → PostgreSQL → в конфигурации можно включить **pgvector**.

---

## Варианты размещения

### A. Managed PostgreSQL Timeweb (рекомендуется)

- Отдельно от VPS, бэкапы, репликация
- Не делит 4 GB RAM VPS с Node API
- Подключение по внешнему хосту + SSL

### B. Postgres на том же VPS `haulzbackend`

- Проще сеть (`127.0.0.1`, `PGSSLMODE=disable`)
- Минус: RAM/CPU делятся с API и кронами

Ниже — **вариант A** (Timeweb DBaaS). Для B см. [MIGRATION_VPS_POSTGRES.md](./MIGRATION_VPS_POSTGRES.md) §1.2.

---

## Шаг 1. Создать кластер в Timeweb

1. [timeweb.cloud](https://timeweb.cloud) → проект **HAULZ**
2. **Базы данных** → **Создать** → **PostgreSQL**
3. Параметры:
   - Версия: **PostgreSQL 16**
   - Регион: **Россия** (рядом с VPS)
   - Размер: от **2 GB RAM** (зависит от объёма Neon; начните с минимума, масштабируете)
4. После создания — вкладка **Конфигурация** → **Расширения** → включить **`pgvector`**
5. **Сеть / доступ** — разрешить подключение с IP VPS: **`72.56.36.185`**
6. Скопировать **строку подключения** (host, port, user, password, database)

Пример формата:
```
postgresql://gen_user:PASSWORD@192.168.x.x:5432/default_db
```
Timeweb может выдать внутренний и внешний хост — для VPS нужен **внешний** (public).

---

## Шаг 2. Подготовка на VPS

```bash
ssh root@72.56.36.185
sudo apt update
sudo apt install -y postgresql-client
```

Проверка доступа к новой БД (подставьте URL из Timeweb):

```bash
export TIMEWEB_DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB?sslmode=require'
psql "$TIMEWEB_DATABASE_URL" -c "SELECT version();"
psql "$TIMEWEB_DATABASE_URL" -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Если `CREATE EXTENSION` падает — включите pgvector в панели Timeweb (шаг 1.4) и повторите.

---

## Шаг 3. Бэкап Neon

На машине с доступом к Neon (Mac или VPS). URL возьмите из Vercel env или Neon Dashboard:

```bash
export NEON_DATABASE_URL='postgresql://...@....neon.tech/neondb?sslmode=require'

pg_dump "$NEON_DATABASE_URL" \
  --no-owner --no-acl \
  -F c -f /tmp/haulz-neon.dump

ls -lh /tmp/haulz-neon.dump
```

> **Важно:** не коммитьте URL и дамп в git.

Если `pg_dump` с VPS к Neon не идёт — сделайте дамп с локального Mac и scp на VPS:
```bash
scp /tmp/haulz-neon.dump root@72.56.36.185:/tmp/
```

---

## Шаг 4. Восстановление в Timeweb

```bash
export TIMEWEB_DATABASE_URL='postgresql://USER:PASS@HOST:5432/DB?sslmode=require'

pg_restore \
  -d "$TIMEWEB_DATABASE_URL" \
  --no-owner --no-acl \
  --verbose \
  /tmp/haulz-neon.dump
```

Предупреждения вида «already exists» на пустой БД — обычно норм. Критичные ошибки — смотреть в конце вывода.

### Проверка данных

```bash
psql "$TIMEWEB_DATABASE_URL" -c "
  SELECT extname FROM pg_extension WHERE extname IN ('vector','plpgsql');
  SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public';
  SELECT relname FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 10;
"
```

Ожидаемо: extension `vector`, десятки таблиц, крупные `cache_*`, `registered_users` и т.д.

---

## Шаг 5. Переключить API на Timeweb

```bash
sudo nano /opt/haulz/.env
```

Заменить:
```bash
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB?sslmode=require
PGSSLMODE=require
```

Перезапуск:
```bash
sudo systemctl restart haulz-api
curl -sS http://127.0.0.1:3000/api/auth-config
/opt/haulz/cron-call.sh /api/cron/refresh-cache
```

Проверка приложения:
- логин на haulz.ru
- грузы / документы
- профиль

---

## Шаг 6. Обновить остальные env (после стабилизации)

| Где | Действие |
|-----|----------|
| Vercel (если ещё используется) | заменить `DATABASE_URL` или удалить, чтобы preview не писал в prod |
| Neon | **не удалять** 3–7 дней, держать как backup |
| Timeweb | настроить автобэкапы в панели |

---

## Откат

```bash
# вернуть старый Neon URL в /opt/haulz/.env
sudo systemctl restart haulz-api
```

---

## Частые проблемы

| Симптом | Решение |
|---------|---------|
| `connection refused` / timeout | IP `72.56.36.185` не в whitelist Timeweb DB |
| `extension "vector" does not exist` | включить pgvector в панели Timeweb |
| SSL error | `PGSSLMODE=require` в `.env` |
| пустые грузы после миграции | cron `refresh-cache` + проверить что API смотрит на новую БД |
| `password authentication failed` | скопировать пароль из панели Timeweb заново (спецсимволы URL-encode в DATABASE_URL) |

---

## Чеклист

- [ ] Кластер PostgreSQL 16 создан в Timeweb
- [ ] pgvector включён
- [ ] VPS IP в whitelist
- [ ] pg_dump Neon сделан
- [ ] pg_restore в Timeweb успешен
- [ ] `DATABASE_URL` + `PGSSLMODE=require` на VPS
- [ ] API + crons работают
- [ ] haulz.ru — логин, данные
- [ ] Neon оставлен как backup, потом отключён

---

## Связанные файлы

- [MIGRATION_VPS_POSTGRES.md](./MIGRATION_VPS_POSTGRES.md)
- [migrations-apply.md](./migrations-apply.md)
- [deploy/env.backend.example](../deploy/env.backend.example)
