import type { AuthData } from "../../types";
import type { HaulzWorkbook } from "../../../lib/haulzReturns/types";
import {
  applyItogTranslationsToWorkbook,
  countItogTranslatedRows,
  itogRowsNeedingTranslation,
  itogRowsForTranslation,
  acceptItogTranslation,
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

  const includeFilled = options?.includeFilled === true;
  const pending = itogRowsForTranslation(itog.rows, { includeFilled });
  if (pending.length === 0) return { workbook, translated: 0 };

  let current = workbook;
  const before = countItogTranslatedRows(itog.rows);
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

  const after = countItogTranslatedRows(current.sheets.find((s) => s.id === "itog")?.rows ?? []);
  if (!includeFilled && after <= before) {
    throw new Error("Перевод не записался в таблицу");
  }
  if (totalApplied === 0) {
    throw new Error("Перевод не записался в таблицу");
  }

  const saved = await saveHaulzReturnsWorkbook(auth, jobId, current);
  return { workbook: saved, translated: includeFilled ? totalApplied : after - before };
}
