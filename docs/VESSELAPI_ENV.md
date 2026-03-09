# VesselAPI: переменные окружения

Быстрый поиск судна через VesselAPI (платный сервис, real-time AIS).

## Получение API-ключа

1. **Регистрация:** https://dashboard.vesselapi.com/
2. **Документация:** https://vesselapi.com/docs/vessels
3. Создайте аккаунт, выберите тариф, сгенерируйте API-ключ в дашборде.

## Настройка в Vercel

В **Vercel → Project → Settings → Environment Variables** добавьте:

| Переменная        | Описание                                    |
|-------------------|---------------------------------------------|
| `VESSELAPI_API_KEY` | API-ключ из dashboard.vesselapi.com. Secret. |

После добавления переменной сделайте **Redeploy** проекта.

## Использование

- **Быстрый поиск (VesselAPI)** — REST-запрос по MMSI, глобальное покрытие ~675K судов.
- Платный сервис, лимиты зависят от тарифа.
