export type EdoTone = "success" | "warning" | "danger" | "muted" | "info";

export type EdoStatusInfo = {
  raw: string;
  label: string;
  shortLabel: string;
  tone: EdoTone;
};

const EDO_STATUS_MAP: Record<string, Omit<EdoStatusInfo, "raw">> = {
  WaitingForRecipientSignature: {
    label: "Ожидает подписи получателя",
    shortLabel: "Ожидает подписи",
    tone: "warning",
  },
  RecipientResponseStatusAccepted: {
    label: "Принят получателем",
    shortLabel: "Принят",
    tone: "success",
  },
  RecipientResponseStatusSigned: {
    label: "Подписан получателем",
    shortLabel: "Подписан",
    tone: "success",
  },
  RecipientResponseStatusNotAcceptable: {
    label: "Не принят получателем",
    shortLabel: "Не принят",
    tone: "danger",
  },
  RecipientResponseStatusRejected: {
    label: "Отклонен получателем",
    shortLabel: "Отклонен",
    tone: "danger",
  },
  RecipientResponseStatusPartlySigned: {
    label: "Подписан частично",
    shortLabel: "Частично",
    tone: "info",
  },
};

const EMPTY_EDO: EdoStatusInfo = {
  raw: "",
  label: "Нет статуса ЭДО",
  shortLabel: "Нет статуса",
  tone: "muted",
};

export function getEdoStatusInfo(raw: unknown): EdoStatusInfo {
  const key = String(raw ?? "").trim();
  if (!key) return EMPTY_EDO;
  const mapped = EDO_STATUS_MAP[key];
  if (!mapped) {
    return {
      raw: key,
      label: key,
      shortLabel: key,
      tone: "info",
    };
  }
  return { raw: key, ...mapped };
}

function pickString(obj: any, keys: string[]): string {
  for (const key of keys) {
    const v = obj?.[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function getInvoiceEdoRawByDocLabel(item: any, docLabel: "ЭР" | "АПП" | "УПД" | "СЧЕТ" | "Реестр"): string {
  if (docLabel === "ЭР") {
    return pickString(item, [
      "DDRecipientResponseStatus_Raspiska",
      "ddRecipientResponseStatusRaspiska",
      "recipientResponseStatusRaspiska",
    ]);
  }
  if (docLabel === "АПП") {
    return pickString(item, [
      "DDRecipientResponseStatus_APP",
      "ddRecipientResponseStatusAPP",
      "recipientResponseStatusAPP",
    ]);
  }
  if (docLabel === "УПД") {
    return pickString(item, [
      "DDRecipientResponseStatus_UPD",
      "ddRecipientResponseStatusUPD",
      "recipientResponseStatusUPD",
    ]);
  }
  if (docLabel === "СЧЕТ") {
    return pickString(item, [
      "DDRecipientResponseStatus_bill",
      "ddRecipientResponseStatusBill",
      "recipientResponseStatusBill",
    ]);
  }
  return "";
}

export function getInvoiceEdoInfoByDocLabel(
  item: any,
  docLabel: "ЭР" | "АПП" | "УПД" | "СЧЕТ" | "Реестр",
): EdoStatusInfo {
  return getEdoStatusInfo(getInvoiceEdoRawByDocLabel(item, docLabel));
}

export function getInvoiceBillEdoInfo(item: any): EdoStatusInfo {
  return getInvoiceEdoInfoByDocLabel(item, "СЧЕТ");
}
