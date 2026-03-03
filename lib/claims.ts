export const CLAIM_STATUSES = [
  "draft",
  "new",
  "under_review",
  "waiting_docs",
  "in_progress",
  "awaiting_leader",
  "sent_to_accounting",
  "approved",
  "rejected",
  "paid",
  "offset",
  "closed",
] as const;

export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_STATUS_LABELS: Record<ClaimStatus, string> = {
  draft: "Черновик",
  new: "Новая",
  under_review: "На рассмотрении",
  waiting_docs: "Ожидает документы",
  in_progress: "В работе",
  awaiting_leader: "Ожидает решения руководителя",
  sent_to_accounting: "Передана в бухгалтерию",
  approved: "Удовлетворена",
  rejected: "Отказ",
  paid: "Выплачено",
  offset: "Зачтено",
  closed: "Закрыта",
};

export const CLAIM_TYPES = ["cargo_damage", "quantity_mismatch", "cargo_loss", "other"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === "string" && (CLAIM_STATUSES as readonly string[]).includes(value);
}

export function isClaimType(value: unknown): value is ClaimType {
  return typeof value === "string" && (CLAIM_TYPES as readonly string[]).includes(value);
}

export function decodeBase64File(raw: string): Buffer {
  const source = String(raw || "").trim();
  const cleaned = source.includes(",") ? source.slice(source.indexOf(",") + 1) : source;
  return Buffer.from(cleaned, "base64");
}

export function parseMoney(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}
