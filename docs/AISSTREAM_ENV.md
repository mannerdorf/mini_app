# AISstream API: переменные окружения

Стрим судовых данных AIS (AISstream.io) используется через API `/api/ais-stream`.

## Получение API-ключа

1. Откройте [https://aisstream.io](https://aisstream.io)
2. Войдите (через GitHub или другой OAuth)
3. Перейдите в [API Keys](https://aisstream.io/apikeys)
4. Создайте новый ключ и скопируйте его

## Настройка в Vercel

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная         | Описание                                      |
|--------------------|-----------------------------------------------|
| `AISSTREAM_API_KEY`| API-ключ с aisstream.io. Отметьте как Secret. |

После добавления переменной сделайте **Redeploy** проекта.

## Использование

```
GET /api/ais-stream?mmsi=273257140&messageTypes=PositionReport,ShipStaticData
```

- **mmsi** (обязательно) — 9-значный номер судна. Поиск только в зоне Балтики (для укладывания в лимит 60 сек).
- **messageTypes** (опционально) — типы сообщений через запятую. По умолчанию: `PositionReport` (широта, долгота, курс).

Ответ — Server-Sent Events:

- `event: meta` — метаданные (request_id, bbox, messageTypes)
- `event: ais` — сообщения AIS (позиции, статика и т.д.)
- `event: error` — ошибки
- `event: info` — служебные сообщения (например, таймаут)
