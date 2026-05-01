import { createHash, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_RE = /^haulz_([a-f0-9]{12})_([a-f0-9]{64})$/i;

export function hashUserApiKeySecretPart(secretHex64: string): string {
  return createHash("sha256").update(String(secretHex64).toLowerCase(), "utf8").digest("hex");
}

export function verifyUserApiKeySecretPart(secretHex64: string, storedHashHex: string): boolean {
  try {
    const computed = Buffer.from(hashUserApiKeySecretPart(secretHex64), "hex");
    const stored = Buffer.from(String(storedHashHex).trim(), "hex");
    if (computed.length !== stored.length) return false;
    return timingSafeEqual(computed, stored);
  } catch {
    return false;
  }
}

export type GeneratedUserApiKey = { fullToken: string; publicId: string; secretHash: string };

/** Полный токен показывается один раз при создании. */
export function generateUserApiKey(): GeneratedUserApiKey {
  const publicId = randomBytes(6).toString("hex");
  const secretPart = randomBytes(32).toString("hex");
  const fullToken = `haulz_${publicId}_${secretPart}`;
  return { fullToken, publicId, secretHash: hashUserApiKeySecretPart(secretPart) };
}

export function parseUserApiBearerToken(bearer: string): { publicId: string; secretPart: string } | null {
  const m = String(bearer || "").trim().match(TOKEN_RE);
  if (!m) return null;
  return { publicId: m[1].toLowerCase(), secretPart: m[2].toLowerCase() };
}
