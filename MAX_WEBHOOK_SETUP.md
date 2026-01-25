# Настройка MAX Bot Webhook

## Шаг 1: Получи токен бота

1. Зайди на [dev.max.ru](https://dev.max.ru) или в настройки бота в MAX
2. Скопируй **токен бота** (выглядит примерно как `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

## Шаг 2: Добавь токен в Vercel Environment Variables

1. Зайди в **Vercel Dashboard** → твой проект → **Settings** → **Environment Variables**
2. Добавь переменную:
   - **Name**: `MAX_BOT_TOKEN`
   - **Value**: `<твой-токен-бота>`
   - **Environment**: Production, Preview, Development (все)
3. Сохрани и **передеплой проект** (чтобы переменная применилась)

## Шаг 3: Узнай URL твоего webhook

После деплоя на Vercel твой webhook будет доступен по адресу:
```
https://<твой-vercel-домен>/api/max-webhook
```

Например:
- `https://haulz-app.vercel.app/api/max-webhook`
- или твой кастомный домен: `https://app.haulz.pro/api/max-webhook`

## Шаг 4: Зарегистрируй webhook в MAX

### ✅ Вариант A: Через Vercel Endpoint (САМЫЙ ПРОСТОЙ!)

После деплоя на Vercel:

1. **Открой в браузере** (GET запрос):
   ```
   https://<твой-vercel-домен>/api/register-max-webhook
   ```

   Или через curl:
   ```bash
   curl https://<твой-vercel-домен>/api/register-max-webhook
   ```

2. Endpoint **автоматически**:
   - Возьмёт `MAX_BOT_TOKEN` из Vercel Environment Variables
   - Определит URL твоего webhook на основе Vercel домена
   - Зарегистрирует webhook в MAX

3. Если нужно указать другой URL, отправь POST:
   ```bash
   curl -X POST https://<твой-домен>/api/register-max-webhook \
     -H "Content-Type: application/json" \
     -d '{"url": "https://другой-домен/api/max-webhook"}'
   ```

### Вариант B: Через MAX API напрямую

Используй `curl` или Postman:

```bash
curl -X POST https://platform-api.max.ru/subscriptions \
  -H "Authorization: <твой-токен-бота>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<твой-домен>/api/max-webhook",
    "events": ["message"]
  }'
```

### Вариант C: Через интерфейс MAX (если доступен)

1. Зайди в настройки бота на [dev.max.ru](https://dev.max.ru)
2. Найди раздел **"Webhooks"** или **"Подписки"**
3. Укажи URL: `https://<твой-домен>/api/max-webhook`
4. Выбери события: `message`
5. Сохрани

## Шаг 5: Опционально — добавь секрет для безопасности

1. В Vercel Environment Variables добавь:
   - **Name**: `MAX_WEBHOOK_SECRET`
   - **Value**: `<случайная-строка>` (например, сгенерируй через `openssl rand -hex 32`)
2. При регистрации webhook в MAX передай этот секрет в заголовке `x-haulz-secret`

## Проверка работы

1. Открой бота в MAX: `https://max.ru/id9706037094_bot`
2. Напиши боту любое сообщение
3. Бот должен ответить: "Добрый день! Напишите, пожалуйста, ваш вопрос — мы поможем."

Если открыть бота с payload (например, из мини-аппа):
```
https://max.ru/id9706037094_bot?startapp=haulz_perevozka_12345
```

Бот должен ответить с кнопками документов (ЭР, СЧЕТ, УПД, АПП).

## Отладка

Если webhook не работает:

1. **Проверь логи Vercel**: Vercel Dashboard → проект → **Functions** → `api/max-webhook` → **Logs**
2. **Проверь, что токен правильный**: в логах не должно быть `MAX_BOT_TOKEN is not configured`
3. **Проверь URL**: webhook должен быть доступен по HTTPS и возвращать 200 OK
4. **Проверь формат payload**: MAX может отправлять updates в разном формате — код в `api/max-webhook.ts` обрабатывает несколько вариантов

## Структура файлов

- `api/max-webhook.ts` — основной webhook, который получает события от MAX
- `api/maxBot.ts` — утилиты для работы с MAX API (отправка сообщений)
- `api/register-max-webhook.ts` — утилита для регистрации webhook (опционально)
