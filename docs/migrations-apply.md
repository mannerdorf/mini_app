# Применение миграций

Если функция «Паром» в разделе Документы → Отправки не работает и появляется ошибка  
«Таблица sendings_ferry не найдена», нужно применить миграции к базе данных.

## Миграции для паромов

1. **049_ferries.sql** — создаёт таблицу `ferries` (справочник паромов)
2. **050_sendings_ferry.sql** — создаёт таблицу `sendings_ferry` (привязка парома к отправке)

Порядок важен: 050 зависит от 049 (foreign key на `ferries.id`).

## Как применить

### Вариант 1: Vercel Postgres

1. Откройте [Vercel Dashboard](https://vercel.com) → проект → Storage → Postgres
2. Выберите вкладку «Query» (или «Query Editor»)
3. Выполните содержимое файлов в порядке:
   - `migrations/049_ferries.sql`
   - `migrations/050_sendings_ferry.sql`

### Вариант 2: psql

```bash
# Подключение (подставьте свои значения из Vercel или .env)
psql "postgres://user:password@host:port/database?sslmode=require"

# Выполнить миграции
\i migrations/049_ferries.sql
\i migrations/050_sendings_ferry.sql
```

### Вариант 3: run_all.sql

Если база пустая или нужны все миграции:

```bash
psql "postgresql://..." -f migrations/run_all.sql
```

## Проверка

После применения таблицы должны существовать:

```sql
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ferries');
SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sendings_ferry');
```

Обе должны вернуть `t` (true).
