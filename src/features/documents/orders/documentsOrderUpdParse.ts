import * as XLSX from "xlsx";

export type OrderTableRow = {
  n: number;
  posylka: string;
  otskanirvano: boolean;
  dataSkanirovaniya: string;
  perevozka: string;
};

export async function parseUpdToTableRows(file: File, kolvoMest: number): Promise<OrderTableRow[]> {
  const count = kolvoMest;
  if (!Number.isFinite(count) || count < 1) {
    throw new Error("Укажите корректное количество мест");
  }
  const ext = (file.name || "").toLowerCase();
  if (!ext.endsWith(".xlsx") && !ext.endsWith(".xls")) {
    throw new Error("УПД: поддерживается только Excel (.xlsx, .xls). PDF будет добавлен позже.");
  }

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as unknown[][];
  if (!data?.length) {
    throw new Error("Файл пустой или не удалось прочитать");
  }

  const findCol = (row: unknown[], kws: string[]) => {
    for (let i = 0; i < (row?.length ?? 0); i++) {
      const cell = String(row[i] ?? "").toLowerCase();
      if (kws.some((k) => cell.includes(k))) return i;
    }
    return -1;
  };

  let headerIdx = 0;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    const row = data[i] as unknown[];
    if (findCol(row ?? [], ["номенклатура", "наименование"]) >= 0 || findCol(row ?? [], ["количество", "кол-во"]) >= 0) {
      headerIdx = i;
      break;
    }
  }

  const dataRows: string[][] = [];
  for (let i = headerIdx + 1; i < data.length; i++) {
    const row = data[i] as unknown[];
    if (!row?.length) continue;
    const parts = row.slice(0, 8).map((c) => String(c ?? "").trim()).filter(Boolean);
    if (parts.length) dataRows.push(parts);
  }
  if (!dataRows.length) {
    throw new Error("В УПД не найдено строк данных");
  }

  const shuffled = [...dataRows].sort(() => Math.random() - 0.5);
  const perPlace = Math.ceil(shuffled.length / count);
  const rows: OrderTableRow[] = [];
  let idx = 0;
  for (let i = 0; i < count; i++) {
    const chunk = shuffled.slice(idx, idx + perPlace);
    idx += perPlace;
    const posylkaLabel = chunk.length
      ? chunk.length === 1
        ? chunk[0][0] || `ПМ-${i + 1}`
        : `Место ${i + 1} (${chunk.length} поз.)`
      : `Место ${i + 1}`;
    rows.push({
      n: i + 1,
      posylka: posylkaLabel,
      otskanirvano: false,
      dataSkanirovaniya: "",
      perevozka: "",
    });
  }
  return rows;
}
