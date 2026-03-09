# OpenShipData API: переменные окружения

Быстрый поиск судна (REST, без стрима) использует OpenShipData API от MarinePlan.

## Получение API-ключа

1. **Документация API:** https://marineplan.com/openshipdata-online-api-description/
2. **Запросить ключ:** напишите на **info@marineplan.nl** — попросите demo/API key для OpenShipData. Ключ в формате UUID.

## Настройка в Vercel

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная             | Описание                                  |
|------------------------|-------------------------------------------|
| `OPENSHIPDATA_API_KEY` | API-ключ от MarinePlan. Отметьте как Secret. |

После добавления переменной сделайте **Redeploy** проекта.

## Использование

- **Быстрый поиск (OpenShipData)** — разовый REST-запрос, зона Балтики. Мгновенный ответ без стрима и таймаута 60 сек.
- **Найти судно (AISstream)** — стрим в реальном времени, ограничение 60 сек.
