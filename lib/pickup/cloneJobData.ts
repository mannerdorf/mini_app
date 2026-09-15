import type { JobData } from "./model.js";

/** Данные для нового забора на основе существующего (без id/version на уровне Job). */
export function cloneJobDataForCopy(data: JobData): JobData {
  return {
    ...data,
    contacts: data.contacts.map((c) => ({ ...c })),
    documents: data.documents.map((d) => ({ ...d })),
    places: data.places.map((p) => ({ ...p })),
  };
}
