import crypto from "crypto";

const ALG = "sha256";
const TTL_MS = 8 * 60 * 60 * 1000; // 8 hours

/** Один и тот же секрет для создания и проверки токена. Задайте ADMIN_TOKEN_SECRET в Vercel (одинаково везде). */
function getSecret(): string {
  return process.env.ADMIN_TOKEN_SECRET || "haulz-admin";
}

export function createAdminToken(): string {
  const payload = { admin: true, exp: Date.now() + TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac(ALG, getSecret()).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
}

export function verifyAdminToken(token: string | undefined): boolean {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sig] = parts;
  const expectedSig = crypto.createHmac(ALG, getSecret()).update(payloadB64).digest("base64url");
  if (sig !== expectedSig) return false;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (!payload.admin || !payload.exp) return false;
    // Допуск 2 мин на рассинхрон времени между инстансами (Vercel serverless)
    const now = Date.now();
    if (payload.exp < now - 2 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

export function getAdminTokenFromRequest(req: { headers?: Record<string, string | string[] | undefined> }): string | undefined {
  const auth = req.headers?.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return undefined;
}
