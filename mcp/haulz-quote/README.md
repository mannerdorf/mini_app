# HAULZ Quote MCP

MCP-сервер для ориентировочного расчёта перевозки **Москва ↔ Калининград** через Public API HAULZ.

## Tools

| Tool | Описание |
|------|----------|
| `estimate_route_shipping` | Расчёт по direction, weight_kg, mode |
| `list_haulz_routes` | Маршруты, склады, режимы |
| `get_haulz_faq_snippet` | FAQ по направлению |

## Setup

```bash
cd mcp/haulz-quote
npm install
npm run build
```

## Cursor / Claude Desktop config

```json
{
  "mcpServers": {
    "haulz-quote": {
      "command": "node",
      "args": ["/path/to/mini_app/mcp/haulz-quote/dist/index.js"],
      "env": {
        "HAULZ_PUBLIC_API_BASE": "https://haulz.space"
      }
    }
  }
}
```

## API

OpenAPI: https://haulz.space/openapi/public-quote.yaml
