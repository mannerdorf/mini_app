/** Сырой статус ЭДО из ответа GETdogovors / GETsverki (1С / Диадок). */
const EDO_STATUS_KEYS = [
  "RecipientResponseStatus",
  "recipientResponseStatus",
  "DDRecipientResponseStatus",
  "ddRecipientResponseStatus",
  "EdoStatus",
  "edoStatus",
  "EdoState",
  "EDO",
  "StatusEDO",
  "ЭДО",
  "DocumentStatus",
  "documentStatus",
] as const;

export function pickCachedDocumentEdoRawFromData(data: unknown): string {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const obj = data as Record<string, unknown>;
  for (const key of EDO_STATUS_KEYS) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}
