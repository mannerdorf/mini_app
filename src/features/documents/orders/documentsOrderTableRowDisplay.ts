import { parsePosylkaDisplayLine } from "../../../../lib/documentsOrderZayavkaPayload";

export type OrderTableRowDisplay = {
  name: string;
  quantity: number | null;
  price: number | null;
  sum: number | null;
};

type RowLike = {
  posylka?: string;
  items?: Array<{ name?: string; quantity?: number; price?: number }>;
};

function lineSum(quantity: number, price: number): number {
  return Math.round(quantity * price * 100) / 100;
}

function fromParsedItems(items: Array<{ name: string; quantity: number; price: number }>): OrderTableRowDisplay {
  if (items.length === 1) {
    const item = items[0];
    return {
      name: item.name,
      quantity: item.quantity,
      price: item.price,
      sum: lineSum(item.quantity, item.price),
    };
  }

  const quantity = items.reduce((acc, item) => acc + item.quantity, 0);
  const sum = items.reduce((acc, item) => acc + lineSum(item.quantity, item.price), 0);
  return {
    name: items.length > 1 ? `Место (${items.length} поз.)` : items[0]?.name || "—",
    quantity: quantity || null,
    price: items.length === 1 ? items[0].price : null,
    sum: sum || null,
  };
}

/** Колонки таблицы мест: наименование, кол-во и цена — даже для legacy posylka. */
export function resolveOrderTableRowDisplay(row: RowLike): OrderTableRowDisplay {
  const structured = (row.items ?? [])
    .map((item) => ({
      name: String(item.name ?? "").trim(),
      quantity: Math.max(0, Math.round(Number(item.quantity) || 0)),
      price: Number(item.price) || 0,
    }))
    .filter((item) => item.name);

  if (structured.length > 0) {
    return fromParsedItems(structured);
  }

  const parsed = parsePosylkaDisplayLine(row.posylka ?? "");
  if (parsed.length > 0) {
    return fromParsedItems(parsed);
  }

  return {
    name: String(row.posylka ?? "").trim() || "—",
    quantity: null,
    price: null,
    sum: null,
  };
}

export function formatOrderTableMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
