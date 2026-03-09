# Marinesia API: переменные окружения

Быстрый поиск судна через Marinesia — lightweight maritime AIS API (Free / Premium).

## Получение API-ключа

1. **Портал:** https://marinesia.com/
2. **Документация:** https://docs.marinesia.com/
3. Создайте аккаунт на Marinesia Portal.
4. **Free API Key** — доступен сразу на странице Overview (1 запрос / 30 мин, только последняя позиция).
5. **Premium API Key** — после оплаты (5 запросов/мин, исторические данные, bulk).

## Настройка в Vercel

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная           | Описание                             |
|----------------------|--------------------------------------|
| `MARINESIA_API_KEY`  | API-ключ от marinesia.com. Secret.   |

После добавления переменной сделайте **Redeploy** проекта.

## Использование

- **Быстрый поиск (Marinesia)** — разовый REST-запрос последней позиции по MMSI.
- Глобальное покрытие AIS.
- Free tier: 1 запрос в 30 минут.
- Premium: 5 запросов в минуту, исторические данные.
