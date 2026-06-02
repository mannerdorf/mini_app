import type { AuthData } from "../../types";
import type { HaulzWorkbook } from "../../../lib/haulzReturns/types";
import {
  applyItogTranslationsToWorkbook,
  countItogTranslatedRows,
  itogRowsForTranslation,
  acceptItogTranslation,
  syncRussianOnlyItogTranslations,
} from "../../../lib/haulzReturns/translateOperations";
import { saveHaulzReturnsWorkbook, translateHaulzItogBatch } from "./haulzReturns";

const TRANSLATE_BATCH_SIZE = 40;

/** Переводит «Перевод» на листе итог и сохраняет в БД. includeFilled — повторный перевод уже заполненных строк. */
export async function translateAndPersistItogWorkbook(
  auth: AuthData,
  jobId: string,
  workbook: HaulzWorkbook,
  options?: { includeFilled?: boolean; onProgress?: (done: number, total: number) => void },
): Promise<{ workbook: HaulzWorkbook; translated: number }> {
  const itog = workbook.sheets.find((s) => s.id === "itog");
  if (!itog) return { workbook, translated: 0 };

  const { workbook: synced, changed: syncedChanged } = syncRussianOnlyItogTranslations(workbook);
  let current = synced;

  const includeFilled = options?.includeFilled === true;
  const pending = itogRowsForTranslation(current.sheets.find((s) => s.id === "itog")!.rows, { includeFilled });
  const before = countItogTranslatedRows(current.sheets.find((s) => s.id === "itog")!.rows);
  if (pending.length === 0 && !syncedChanged) return { workbook: current, translated: 0 };
  let totalApplied = 0;

  for (let i = 0; i < pending.length; i += TRANSLATE_BATCH_SIZE) {
    const batch = pending.slice(i, i + TRANSLATE_BATCH_SIZE);
    const results = await translateHaulzItogBatch(auth, batch);
    const byKey = new Map(results.map((row) => [row.rowKey, row.translation]));
    const batchMap = new Map<string, string>();
    for (const item of batch) {
      const raw = String(byKey.get(item.rowKey) ?? "").trim();
      if (raw && acceptItogTranslation(item.text, raw)) {
        batchMap.set(item.rowKey, raw);
      }
    }
    if (batchMap.size === 0) {
      throw new Error(
        results.length === 0
          ? "Сервер не ответил на запрос перевода — проверьте OPENAI_API_KEY на Vercel"
          : "OpenAI не вернул русский перевод (проверьте «Данные УЛ» и ключ API)",
      );
    }
    totalApplied += batchMap.size;
    current = applyItogTranslationsToWorkbook(current, batchMap);
    options?.onProgress?.(Math.min(i + batch.length, pending.length), pending.length);
  }

  const resync = syncRussianOnlyItogTranslations(current);
  current = resync.workbook;

  const after = countItogTranslatedRows(current.sheets.find((s) => s.id === "itog")?.rows ?? []);
  if (!includeFilled && pending.length > 0 && after <= before && !syncedChanged && !resync.changed) {
    throw new Error("Перевод не записался в таблицу");
  }
  if (pending.length > 0 && totalApplied === 0 && !syncedChanged && !resync.changed) {
    throw new Error("Перевод не записался в таблицу");
  }

  const saved = await saveHaulzReturnsWorkbook(auth, jobId, current);
  return { workbook: saved, translated: includeFilled ? totalApplied : Math.max(after - before, syncedChanged || resync.changed ? 1 : 0) };
}
