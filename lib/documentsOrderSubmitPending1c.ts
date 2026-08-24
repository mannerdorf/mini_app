import type { Pool } from "pg";
import { setDraftStatusByManager, type HaulzCalcDraftRow } from "./haulzCalculator/calculatorDraftAgree.js";
import { uploadZayavkaTo1c, type ZayavkaUploadPayload } from "./post1cZayavkaUpload.js";
import { resolveZayavkaPayloadForPendingOrder } from "./documentsOrderPending1c.js";
import { type PendingOrderDbRow } from "./pendingOrderRequests.js";

export type SubmitPendingDocumentsOrderTo1cResult =
  | {
      ok: true;
      status: number;
      nomerZayavki: string | null;
      request: ZayavkaUploadPayload;
      upstream: unknown;
      draft: HaulzCalcDraftRow;
    }
  | {
      ok: false;
      status: number;
      error: string;
      request?: ZayavkaUploadPayload;
      upstream?: unknown;
      nomerZayavki?: string | null;
    };

export async function submitPendingDocumentsOrderTo1c(
  pool: Pool,
  draftId: number,
): Promise<SubmitPendingDocumentsOrderTo1cResult> {
  const { rows: draftRows } = await pool.query<{ id: number; status: string; nomer_zayavki: string | null }>(
    `SELECT id, status, nomer_zayavki FROM haulz_calc_drafts WHERE id = $1 AND status <> 'draft'`,
    [draftId],
  );
  const draftMeta = draftRows[0];
  if (!draftMeta) {
    return { ok: false, status: 404, error: "Заявка не найдена" };
  }
  if (draftMeta.status !== "agreed") {
    return {
      ok: false,
      status: 400,
      error: "Отправка в 1С доступна только после статуса «Согласовано»",
    };
  }

  const nomer = String(draftMeta.nomer_zayavki ?? "").trim();
  if (!nomer) {
    return { ok: false, status: 400, error: "У заявки нет номера для отправки в 1С" };
  }

  const { rows: pendingRows } = await pool.query<PendingOrderDbRow>(
    `SELECT id, login, inn, punkt_otpravki, punkt_naznacheniya, nomer_zayavki, data_zabora, table_rows, created_at
     FROM pending_order_requests
     WHERE nomer_zayavki = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [nomer],
  );
  const pending = pendingRows[0];
  if (!pending) {
    return { ok: false, status: 404, error: "Данные заявки не найдены в очереди ЛК" };
  }

  const request = await resolveZayavkaPayloadForPendingOrder(pool, pending);
  if (!request) {
    return { ok: false, status: 400, error: "Не удалось собрать JSON заявки для 1С" };
  }

  const upload = await uploadZayavkaTo1c(request);
  if (!upload.ok) {
    return {
      ok: false,
      status: upload.status && upload.status >= 400 ? upload.status : 502,
      error: upload.error || "Ошибка загрузки в 1С",
      request,
      upstream: upload.raw ?? upload.responseText,
      nomerZayavki: null,
    };
  }

  const draft = await setDraftStatusByManager(pool, draftId, "submitted");
  if (!draft) {
    return {
      ok: false,
      status: 500,
      error: "Заявка отправлена в 1С, но не удалось обновить статус",
      request,
      upstream: upload.raw,
      nomerZayavki: upload.nomerZayavki ?? nomer,
    };
  }

  return {
    ok: true,
    status: upload.status,
    nomerZayavki: upload.nomerZayavki ?? nomer,
    request,
    upstream: upload.raw,
    draft,
  };
}
