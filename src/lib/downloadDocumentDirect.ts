import { postDownloadDocument } from "../api/client/documents";
import { downloadBase64File } from "../utils";
import { buildDownloadRequestBody } from "./downloadRequestBody";
import type { AuthData } from "../types";

export type DownloadDocumentParams = {
  metod: string;
  number: string;
  dateDoc?: string | null;
  dateDog?: string | null;
  inn?: string | null;
};

/** Скачать документ через POST /api/download → Share / «Сохранить» (как Акт сверки). */
export async function downloadDocumentDirect(
  auth: AuthData,
  params: DownloadDocumentParams,
): Promise<void> {
  const body = buildDownloadRequestBody(auth, {
    metod: params.metod,
    number: params.number,
    ...(params.dateDoc ? { dateDoc: params.dateDoc } : {}),
    ...(params.dateDog ? { dateDog: params.dateDog } : {}),
    ...(params.inn ? { inn: params.inn } : {}),
  });
  const data = await postDownloadDocument(body);
  await downloadBase64File({
    data: String(data.data),
    name: data?.name || `${params.metod}_${params.number}.pdf`,
    isHtml: Boolean(data?.isHtml),
  });
}

/** Формат dateDoc для API: YYYY-MM-DDTHH:MM:SS (как в актах сверки). */
export function formatDateDocForDownloadApi(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T00:00:00`;
  const ruMatch = s.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (ruMatch) return `${ruMatch[3]}-${ruMatch[2]}-${ruMatch[1]}T00:00:00`;
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}T00:00:00`;
  }
  return null;
}
