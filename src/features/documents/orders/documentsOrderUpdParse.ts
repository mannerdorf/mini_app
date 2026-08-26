import * as XLSX from "xlsx";

export type OrderTableRow = {
  n: number;
  /** Строка для отображения в таблице (может включать кол-во и цену). */
  posylka: string;
  /** Позиции места из УПД — для отправки в 1С отдельными полями. */
  items: UpdLineItem[];
  otskanirvano: boolean;
  dataSkanirovaniya: string;
  perevozka: string;
  idOtpravleniya?: string;
};

export type UpdLineItem = {
  name: string;
  quantity: number;
  price: number;
};

function normalizeUpdCellText(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .trim();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = String(value ?? "")
    .replace(/\s/g, "")
    .replace(",", ".");
  if (!raw || !/^-?\d/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatLineItem(item: UpdLineItem): string {
  const qty =
    Number.isInteger(item.quantity) ? String(item.quantity) : item.quantity.toLocaleString("ru-RU");
  return `${item.name} · ${qty} шт · ${formatMoney(item.price)} ₽`;
}

function isStopRow(cells: string[]): boolean {
  const joined = cells.join(" ").toLowerCase();
  return /итого|всего к оплате|всего к оплате/.test(joined);
}

function isLetterRow(cells: string[]): boolean {
  const nonEmpty = cells.filter(Boolean);
  if (nonEmpty.length === 0) return true;
  if (nonEmpty.length > 6) return false;
  return nonEmpty.every((c) => /^[а-яa-z0-9]{1,2}$/i.test(c));
}

function isColumnMarkerRow(row: unknown[], nameCol: number): boolean {
  const name = String(row[nameCol] ?? "").trim();
  if (/^[\d]+[а-яa-z]?$/i.test(name)) return true;
  if (/^[а-яa-z]{1,2}$/i.test(name)) return true;
  return false;
}

function isCategoryRow(name: string): boolean {
  const lower = name.toLowerCase();
  if (name.length < 8) return true;
  if (/^(розничный|контейнер|итого|всего)\b/.test(lower)) return true;
  return false;
}

type HeaderMatch = {
  headerIdx: number;
  nameCol: number;
  qtyCol: number;
  priceCol: number;
};

function scoreNameHeader(cell: string): number {
  if (!cell.includes("наименование")) return 0;
  if (cell.includes("товар") || cell.includes("работ") || cell.includes("услуг")) return 10;
  if (cell.includes("краткое")) return 1;
  return 0;
}

function findUpdHeader(data: unknown[][]): HeaderMatch | null {
  let best: HeaderMatch | null = null;
  let bestScore = -1;

  for (let rowIdx = 0; rowIdx < Math.min(35, data.length); rowIdx++) {
    const row = data[rowIdx] as unknown[] | undefined;
    if (!row?.length) continue;

    let nameCol = -1;
    let nameScore = 0;
    const qtyCols: number[] = [];
    const priceCols: number[] = [];

    for (let col = 0; col < row.length; col++) {
      const cell = normalizeHeader(row[col]);
      if (!cell) continue;

      const nextNameScore = scoreNameHeader(cell);
      if (nextNameScore > nameScore) {
        nameScore = nextNameScore;
        nameCol = col;
      }

      if (
        cell.includes("коли") &&
        cell.includes("чество") &&
        !cell.includes("мест") &&
        !cell.includes("короб") &&
        !cell.includes("масс")
      ) {
        qtyCols.push(col);
      }

      if (
        (cell.includes("цена") && !cell.includes("стоимость")) ||
        (cell.includes("тариф") && cell.includes("единиц"))
      ) {
        priceCols.push(col);
      }
    }

    if (nameCol < 0 || nameScore < 4) continue;

    const qtyCol =
      qtyCols.filter((c) => c > nameCol).sort((a, b) => a - b)[0] ??
      qtyCols.sort((a, b) => b - a)[0] ??
      -1;
    const priceCol =
      priceCols.filter((c) => c > nameCol).sort((a, b) => a - b)[0] ??
      priceCols.sort((a, b) => b - a)[0] ??
      -1;

    const score = nameScore + (qtyCol >= 0 ? 2 : 0) + (priceCol >= 0 ? 1 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = { headerIdx: rowIdx, nameCol, qtyCol, priceCol };
    }
  }

  return best;
}

export function parseUpdLineItemsFromSheet(data: unknown[][]): UpdLineItem[] {
  if (!data?.length) return [];

  const header = findUpdHeader(data);
  if (!header) return [];

  const items: UpdLineItem[] = [];
  for (let rowIdx = header.headerIdx + 1; rowIdx < data.length; rowIdx++) {
    const row = data[rowIdx] as unknown[] | undefined;
    if (!row?.length) continue;

    const cells = row.map((c) => normalizeUpdCellText(c));
    if (isStopRow(cells) || isLetterRow(cells) || isColumnMarkerRow(row, header.nameCol)) continue;

    const name = normalizeUpdCellText(row[header.nameCol]);
    if (!name || isCategoryRow(name)) continue;

    const quantity = header.qtyCol >= 0 ? parseNumber(row[header.qtyCol]) : null;
    const price = header.priceCol >= 0 ? parseNumber(row[header.priceCol]) : null;
    if (quantity == null && price == null) continue;
    if ((quantity ?? 0) <= 0 && (price ?? 0) <= 0) continue;

    items.push({
      name,
      quantity: quantity ?? 1,
      price: price ?? 0,
    });
  }

  return items;
}

function formatPlaceLabel(bucket: UpdLineItem[], placeNo: number): string {
  if (bucket.length === 0) return `Место ${placeNo}`;
  if (bucket.length === 1) return formatLineItem(bucket[0]);
  return `Место ${placeNo} (${bucket.length} поз.): ${bucket.map(formatLineItem).join("; ")}`;
}

export function distributeUpdLineItems(
  items: UpdLineItem[],
  placeCount: number,
  random: () => number = Math.random,
): OrderTableRow[] {
  if (!Number.isFinite(placeCount) || placeCount < 1) {
    throw new Error("Укажите корректное количество мест");
  }
  if (!items.length) {
    throw new Error("В УПД не найдено строк номенклатуры");
  }

  const shuffled = [...items].sort(() => random() - 0.5);
  const buckets: UpdLineItem[][] = Array.from({ length: placeCount }, () => []);

  shuffled.forEach((item, idx) => {
    buckets[idx % placeCount].push(item);
  });

  return buckets.map((bucket, idx) => ({
    n: idx + 1,
    posylka: formatPlaceLabel(bucket, idx + 1),
    items: bucket,
    otskanirvano: false,
    dataSkanirovaniya: "",
    perevozka: "",
  }));
}

export async function parseUpdToTableRows(file: File, kolvoMest: number): Promise<OrderTableRow[]> {
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

  const items = parseUpdLineItemsFromSheet(data);
  return distributeUpdLineItems(items, kolvoMest);
}
