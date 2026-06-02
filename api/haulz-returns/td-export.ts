import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getPool } from "../_db.js";
import { initRequestContext, logError } from "../_lib/observability.js";
import {
  assertJobOwner,
  pgTableExists,
  resolveHaulzReturnsAccess,
} from "../_haulzReturns.js";
import { carrierFromDbRow } from "../../lib/haulzReturns/carriers.js";
import type { TdDocType, TdDraft, TdPrepared } from "../../lib/haulzReturns/tdDocuments/index.js";
import { mergeTdPrepared } from "../../lib/haulzReturns/tdMetaMerge.js";
import { loadLatestWorkbook } from "../../lib/haulzReturns/workbookStorage.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const ctx = initRequestContext(req, res, "haulz_returns_td_export");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", request_id: ctx.requestId });
  }

  const access = await resolveHaulzReturnsAccess(req, req.body);
  if (!access) {
    return res.status(401).json({ error: "Нет доступа", request_id: ctx.requestId });
  }

  const jobId = Number(req.body?.jobId);
  const docType = String(req.body?.docType ?? "all") as TdDocType;
  const draft = req.body?.draft as TdDraft | undefined;
  const bodyPrepared = req.body?.tdPrepared as TdPrepared | undefined;
  const ulNumber = String(req.body?.ulNumber ?? "").trim() || undefined;

  if (!Number.isFinite(jobId) || jobId <= 0) {
    return res.status(400).json({ error: "Укажите jobId", request_id: ctx.requestId });
  }

  const pool = getPool();
  if (!(await pgTableExists(pool, "haulz_returns_workbooks"))) {
    return res.status(503).json({
      error: "Выполните миграцию migrations/080_haulz_returns.sql",
      request_id: ctx.requestId,
    });
  }
  if (!(await assertJobOwner(pool, jobId, access.loginKey))) {
    return res.status(404).json({ error: "Сессия не найдена", request_id: ctx.requestId });
  }

  try {
    const workbook = await loadLatestWorkbook(pool, jobId);
    if (!workbook) {
      return res.status(404).json({ error: "Workbook не найден", request_id: ctx.requestId });
    }

    const { exportTdDocuments, exportTdZip } = await import("../../lib/haulzReturns/tdDocuments/index.js");
    const { resolveTdExportDraft } = await import("../../lib/haulzReturns/tdDocuments/resolveTdDraft.js");

    const carriersById = new Map<string, import("../../lib/haulzReturns/carriers.js").HaulzCarrier>();
    if (await pgTableExists(pool, "haulz_carriers")) {
      const { rows } = await pool.query<{
        id: string;
        name: string;
        legal_address: string;
        inn: string;
        kpp: string;
        loading_address: string;
        unloading_address: string;
        created_at: string;
        updated_at: string;
      }>(
        `select id::text, name, legal_address, inn, kpp, loading_address, unloading_address, created_at, updated_at
         from haulz_carriers`,
      );
      for (const row of rows) carriersById.set(row.id, carrierFromDbRow(row));
    }

    const hasBodySnapshot =
      (bodyPrepared?.fixRows?.length ?? 0) > 0 || (bodyPrepared?.writeoffs?.length ?? 0) > 0;
    const tdPrepared =
      mergeTdPrepared(workbook.tdPrepared, hasBodySnapshot ? bodyPrepared : undefined, draft) ??
      workbook.tdPrepared;

    if (!tdPrepared) {
      return res.status(400).json({
        error: "Сначала нажмите «Подготовить ТД» на вкладке итог.",
        request_id: ctx.requestId,
      });
    }

    const ctxExport = {
      workbook: { ...workbook, tdDraft: draft ?? workbook.tdDraft, tdPrepared },
      carriersById,
      draft: draft ?? workbook.tdDraft ?? tdPrepared?.draft,
    };

    if (docType === "all") {
      const draftMerged = draft ?? workbook.tdDraft ?? tdPrepared?.draft;
      const { headerTd } = resolveTdExportDraft(
        { specification: draftMerged?.specification, proforma: draftMerged?.proforma },
        workbook,
      );
      const { tdAllDocumentsZipFileName } = await import("../../lib/haulzReturns/tdDocuments/fileNames.js");
      const zipName = tdAllDocumentsZipFileName(headerTd);
      const asciiName = zipName.replace(/[^\x20-\x7E]/g, "_").replace(/_+/g, "_") || "TD-documents.zip";
      const zip = await exportTdZip(ctxExport, tdPrepared);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
      );
      return res.status(200).send(zip);
    }

    const files = await exportTdDocuments(ctxExport, docType, tdPrepared, { ulNumber });
    if (files.length === 0) {
      const emptyMsg =
        docType === "poruchenie"
          ? "Нет поручений — перевозчик на всех УЛ «Холз» или не выбран"
          : "Нет документов для выгрузки";
      return res.status(404).json({ error: emptyMsg, request_id: ctx.requestId });
    }

    if (docType === "poruchenie" && files.length > 1) {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      for (const f of files) zip.file(f.name, f.buffer);
      const zipBuf = await zip.generateAsync({ type: "nodebuffer" });
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="Porucheniya.zip"; filename*=UTF-8''${encodeURIComponent("Поручения.zip")}`,
      );
      return res.status(200).send(zipBuf);
    }

    const file = files[0]!;
    const asciiName = file.name.replace(/[^\x20-\x7E]/g, "_").replace(/_+/g, "_") || "document.xlsx";
    res.setHeader("Content-Type", file.mime);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
    );
    return res.status(200).send(file.buffer);
  } catch (e) {
    logError(ctx, "haulz_returns_td_export_failed", e);
    const msg = (e as Error)?.message || "Ошибка генерации";
    return res.status(400).json({ error: msg, request_id: ctx.requestId });
  }
}
