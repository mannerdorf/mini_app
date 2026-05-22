import type { IncomingMessage, ServerResponse } from "node:http";
import type { VercelRequest, VercelResponse } from "@vercel/node";

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

export async function readRequestBody(req: IncomingMessage): Promise<unknown> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return undefined;

  const raw = Buffer.concat(chunks);
  const ct = String(req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return raw;
    }
  }
  return raw;
}

export function toVercelRequest(req: IncomingMessage, body: unknown): VercelRequest {
  const url = new URL(req.url || "/", "http://localhost");
  const vercelReq = req as VercelRequest;
  vercelReq.query = Object.fromEntries(url.searchParams.entries());
  vercelReq.body = body;
  vercelReq.cookies = parseCookies(req.headers.cookie);
  return vercelReq;
}

export function toVercelResponse(res: ServerResponse): VercelResponse {
  const vercelRes = res as VercelResponse & {
    status?: (code: number) => VercelResponse;
    json?: (data: unknown) => VercelResponse;
    send?: (data: unknown) => VercelResponse;
  };

  if (!vercelRes.status) {
    vercelRes.status = (code: number) => {
      res.statusCode = code;
      return vercelRes;
    };
  }
  if (!vercelRes.json) {
    vercelRes.json = (data: unknown) => {
      if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
      return vercelRes;
    };
  }
  if (!vercelRes.send) {
    vercelRes.send = (data: unknown) => {
      if (data === undefined || data === null) {
        res.end();
        return vercelRes;
      }
      if (typeof data === "object" && !Buffer.isBuffer(data)) {
        return vercelRes.json!(data);
      }
      res.end(data as string | Buffer);
      return vercelRes;
    };
  }

  return vercelRes;
}
