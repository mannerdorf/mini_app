import type { ZayavkaGoodsRow, ZayavkaParcelRow, ZayavkaUploadPayload } from "./post1cZayavkaUpload.js";

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

function goodsRow(input: {
  idOtpravleniya?: string;
  id?: string;
  name: string;
  quantity?: number;
  cost?: number;
}): ZayavkaGoodsRow {
  const name = normalizeText(input.name) || "Товар";
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

function buildTableParcels(
  rows: DocumentsOrderTableRowInput[],
  declaredValueRub: number,
): ZayavkaParcelRow[] {
  const perPlaceValue =
    rows.length > 0 ? Math.round((normalizeMoney(declaredValueRub) / rows.length) * 100) / 100 : 0;

  return rows.map((row, idx) => {
    const barcode = normalizeText(row.posylka).slice(0, 64);
    const externalId = normalizeText(row.perevozka);
    const name = barcode || `Место ${idx + 1}`;
    return {
      ШтрихкодЗаказчика: barcode || `M${idx + 1}`,
      ...(externalId ? { Ид: externalId } : {}),
      Товары: [
        goodsRow({
          id: `place-${idx + 1}`,
          name,
          quantity: 1,
          cost: perPlaceValue,
        }),
      ],
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
