# Timeweb Cloud MCP в Cursor

Официальный сервер (актуальный): [timeweb-cloud/mcp](https://github.com/timeweb-cloud/mcp).

Репозиторий [timeweb-cloud/mcp-server](https://github.com/timeweb-cloud/mcp-server) (**устарел**) — локальный `npx timeweb-mcp-server`; для новых подключений используйте HTTP-эндпоинт ниже.

## 1. API-токен

1. [Панель Timeweb Cloud → API и Terraform](https://timeweb.cloud/my/api-keys)
2. Выпустите ключ с нужными правами (для HAULZ VPS достаточно чтения серверов; для деплоя приложений — права на Apps).
3. Токен **не коммитить** в git.

## 2. Конфиг в репозитории

В проекте уже есть `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "timeweb-cloud": {
      "url": "https://api.timeweb.cloud/api/v1/mcp/search",
      "headers": {
        "Authorization": "Bearer ${env:TIMEWEB_TOKEN}"
      }
    }
  }
}
```

## 3. Cursor Desktop (Mac / Windows / Linux)

1. Экспортируйте токен в окружение, из которого запускаете Cursor:
   ```bash
   export TIMEWEB_TOKEN="ваш-токен"
   ```
   Удобно добавить в `~/.zshrc` / `~/.bashrc` или в [1Password / Keychain + launch](https://cursor.com/docs/mcp).
2. Перезапустите Cursor (лучше из терминала: `cursor .`, если переменная только в shell).
3. **Settings → MCP** (или **Customize → MCPs**): сервер `timeweb-cloud` должен быть включён.
4. При ошибках: **Output → MCP Logs**.

### Быстрая установка (deeplink)

Кнопка «Установить в Cursor» в [README mcp](https://github.com/timeweb-cloud/mcp) подставит URL; замените `API_KEY_HERE` на свой токен в форме Cursor.

## 4. Cloud Agent

1. В настройках репозитория / Cloud Agent добавьте MCP **timeweb-cloud** (тот же URL), если интерфейс просит URL вручную.
2. Сохраните секрет **`TIMEWEB_TOKEN`** в секретах окружения Cursor (не в `.env` репозитория).
3. Убедитесь, что исходящий доступ к `api.timeweb.cloud` разрешён политикой окружения.

## 5. Как пользоваться

У модели доступны три «входных» инструмента: `search_tools` → `get_tool_definition` → `execute_tool`.

Примеры запросов:

- «Покажи мои серверы в Timeweb»
- «Создай floating IP в зоне …» (потребует **подтверждения** — см. ниже)

**Изменяющие операции** (`[WRITE]`, `[BILLABLE]`) выполняются в **два шага**: сначала `confirmation_required` и `operation_summary`, затем повтор с `confirm_token` после вашего «да».

Удаление ресурсов через MCP **недоступно** — только через панель Timeweb.

## 6. Связь с HAULZ VPS

Операции на `haulzbackend` (systemd, nginx, `/opt/haulz`) по-прежнему через SSH; MCP Timeweb удобен для облачных ресурсов (серверы, IP, БД, Apps, DNS). См. `.cursor/agents/haulz-vps-ops.md`.
