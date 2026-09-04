import type { ZayavkaGoodsRow, ZayavkaParcelRow, ZayavkaUploadPayload } from "./post1cZayavkaUpload.js";
import { truncateGoodsNameFor1c } from "./post1cZayavkaUpload.js";

export type DocumentsOrderTableLineItem = {
  name: string;
  quantity: number;
  price: number;
};

export type DocumentsOrderFivepostRowInput = {
  omniBarcode: string;
  teBarcode?: string;
  clientOrderNo?: string;
  partnerOrderNo?: string;
  itemNameRu?: string;
  itemName?: string;
  unitCost?: number | null;
  totalCost?: number | null;
  placesCount?: number;
};

export type DocumentsOrderTableRowInput = {
  posylka: string;
  perevozka?: string;
  idOtpravleniya?: string;
  items?: DocumentsOrderTableLineItem[];
};

export type BuildDocumentsOrderZayavkaInput = {
  customerInn: string;
  senderInn?: string;
  receiverInn?: string;
  punktOtpravki: string;
  punktNaznacheniya: string;
  dataZabora: string;
  nomerZayavkiKlienta?: string;
  og?: boolean;
  declaredValueRub?: number;
  placeCount?: number;
  fivepostRows?: DocumentsOrderFivepostRowInput[];
  tableRows?: DocumentsOrderTableRowInput[];
};

function normalizeInn(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeGoodsName(value: unknown): string {
  return truncateGoodsNameFor1c(value, "Товар") || "Товар";
}

/** Убирает только наш UI-хвост «· N шт · цена ₽», не содержимое ячейки УПД. */
export function stripPosylkaDisplaySuffix(value: unknown): string {
  const name = normalizeText(value);
  if (!name) return "";
  return name.replace(/\s*·\s*[\d\s,.]+\s*шт\.?\s*·\s*[\d\s,.]+\s*₽\s*$/iu, "").trim();
}

/** @deprecated используйте stripPosylkaDisplaySuffix для legacy posylka */
export function sanitizeGoodsNameFor1c(value: unknown): string {
  return stripPosylkaDisplaySuffix(value);
}

/** Разбирает legacy-строку «название · N шт · цена ₽» из posylka. */
export function parsePosylkaDisplayLine(posylka: string): DocumentsOrderTableLineItem[] {
  const trimmed = normalizeText(posylka);
  if (!trimmed) return [];

  const multiMatch = trimmed.match(/^Место \d+ \(\d+ поз\.\):\s*(.+)$/);
  if (multiMatch) {
    return multiMatch[1]
      .split(";")
      .map((part) => parsePosylkaDisplayLine(part.trim())[0])
      .filter((item): item is DocumentsOrderTableLineItem => item != null);
  }

  const parts = trimmed.split(" · ").map((part) => part.trim());
  if (parts.length >= 3) {
    const qtyRaw = parts[parts.length - 2];
    const priceRaw = parts[parts.length - 1];
    const qtyMatch = qtyRaw.match(/^([\d\s,.]+)\s*шт\.?$/i);
    const priceMatch = priceRaw.match(/^([\d\s,.]+)\s*₽$/);
    if (qtyMatch && priceMatch) {
      const quantity = Math.max(1, Math.round(Number(qtyMatch[1].replace(/\s/g, "").replace(",", ".")) || 1));
      const price = normalizeMoney(priceMatch[1].replace(/\s/g, "").replace(",", "."));
      const name = stripPosylkaDisplaySuffix(parts.slice(0, -2).join(" · ").trim());
      if (name) return [{ name, quantity, price }];
    }
  }

  return [{ name: stripPosylkaDisplaySuffix(trimmed), quantity: 1, price: 0 }];
}

function lineDeclaredValue(item: DocumentsOrderTableLineItem): number {
  return Math.round(item.quantity * item.price * 100) / 100;
}

function goodsRow(input: {
  idOtpravleniya?: string;
  id?: string;
  name: string;
  quantity?: number;
  cost?: number;
}): ZayavkaGoodsRow {
  const name = normalizeGoodsName(input.name);
  return {
    ИДОтправления: normalizeText(input.idOtpravleniya),
    ID: normalizeText(input.id),
    Name: name,
    ТМЦ: name,
    Количество: Math.max(1, Math.round(Number(input.quantity) || 1)),
    ОбъявленнаяСтоимостьТовара: normalizeMoney(input.cost),
  };
}

function parcelKey(row: DocumentsOrderFivepostRowInput): string {
  return [
    normalizeText(row.omniBarcode),
    normalizeText(row.teBarcode),
    normalizeText(row.clientOrderNo),
  ].join("|");
}

function buildFivepostParcels(rows: DocumentsOrderFivepostRowInput[]): ZayavkaParcelRow[] {
  const grouped = new Map<string, { head: DocumentsOrderFivepostRowInput; goods: ZayavkaGoodsRow[] }>();

  for (const row of rows) {
    const barcode = normalizeText(row.omniBarcode);
    if (!barcode) continue;
    const key = parcelKey(row);
    const name = normalizeText(row.itemNameRu || row.itemName) || "Товар";
    const good = goodsRow({
      idOtpravleniya: normalizeText(row.partnerOrderNo || row.clientOrderNo),
      id: barcode,
      name,
      quantity: row.placesCount && row.placesCount > 0 ? row.placesCount : 1,
      cost: row.totalCost ?? row.unitCost ?? 0,
    });
    const existing = grouped.get(key);
    if (existing) {
      existing.goods.push(good);
      continue;
    }
    grouped.set(key, { head: row, goods: [good] });
  }

  return [...grouped.values()].map(({ head, goods }) => ({
    ШтрихкодЗаказчика: normalizeText(head.omniBarcode),
    ...(normalizeText(head.teBarcode) ? { ШтрихкодЗаказчика2: normalizeText(head.teBarcode) } : {}),
    ...(normalizeText(head.clientOrderNo || head.partnerOrderNo)
      ? { Ид: normalizeText(head.clientOrderNo || head.partnerOrderNo) }
      : {}),
    Товары: goods,
  }));
}

function normalizeTableLineItem(raw: unknown): DocumentsOrderTableLineItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = normalizeText(o.name ?? o.Name ?? o.наименование);
  if (!name) return null;
  const quantity = Math.max(1, Math.round(Number(o.quantity ?? o.Quantity ?? o.количество) || 1));
  const price = normalizeMoney(o.price ?? o.Price ?? o.unitPrice ?? o.unit_price ?? o.цена);
  return { name, quantity, price };
}

