-- Проверка кэша после крона refresh-cache (каждые 15 мин).
--
-- Запуск из консоли:
--   psql "$DATABASE_URL" -f scripts/verify-cron.sql
--
-- Или выполнить запросы по блокам в любом SQL-клиенте (DBeaver, pgAdmin и т.п.).

-- 1. Время последнего обновления и количество записей во всех кэшах (в т.ч. справочник заказчиков)
SELECT
  'cache_perevozki' AS table_name,
  fetched_at,
  jsonb_array_length(data)::bigint AS records
FROM cache_perevozki WHERE id = 1
UNION ALL
SELECT
  'cache_invoices',
  fetched_at,
  jsonb_array_length(data)::bigint
FROM cache_invoices WHERE id = 1
UNION ALL
SELECT
  'cache_acts',
  fetched_at,
  jsonb_array_length(data)::bigint
FROM cache_acts WHERE id = 1
UNION ALL
SELECT
  'cache_customers' AS table_name,
  max(fetched_at) AS fetched_at,
  count(*) AS records
FROM cache_customers;

-- 2. Справочник заказчиков: всего записей, время обновления, с email
SELECT
  count(*) AS total,
  max(fetched_at) AS last_updated,
  count(*) FILTER (WHERE email IS NOT NULL AND trim(email) <> '') AS with_email
FROM cache_customers;

-- 3. Пример записей заказчиков (первые 5)
SELECT inn, customer_name, left(coalesce(email, ''), 40) AS email, fetched_at
FROM cache_customers
ORDER BY customer_name
LIMIT 5;

-- 4. Свежесть: все кэши обновлены не более 20 минут назад?
SELECT
  (SELECT max(fetched_at) FROM cache_perevozki) AS perevozki_at,
  (SELECT max(fetched_at) FROM cache_invoices) AS invoices_at,
  (SELECT max(fetched_at) FROM cache_acts) AS acts_at,
  (SELECT max(fetched_at) FROM cache_customers) AS customers_at,
  CASE
    WHEN (SELECT max(fetched_at) FROM cache_perevozki) > now() - interval '20 minutes'
     AND (SELECT max(fetched_at) FROM cache_customers) > now() - interval '20 minutes'
    THEN 'OK: кэш свежий'
    ELSE 'Внимание: кэш старше 20 мин или пуст'
  END AS status;
