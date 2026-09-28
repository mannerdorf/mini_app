/** Only recognized document envelopes may replace a cached date window. */
export function validatedFinancialDocumentRows(payload: unknown, kind: "perevozki" | "invoices"): Record<string, unknown>[] {
  let rows: unknown = payload;
  if (!Array.isArray(payload)) {
    if (!payload || typeof payload !== "object") throw new Error(`${kind}: неверный формат ответа 1С`);
    const envelope = payload as Record<string, unknown>;
    if (envelope.Success === false || envelope.success === false || envelope.Error || envelope.error) {
      throw new Error(`${kind}: 1С вернула ошибку вместо документов`);
    }
    const keys = kind === "invoices"
      ? ["items", "Items", "Invoices", "invoices", "data", "Data", "result", "Result", "rows", "Rows"]
      : ["items", "Items", "data", "Data", "result", "Result", "rows", "Rows"];
    rows = keys.map(key => envelope[key]).find(Array.isArray);
  }
  if (!Array.isArray(rows) || rows.some(row => {
    if (!row || typeof row !== "object" || Array.isArray(row)) return true;
    const number = row.Number ?? row.number ?? row.Номер ?? row.N;
    return !["string", "number"].includes(typeof number) || !String(number).trim();
  })) throw new Error(`${kind}: неверный формат документов 1С, предыдущие данные сохранены`);
  return rows as Record<string, unknown>[];
}
