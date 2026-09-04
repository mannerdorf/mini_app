/** Убирает переносы строк и пробелы — 1С часто отдаёт base64 с CRLF, browser atob() падает. */
export function normalizeBase64Payload(raw: string): string {
  return String(raw ?? "").replace(/\s/g, "");
}

/** Декодирует base64 из ответа GetFile/download в Uint8Array. */
export function decodeBase64Payload(raw: string): Uint8Array {
  const normalized = normalizeBase64Payload(raw);
  if (!normalized) {
    throw new Error("Empty document payload");
  }
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("Invalid base64 document payload");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
