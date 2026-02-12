import crypto from "crypto";

const SALT_LEN = 16;
const KEY_LEN = 32;
const ITERATIONS = 100000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(password, salt, KEY_LEN);
  return `${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const hash = crypto.scryptSync(password, salt, KEY_LEN);
    const storedHash = Buffer.from(hashB64, "base64");
    return crypto.timingSafeEqual(hash, storedHash);
  } catch {
    return false;
  }
}

const CHARS =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";

export function generatePassword(length = 8): string {
  const buf = crypto.randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i++) {
    s += CHARS[buf[i]! % CHARS.length];
  }
  return s;
}
