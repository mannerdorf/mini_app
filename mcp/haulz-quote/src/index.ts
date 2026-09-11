#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_BASE = (process.env.HAULZ_PUBLIC_API_BASE || "https://haulz.space").replace(/\/$/, "");

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HAULZ API ${res.status}: ${text.slice(0, 400)}`);
  }
  return res.json() as Promise<T>;
}

const server = new McpServer({
  name: "haulz-quote",
  version: "1.0.0",
});

server.tool(
  "estimate_route_shipping",
  "Ориентировочный расчёт перевозки HAULZ между Москвой и Калининградом (склад—склад). direction: mow_kgd или kgd_mow.",
  {
    direction: z.enum(["mow_kgd", "kgd_mow"]),
    weight_kg: z.number().positive(),
    mode: z.enum(["ferry", "auto", "air"]).optional(),
    volume_m3: z.number().positive().optional(),
  },
  async ({ direction, weight_kg, mode, volume_m3 }) => {
    const params = new URLSearchParams({
      direction,
      weight_kg: String(weight_kg),
    });
    if (mode) params.set("mode", mode);
    if (volume_m3 != null) params.set("volume_m3", String(volume_m3));
    const data = await apiGet<{ estimate: Record<string, unknown> }>(`/api/public/v1/estimate?${params}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data.estimate, null, 2) }],
    };
  },
);

server.tool(
  "list_haulz_routes",
  "Список маршрутов HAULZ Москва ↔ Калининград, складов и режимов магистрали.",
  {},
  async () => {
    const data = await apiGet<Record<string, unknown>>("/api/public/v1/routes");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
  },
);

server.tool(
  "get_haulz_faq_snippet",
  "Краткий FAQ по перевозке HAULZ на выбранном направлении.",
  {
    direction: z.enum(["mow_kgd", "kgd_mow"]),
  },
  async ({ direction }) => {
    const data = await apiGet<{ routes: Array<{ direction: string; faq: Array<{ q: string; a: string }> }> }>(
      "/api/public/v1/routes",
    );
    const route = data.routes.find((r) => r.direction === direction);
    return {
      content: [{ type: "text", text: JSON.stringify(route?.faq ?? [], null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
