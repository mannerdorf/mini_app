# Настройка Upstash Redis для коротких ссылок

## Проблема

In-memory хранилище (Map) не работает на Vercel из-за stateless nature serverless functions. Каждый запрос может попасть на другой инстанс, и данные теряются.

## Решение: Upstash Redis

Upstash Redis — это serverless Redis с бесплатным tier, который идеально подходит для Vercel.

## Шаг 1: Создай аккаунт Upstash

1. Зайди на [upstash.com](https://upstash.com)
2. Зарегистрируйся (можно через GitHub)
3. Создай новый Redis database:
   - Нажми **"Create Database"**
   - Выбери регион (ближайший к твоему Vercel проекту)
   - Выбери **"Global"** тип (для лучшей производительности)
   - Нажми **"Create"**

## Шаг 2: Получи credentials

После создания базы данных:

1. Нажми на созданную базу данных
2. Скопируй:
   - **UPSTASH_REDIS_REST_URL** (например: `https://xxx.upstash.io`)
   - **UPSTASH_REDIS_REST_TOKEN** (длинная строка токена)

## Шаг 3: Добавь в Vercel Environment Variables

1. Зайди в **Vercel Dashboard** → твой проект → **Settings** → **Environment Variables**
2. Добавь две переменные:
   - **Name**: `UPSTASH_REDIS_REST_URL`
     - **Value**: `<твой-URL-из-Upstash>`
     - **Environment**: Production, Preview, Development (все)
   
   - **Name**: `UPSTASH_REDIS_REST_TOKEN`
     - **Value**: `<твой-токен-из-Upstash>`
     - **Environment**: Production, Preview, Development (все)

3. Сохрани и **передеплой проект**

## Шаг 4: Проверка

После деплоя короткие ссылки должны работать:

```bash
# Создать короткую ссылку
curl -X POST https://your-domain.com/api/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'

# Использовать короткую ссылку (должен быть редирект)
curl -I https://your-domain.com/api/s/abc12345
```

## Бесплатный tier Upstash

- **10,000 команд в день** — достаточно для большинства случаев
- **256 MB storage** — хватит на миллионы коротких ссылок
- **Global replication** — низкая latency по всему миру

## Fallback

Если Redis не настроен, код автоматически использует in-memory хранилище (но данные не сохраняются между запросами). Это полезно для разработки, но не для production.

## Альтернативы

Если не хочешь использовать Upstash, можно использовать:

1. **Vercel KV** (если доступен в твоем плане)
2. **PostgreSQL** (через Vercel Postgres или внешний провайдер)
3. **MongoDB Atlas** (бесплатный tier)

Но Upstash Redis — самый простой и быстрый вариант для этой задачи.
