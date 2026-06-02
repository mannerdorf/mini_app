import type { AuthData } from "../../types";
import type { HaulzWorkbook } from "../../../lib/haulzReturns/types";
import {
  applyItogTranslationsToWorkbook,
  countItogTranslatedRows,
  itogRowsNeedingTranslation,
  acceptItogTranslation,
} from "../../../lib/haulzReturns/translateOperations";
import { saveHaulzReturnsWorkbook, translateHaulzItogBatch } from "./haulzReturns";

const TRANSLATE_BATCH_SIZE = 40;

/** Переводит пустые «Перевод» на листе итог и сохраняет в БД. */
export async function translateAndPersistItogWorkbook(
  auth: AuthData,
  jobId: string,
  workbook: HaulzWorkbook,
  onProgress?: (done: number, total: number) => void,
): Promise<{ workbook: HaulzWorkbook; translated: number }> {
  const itog = workbook.sheets.find((s) => s.id === "itog");
  if (!itog) return { workbook, translated: 0 };

  const pending = itogRowsNeedingTranslation(itog.rows);
  if (pending.length === 0) return { workbook, translated: 0 };

  let current = workbook;
  const before = countItogTranslatedRows(itog.rows);

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
    current = applyItogTranslationsToWorkbook(current, batchMap);
    onProgress?.(Math.min(i + batch.length, pending.length), pending.length);
  }

  const after = countItogTranslatedRows(current.sheets.find((s) => s.id === "itog")?.rows ?? []);
  if (after <= before) {
    throw new Error("Перевод не записался в таблицу");
  }

  const saved = await saveHaulzReturnsWorkbook(auth, jobId, current);
  return { workbook: saved, translated: after - before };
}
