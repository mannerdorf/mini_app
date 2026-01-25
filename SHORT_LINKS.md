# Сервис коротких ссылок (dub.sh интеграция)

Интеграция функциональности сокращения ссылок для документов в текущий проект.

## API Endpoints

### 1. Создание короткой ссылки (общий)

**POST** `/api/shorten`

```json
{
  "url": "https://example.com/very/long/url"
}
```

**Ответ:**
```json
{
  "shortUrl": "https://your-domain.com/api/s/abc12345",
  "slug": "abc12345",
  "originalUrl": "https://example.com/very/long/url"
}
```

### 2. Редирект с короткой ссылки

**GET** `/api/s/{slug}`

Автоматически редиректит на оригинальный URL.

### 3. Создание короткой ссылки для документа (с токеном)

**POST** `/api/shorten-doc`

```json
{
  "login": "user@example.com",
  "password": "password123",
  "metod": "ЭР",
  "number": "12345"
}
```

**Ответ:**
```json
{
  "shortUrl": "https://your-domain.com/api/doc/abc123...",
  "token": "abc123..."
}
```

**Важно:** Токен действителен 1 час и одноразовый (удаляется после использования).

### 4. Скачивание документа по токену

**GET** `/api/doc/{token}`

Автоматически скачивает PDF документ. Токен удаляется после использования.

### 5. Короткая ссылка на документ (открывает мини-апп)

**GET** `/api/doc-short?metod=ЭР&number=12345`

Редиректит на мини-апп с параметрами для скачивания документа. Используется в MAX боте.

## Использование в MAX боте

В `api/max-webhook.ts` короткие ссылки создаются автоматически:

```typescript
const docUrl = (metod: string) => 
  `${appDomain}/api/doc-short?metod=${encodeURIComponent(metod)}&number=${encodeURIComponent(cargoNumber)}`;
```

Кнопки в боте используют эти короткие ссылки вместо длинных URL с параметрами авторизации.

## Хранилище

⚠️ **Важно для Vercel:** Сейчас используется **in-memory хранилище** (Map). Это означает:

- ✅ Работает без дополнительной настройки
- ✅ Быстро для тестирования
- ❌ **Данные теряются при каждом cold start** (serverless functions stateless)
- ❌ **Не работает надежно в production** на Vercel (каждый запрос может попасть на другой инстанс)
- ❌ Короткие ссылки могут не работать после перезапуска функции

### ⚠️ Для production на Vercel обязательно нужно использовать внешнее хранилище!

### Для production рекомендуется:

1. **Vercel KV** (если используешь Vercel)
2. **Upstash Redis**
3. **PostgreSQL** с таблицей `short_links`

Пример миграции на Vercel KV:

```typescript
import { kv } from '@vercel/kv';

// Сохранение
await kv.set(`short:${slug}`, url, { ex: 2592000 }); // 30 дней

// Получение
const url = await kv.get(`short:${slug}`);
```

## Очистка старых записей

- **Общие ссылки**: автоматически удаляются через 30 дней
- **Токены документов**: автоматически удаляются через 1 час
- Очистка запускается каждые 10 минут (для токенов) и 7 дней (для общих ссылок)

## Примеры использования

### Создание короткой ссылки для документа

```bash
curl -X POST https://your-domain.com/api/shorten-doc \
  -H "Content-Type: application/json" \
  -d '{
    "login": "user@example.com",
    "password": "pass123",
    "metod": "УПД",
    "number": "000107984"
  }'
```

### Создание общей короткой ссылки

```bash
curl -X POST https://your-domain.com/api/shorten \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://very-long-url.com/path/to/resource"
  }'
```

## Безопасность

- Токены документов одноразовые (удаляются после использования)
- Токены действительны только 1 час
- Login/password не передаются в URL коротких ссылок
- Для документов используется временный токен вместо прямых параметров авторизации
