# Timeweb App Platform (haulz.ru статика)

## Деплой зависает после «Build succeeded»

Чаще всего платформа ждёт **health check**, который не проходит.

1. В панели приложения → **Настройки деплоя** → **Путь проверки состояния**: укажите `/health` (или оставьте пустым — в образе есть `HEALTHCHECK` на `/health`).
2. Убедитесь, что в Dockerfile есть `EXPOSE 80` (порт контейнера для nginx).
3. Отмените зависший деплой и запустите заново после пуша с `/health` в nginx.
4. Сравните настройки **main** и **staging**: разный путь health check или ветка — типичная причина «на main висит, на staging ок».

## Локальная проверка образа

```bash
docker build -t haulz-miniapp .
docker run --rm -p 8080:80 haulz-miniapp
curl -sS http://127.0.0.1:8080/health
```

Ожидается: `ok`
