import type { VercelRequest, VercelResponse } from "@vercel/node";
import { respondCorsPreflight } from "./cors.js";

export type ApiHandler = (
  req: VercelRequest,
  res: VercelResponse
) => void | VercelResponse | Promise<void | VercelResponse>;

export type WithApiHandlerOptions = {
  methods: string | string[];
  /** По умолчанию CORS preflight включён */
  cors?: boolean;
};

/**
 * Обёртка для serverless handlers: CORS OPTIONS + проверка метода.
 */
export function withApiHandler(
  options: WithApiHandlerOptions,
  handler: ApiHandler
): ApiHandler {
  const allowed = new Set(
    (Array.isArray(options.methods) ? options.methods : [options.methods]).map((m) => m.toUpperCase())
  );
  const useCors = options.cors !== false;

  return async (req, res) => {
    if (useCors && respondCorsPreflight(req, res)) return;

    const method = (req.method || "GET").toUpperCase();
    if (!allowed.has(method)) {
      res.setHeader("Allow", [...allowed].join(", "));
      return res.status(405).json({ error: "Method not allowed" });
    }

    return handler(req, res);
  };
}