export function mapLegacyTableRowInput(raw: unknown): DocumentsOrderTableRowInput {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const itemsRaw = o.items ?? o.Items;
  const items = Array.isArray(itemsRaw)
    ? itemsRaw.map(normalizeTableLineItem).filter((item): item is DocumentsOrderTableLineItem => item != null)
    : undefined;
  return {
    posylka: String(o.posylka ?? o.Posylka ?? ""),
    perevozka: String(o.perevozka ?? o.Perevozka ?? ""),
    idOtpravleniya: String(o.idOtpravleniya ?? o.id_otpravleniya ?? "").trim() || undefined,
    ...(items?.length ? { items } : {}),
  };
}

function buildGoodsFromTableRow(
  row: DocumentsOrderTableRowInput,
  idx: number,
  perPlaceValue: number,
): ZayavkaGoodsRow[] {
  const items =
    row.items?.length && row.items.some((item) => normalizeText(item.name))
      ? row.items.filter((item) => normalizeText(item.name))
      : parsePosylkaDisplayLine(row.posylka);

  if (items.length === 0) {
    return [
      goodsRow({
        idOtpravleniya: normalizeText(row.idOtpravleniya),
        id: `place-${idx + 1}`,
        name: `Место ${idx + 1}`,
        quantity: 1,
        cost: perPlaceValue,
      }),
    ];
  }

  return items.map((item, itemIdx) => {
    const declared = lineDeclaredValue(item);
    return goodsRow({
      idOtpravleniya: items.length === 1 ? normalizeText(row.idOtpravleniya) : "",
      id: items.length === 1 ? `place-${idx + 1}` : `place-${idx + 1}-${itemIdx + 1}`,
      name: item.name,
      quantity: item.quantity,
      cost: declared > 0 ? declared : perPlaceValue,
    });
  });
}

