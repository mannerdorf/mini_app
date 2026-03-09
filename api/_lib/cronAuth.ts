import type { VercelRequest } from "@vercel/node";

type CronAuthError = {
  status: number;
  error: string;
};

function getExpectedSecret(): string {
  return String(process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET || "").trim();
}

function getProvidedSecret(req: VercelRequest): string {
  const authHeader = req.headers.authorization;
  const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const querySecret = typeof req.query.secret === "string" ? req.query.secret : "";
  return String(bearer || querySecret || "").trim();
}

export function requireCronAuth(req: VercelRequest): CronAuthError | null {
  const expected = getExpectedSecret();
  if (!expected) {
    return { status: 503, error: "CRON_SECRET is not configured" };
  }
  const provided = getProvidedSecret(req);
  if (!provided || provided !== expected) {
    return { status: 401, error: "Unauthorized" };
  }
  return null;
}
