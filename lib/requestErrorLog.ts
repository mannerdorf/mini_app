import type { VercelRequest, VercelResponse } from "@vercel/node";

function getPath(req: VercelRequest): string {
  const u = (req as { url?: string; path?: string }).url ?? (req as { path?: string }).path;
  if (typeof u === "string" && u.length > 0) return u.length > 512 ? u.slice(0, 512) : u;
  return "/";
}

function getMessage(body: unknown): string | null {
  if (body == null) return null;
  if (typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string")
    return (body as { error: string }).error;
  if (typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string")
    return (body as { message: string }).message;
  return null;
}

/**
 * Пишет в request_error_log запрос, завершившийся с ошибкой (4xx/5xx).
 * Вызывается без await, чтобы не задерживать ответ.
 */
export function logRequestError(
  req: VercelRequest,
  statusCode: number,
  body: unknown
): void {
  if (statusCode < 400) return;
  const path = getPath(req);
  const method = (req.method ?? "GET").toUpperCase();
  const errorMessage = getMessage(body);
  const details = body != null && typeof body === "object" ? (body as Record<string, unknown>) : { body: body };
  import("../api/_db.js")
    .then(({ getPool }) => getPool())
    .then((pool) =>
      pool.query(
        `INSERT INTO request_error_log (path, method, status_code, error_message, details) VALUES ($1, $2, $3, $4, $5)`,
        [path, method, statusCode, errorMessage, JSON.stringify(details)]
      )
    )
    .catch((e) => console.error("request_error_log write error:", e));
}

type Handler = (req: VercelRequest, res: VercelResponse) => void | Promise<void>;

/**
 * Оборачивает API-обработчик: при ответе с кодом 4xx/5xx пишет запись в request_error_log.
 */
export function withErrorLog(handler: Handler): Handler {
  return async function wrapped(req: VercelRequest, res: VercelResponse) {
    let statusCode = 200;
    const origStatus = res.status.bind(res);
    const origJson = res.json.bind(res);
    const origSend = res.send.bind(res);

    res.status = function (code: number) {
      statusCode = code;
      return origStatus(code);
    };

    res.json = function (body: unknown) {
      if (statusCode >= 400) logRequestError(req, statusCode, body);
      return origJson(body);
    };

    res.send = function (body: unknown) {
      if (statusCode >= 400) {
        let parsed: unknown = body;
        if (typeof body === "string") {
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = { body };
          }
        }
        logRequestError(req, statusCode, parsed);
      }
      return origSend(body);
    };

    return handler(req, res);
  };
}