function buildTableParcels(
  rows: DocumentsOrderTableRowInput[],
  declaredValueRub: number,
): ZayavkaParcelRow[] {
  const perPlaceValue =
    rows.length > 0 ? Math.round((normalizeMoney(declaredValueRub) / rows.length) * 100) / 100 : 0;

  return rows.map((row, idx) => {
    const goods = buildGoodsFromTableRow(row, idx, perPlaceValue);
    const sendingId = normalizeText(row.idOtpravleniya) || normalizeText(goods[0]?.ИДОтправления);
    const externalId = normalizeText(row.perevozka);
    return {
      ШтрихкодЗаказчика: sendingId || `M${idx + 1}`,
      ...(externalId ? { Ид: externalId } : {}),
      Товары: goods,
    };
  });
}

function buildSyntheticParcel(input: BuildDocumentsOrderZayavkaInput): ZayavkaParcelRow[] {
  const clientNo = normalizeText(input.nomerZayavkiKlienta);
  const placeCount = Math.max(1, Math.round(Number(input.placeCount) || 1));
  const declared = normalizeMoney(input.declaredValueRub);
  const perPlace = Math.round((declared / placeCount) * 100) / 100;

  return [
    {
      ШтрихкодЗаказчика: clientNo || "HAULZ",
      ...(clientNo ? { Ид: clientNo } : {}),
      Товары: [
        goodsRow({
          id: "cargo",
          name: placeCount > 1 ? `Груз, ${placeCount} мест` : "Груз по заявке",
          quantity: placeCount,
          cost: declared || perPlace * placeCount,
        }),
      ],
    },
  ];
}

/** Пересобирает Посылки из табличной части УПД, сохраняя шапку заявки. */
export function mergeZayavkaPayloadWithTableRows(
  payload: ZayavkaUploadPayload,
  tableRows: DocumentsOrderTableRowInput[],
  declaredValueRub: number,
): ZayavkaUploadPayload {
  if (!tableRows.length) return payload;
  return buildDocumentsOrderZayavkaPayload({
    customerInn: payload.ЗаказчикИНН,
    senderInn: payload.ОтправительИНН,
    receiverInn: payload.ПолучательИНН,
    punktOtpravki: payload.ПунктОтправки,
    punktNaznacheniya: payload.ПунктНазначения,
    dataZabora: payload.ДатаЗабораПлан,
    nomerZayavkiKlienta: payload.НомерЗаявкиКлиента,
    og: payload.ОГ,
    declaredValueRub,
    tableRows,
  });
}

/** ШтрихкодЗаказчика = ИДОтправления первого товара в посылке. */
export function syncZayavkaParcelBarcodesFromSendingIds(payload: ZayavkaUploadPayload): ZayavkaUploadPayload {
  const parcels = payload.Посылки.map((parcel) => {
    const sendingId = (parcel.Товары ?? [])
      .map((good) => normalizeText(good.ИДОтправления))
      .find(Boolean);
    if (!sendingId) return parcel;
    return { ...parcel, ШтрихкодЗаказчика: sendingId };
  });
  return { ...payload, Посылки: parcels };
}

/** Собирает JSON заявки для POST /api/documents/order-submit-1c из данных формы ЛК. */
export function buildDocumentsOrderZayavkaPayload(
  input: BuildDocumentsOrderZayavkaInput,
): ZayavkaUploadPayload {
  const fivepostRows = input.fivepostRows ?? [];
  const tableRows = input.tableRows ?? [];

  let parcels: ZayavkaParcelRow[] = [];
  if (fivepostRows.length > 0) {
    parcels = buildFivepostParcels(fivepostRows);
  } else if (tableRows.length > 0) {
    parcels = buildTableParcels(tableRows, input.declaredValueRub ?? 0);
  } else {
    parcels = buildSyntheticParcel(input);
  }

  if (parcels.length === 0) {
    parcels = buildSyntheticParcel(input);
  }

  return {
    ЗаказчикИНН: normalizeInn(input.customerInn),
    ОтправительИНН: normalizeInn(input.senderInn),
    ПолучательИНН: normalizeInn(input.receiverInn),
    ПунктОтправки: normalizeText(input.punktOtpravki),
    ПунктНазначения: normalizeText(input.punktNaznacheniya),
    ДатаЗабораПлан: normalizeText(input.dataZabora),
    ОГ: input.og === true,
    НомерЗаявкиКлиента: normalizeText(input.nomerZayavkiKlienta),
    Посылки: parcels,
  };
}
