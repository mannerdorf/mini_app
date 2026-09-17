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

export class RequestBodyError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function requestBodyLimit(url: string): number {
  return new URL(url, "http://localhost").pathname.replace(/\/+$/, "") === "/api/pickup"
    ? 4 * 1024 * 1024 // Three JPEGs up to 900 KB each, base64 + JSON metadata.
    : 16 * 1024 * 1024;
}

export async function readRequestBody(req: IncomingMessage, options: { maxBytes?: number; timeoutMs?: number } = {}): Promise<unknown> {
  const method = (req.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD") return undefined;

  const maxBytes = options.maxBytes ?? requestBodyLimit(req.url || "/");
  if (Number(req.headers["content-length"]) > maxBytes)
    throw new RequestBodyError(413, "Размер запроса превышает допустимый предел");
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    let size = 0;
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", data); req.off("end", end); req.off("error", fail); req.off("aborted", aborted);
    };
    const fail = (error: Error) => { req.pause(); cleanup(); reject(error); };
    const data = (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBytes) { fail(new RequestBodyError(413, "Размер запроса превышает допустимый предел")); return; }
      chunks.push(buffer);
    };
    const end = () => { cleanup(); resolve(); };
    const aborted = () => fail(new RequestBodyError(400, "Загрузка запроса прервана"));
    const timer = setTimeout(() => fail(new RequestBodyError(408, "Истекло время загрузки запроса")), options.timeoutMs ?? 30_000);
    req.on("data", data); req.once("end", end); req.once("error", fail); req.once("aborted", aborted);
  });
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
  const query: Record<string, string | string[]> = Object.create(null);
  for (const key of new Set(url.searchParams.keys())) {
    const values = url.searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  vercelReq.query = query;
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
      if (res.headersSent || res.writableEnded || res.destroyed) return vercelRes;
      res.statusCode = code;
      return vercelRes;
    };
  }
  if (!vercelRes.json) {
    vercelRes.json = (data: unknown) => {
      if (res.writableEnded || res.destroyed) return vercelRes;
      if (!res.headersSent) res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify(data));
      return vercelRes;
    };
  }
  if (!vercelRes.send) {
    vercelRes.send = (data: unknown) => {
      if (res.writableEnded || res.destroyed) return vercelRes;
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
