import { describe, expect, it } from "vitest";
import { buildWorkbook } from "./buildWorkbook";
import { rebuildItogFromKgd, removeKgdDuplicates } from "./kgdOperations";
import { addStopWord, removeStopWord } from "./stopOperations";
import { parseOtpravkaMatrix } from "./parseOtpravka";
import { parseUlMatrix } from "./parseUl";
import { removeItogStopRowsFromWorkbook } from "./itogOperations";
import { appendItogSummaryRow, appendKgdSummaryRow, appendUlSummaryRow, collectUlNumbersInItog, computeItogTotals, computeUlTotals, countUlDataRows, isItogDataRowFilled, isItogStopRow, isSummaryRow, isUlDataRowFilled, isUlRowInItog, isUlTabInItog, removeItogStopRows, removeUlRow, stripSummaryRows, syncUlSheetFromControlKeys } from "./ulTotals";
import { removeUlSheetFromWorkbook } from "./ulSheetOperations";
import { removeItogRow } from "./ulTotals";
import { recalcWorkbookAfterItogChange } from "./workbookRecalc";
import { ensureItogRowIds, stableItogRowId } from "./itogRowKeys";
import { parseTranslationsJson } from "./openaiTranslate";
import {
  applyItogTranslationsToWorkbook,
  countItogTranslatedRows,
  itogRowsNeedingTranslation,
  itogRowsForTranslation,
} from "./translateOperations";
import {
  isEnglishOnly,
  isPinkListMatch,
  stopColumnValue,
} from "./validators";
import { lookupStopFromRows } from "./stopWords";

const OTPRAVKA_SAMPLE = [
  ["", "Упаковочный лист к отправке номер № 02641958"],
  ["Номер п/п", "Грузовое место", "Номер посылки", "Аэропорт назначения"],
  ["1", "10000211381829", "10000211381829", "Москва"],
  ["2", "130603961000310610", "10000208095697", "Москва"],
];

const UL_SAMPLE = [
  ["", "Упаковочный лист № 02630423"],
  ["Номер п/п", "Грузовое место", "Номер посылки", "Аэропорт", "Вес", "Объем", "Категория", "Наименование", "кол-во", "Стоимость", "отметка"],
  ["1", "PLACE1", "10000211381829", "KGD", "1", "0.1", "<>", "Test item", "2", "100", ""],
  ["2", "PLACE2", "10000208095697", "KGD", "0.5", "0.01", "<>", "Shirts", "1", "50", ""],
];

describe("parseOtpravkaMatrix", () => {
  it("parses parcel and cargo columns", () => {
    const rows = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0].parcel).toBe("10000211381829");
    expect(rows[0].cargoPlace).toBe("10000211381829");
  });
});

describe("parseUlMatrix", () => {
  it("extracts UL number and rows", () => {
    const parsed = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    expect(parsed.ulNumber).toBe("02630423");
    expect(parsed.sheet.rows).toHaveLength(2);
    expect(parsed.sheet.rows[0].name).toBe("Test item");
  });
});

describe("validators", () => {
  it("detects english only", () => {
    expect(isEnglishOnly("Shirts")).toBe(true);
    expect(isEnglishOnly("брюки")).toBe(false);
    expect(isEnglishOnly("Shirt брюки")).toBe(false);
  });

  it("detects pink list", () => {
    expect(isPinkListMatch("Личные вещи")).toBe(true);
    expect(isPinkListMatch("обычный товар")).toBe(false);
  });

  it("stop exact lookup", () => {
    expect(stopColumnValue("Документы")).toBe("STOP");
    expect(stopColumnValue("ВАКЦИНА")).toBe("OK");
  });

  it("stop lookup from workbook rows", () => {
    const rows = [{ word: "Моё слово", result: "STOP" }];
    expect(lookupStopFromRows("Моё слово", rows)).toBe("STOP");
    expect(stopColumnValue("Моё слово", rows)).toBe("STOP");
    expect(stopColumnValue("ВАКЦИНА", rows)).toBe("OK");
  });
});

describe("kgdOperations", () => {
  it("removes duplicate parcels keeping first row", () => {
    const wb = buildWorkbook({
      otpravka: [
        { cargoPlace: "A", parcel: "111" },
        { cargoPlace: "B", parcel: "222" },
        { cargoPlace: "C", parcel: "111" },
      ],
      ulPrio1: [],
      ulPrio2: [],
    });
    const next = removeKgdDuplicates(wb);
    const kgd = next.sheets.find((s) => s.id === "kgd")!;
    const dataRows = kgd.rows.filter((r) => !isSummaryRow(r));
    expect(dataRows).toHaveLength(2);
    expect(dataRows.map((r) => r.parcel)).toEqual(["111", "222"]);
    expect(dataRows.every((r) => Number(r.dupCount) <= 1)).toBe(true);
    expect(isSummaryRow(kgd.rows[kgd.rows.length - 1])).toBe(true);
    expect(kgd.rows[0].num).toBe(1);
    expect(kgd.rows[1].num).toBe(2);
  });

  it("rebuilds итог from KGD rows", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    const wb = buildWorkbook({ otpravka, ulPrio1: [ul], ulPrio2: [] });
    const trimmed = removeKgdDuplicates(wb);
    const next = rebuildItogFromKgd(trimmed);
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const kgd = trimmed.sheets.find((s) => s.id === "kgd")!;
    expect(itog.rows).toHaveLength(kgd.rows.length);
    expect(itog.rows[0].parcel).toBe(kgd.rows[0].parcel);
  });
});

describe("stopOperations", () => {
  it("adds custom stop word and recalculates итог", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    const wb = buildWorkbook({ otpravka, ulPrio1: [ul], ulPrio2: [] });
    const customName = "Custom STOP item XYZ";
    const wbWithData = {
      ...wb,
      sheets: wb.sheets.map((s) =>
        s.id === "itog"
          ? {
              ...s,
              rows: s.rows.map((r) =>
                r.parcel === "10000211381829" ? { ...r, ulData: customName } : r,
              ),
            }
          : s,
      ),
    };

    const { workbook: withStop, added } = addStopWord(wbWithData, customName);
    expect(added).toBe(true);
    const stop = withStop.sheets.find((s) => s.id === "stop")!;
    expect(stop.rows.some((r) => r.word === customName)).toBe(true);

    const itog = withStop.sheets.find((s) => s.id === "itog")!;
    const row = itog.rows.find((r) => String(r.ulData) === customName);
    expect(row?.stop).toBe("STOP");
  });
});

describe("ulTotals", () => {
  it("computes weight, volume, places and cost", () => {
    const rows = [
      { rowNum: "1", cargoPlace: "A", parcel: "111", weight: "1", volume: "0.1", cost: "100" },
      { rowNum: "2", cargoPlace: "B", parcel: "222", weight: "0.5", volume: "0.01", cost: "50" },
    ];
    const totals = computeUlTotals(rows);
    expect(totals.weight).toBe(1.5);
    expect(totals.volume).toBeCloseTo(0.11);
    expect(totals.placeCount).toBe(2);
    expect(totals.cost).toBe(150);
  });

  it("ignores rows with only row number for place count", () => {
    const rows = [
      { rowNum: "1", cargoPlace: "A", parcel: "111", weight: "1", volume: "0.1", cost: "100" },
      { rowNum: "1720", weight: "", volume: "", cost: "" },
    ];
    const totals = computeUlTotals(rows);
    expect(totals.placeCount).toBe(1);
    expect(countUlDataRows(rows)).toBe(1);
    expect(isUlDataRowFilled({ rowNum: "1720" })).toBe(false);
    expect(isUlDataRowFilled({ rowNum: "1", parcel: "111" })).toBe(true);
  });

  it("appends summary row at the bottom", () => {
    const rows = [
      { rowNum: "1", cargoPlace: "A", parcel: "111", weight: 2, volume: 1, cost: 10 },
    ];
    const withSummary = appendUlSummaryRow(rows);
    expect(withSummary).toHaveLength(2);
    expect(isSummaryRow(withSummary[1])).toBe(true);
    expect(String(withSummary[1].weight)).toMatch(/Вес брутто/);
    expect(String(withSummary[1].volume)).toMatch(/Объём/);
    expect(String(withSummary[1].name)).toMatch(/Количество мест 1/);
    expect(String(withSummary[1].cost)).toMatch(/Сумма/);
  });

  it("syncs inItog flags from control keys", () => {
    const sheet = {
      id: "ul-02630423",
      name: "02630423",
      columns: [],
      rows: [
        { rowNum: "1", parcel: "111", mark: "02630423", weight: 1, volume: 0.1, cost: 10 },
        { rowNum: "2", parcel: "222", mark: "02630423", weight: 2, volume: 0.2, cost: 20 },
      ],
    };
    const keys = new Set(["026304231111"]);
    const synced = syncUlSheetFromControlKeys(sheet, keys);
    expect(isUlRowInItog(synced.rows[0])).toBe(true);
    expect(isUlRowInItog(synced.rows[1])).toBe(false);
    expect(isSummaryRow(synced.rows[synced.rows.length - 1])).toBe(true);
  });

  it("collectUlNumbersInItog returns UL numbers from itog rows", () => {
    const wb = buildWorkbook({
      otpravka: parseOtpravkaMatrix(OTPRAVKA_SAMPLE),
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    const nums = collectUlNumbersInItog(wb);
    expect(nums.has("02630423")).toBe(true);
    expect(isUlTabInItog("ul-02630423", nums)).toBe(true);
    expect(isUlTabInItog("ul-99999999", nums)).toBe(false);
    expect(isUlTabInItog("itog", nums)).toBe(false);
  });

  it("removes a data row and rebuilds summary", () => {
    const sheet = {
      id: "ul-02630423",
      name: "02630423",
      columns: [],
      rows: appendUlSummaryRow([
        { _rowId: "a", rowNum: "1", parcel: "111", weight: 1, volume: 0.1, cost: 10 },
        { _rowId: "b", rowNum: "2", parcel: "222", weight: 2, volume: 0.2, cost: 20 },
      ]),
    };
    const next = removeUlRow(sheet, "a");
    expect(next.rows.filter((r) => !isSummaryRow(r))).toHaveLength(1);
    expect(next.rows.find((r) => r._rowId === "a")).toBeUndefined();
    expect(String(next.rows[next.rows.length - 1].name)).toContain("Количество мест 1");
  });
  it("appends itog summary with place count, weight and cost", () => {
    const rows = [
      { parcel: "111", weight: 1.5, cost: 100 },
      { parcel: "222", weight: 0.5, cost: 50 },
    ];
    const withSummary = appendItogSummaryRow(rows);
    expect(withSummary).toHaveLength(3);
    const summary = withSummary[2];
    expect(String(summary.line)).toContain("Количество мест 2");
    expect(String(summary.weight)).toMatch(/Вес брутто/);
    expect(String(summary.cost)).toMatch(/Сумма/);
    expect(computeItogTotals(rows).weight).toBe(2);
  });

  it("appends kgd summary with place count", () => {
    const rows = [{ parcel: "111" }, { parcel: "222" }];
    const withSummary = appendKgdSummaryRow(rows);
    expect(withSummary).toHaveLength(3);
    expect(String(withSummary[2].parcel)).toContain("Количество мест 2");
  });

  it("removes itog rows marked STOP", () => {
    const rows = [
      { parcel: "111", stop: "OK", weight: 1, cost: 10 },
      { parcel: "222", stop: "STOP", weight: 2, cost: 20 },
      { parcel: "333", stop: "STOP", weight: 3, cost: 30 },
    ];
    const { sheet, removed } = removeItogStopRows({ id: "itog", name: "итог", columns: [], rows });
    expect(removed).toBe(2);
    expect(sheet.rows.filter((r) => !isSummaryRow(r))).toHaveLength(1);
    expect(sheet.rows.find((r) => r.parcel === "222")).toBeUndefined();
    expect(isItogStopRow({ stop: "STOP" })).toBe(true);
    expect(isItogStopRow({ stop: "OK" })).toBe(false);
  });
});

describe("itogOperations", () => {
  it("removes STOP rows from workbook and rebuilds summary", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    let wb = buildWorkbook({ otpravka, ulPrio1: [ul], ulPrio2: [] });
    const itog = wb.sheets.find((s) => s.id === "itog")!;
    const withStop = {
      ...wb,
      sheets: wb.sheets.map((s) =>
        s.id === "itog"
          ? {
              ...s,
              rows: appendItogSummaryRow([
                { ...itog.rows[0], stop: "STOP", _rowId: "a" },
                { ...itog.rows[1], stop: "OK", _rowId: "b", parcel: "999" },
              ]),
            }
          : s,
      ),
    };
    const { workbook: next, removed } = removeItogStopRowsFromWorkbook(withStop);
    expect(removed).toBe(1);
    const nextItog = next.sheets.find((s) => s.id === "itog")!;
    expect(nextItog.rows.filter((r) => !isSummaryRow(r))).toHaveLength(1);
    expect(String(nextItog.rows.find((r) => r.parcel === "999")?.stop)).toBe("OK");
  });
});

describe("buildWorkbook", () => {
  it("builds итог with matched UL data", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    const wb = buildWorkbook({ otpravka, ulPrio1: [ul], ulPrio2: [] });
    const itog = wb.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows).toHaveLength(3);
    expect(isSummaryRow(itog.rows[itog.rows.length - 1])).toBe(true);
    const kgd = wb.sheets.find((s) => s.id === "kgd")!;
    expect(isSummaryRow(kgd.rows[kgd.rows.length - 1])).toBe(true);
    expect(itog.rows[0].ul).toBe("02630423");
    expect(itog.rows[0].ulData).toBe("Test item");
    expect(itog.rows[0].seal).toBe("10000211381829");
    const ulSheet = wb.sheets.find((s) => s.id === "ul-02630423")!;
    expect(ulSheet.rows[0].inItog).toBe(1);
    const summary = ulSheet.rows[ulSheet.rows.length - 1];
    expect(isSummaryRow(summary)).toBe(true);
    expect(String(summary.weight)).toContain("Вес брутто");
    expect(String(summary.name)).toContain("Количество мест 2");
    expect(String(summary.cost)).toContain("Сумма");
  });

  it("searches priority 1 first, then priority 2 for unfound parcels", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ulPrio1 = parseUlMatrix(
      [
        ["", "Упаковочный лист № 111"],
        ["Номер п/п", "Грузовое место", "Номер посылки", "Аэропорт", "Вес", "Объем", "Категория", "Наименование", "кол-во", "Стоимость", "отметка"],
        ["1", "P1", "10000211381829", "KGD", "1", "0.1", "<>", "From prio 1", "1", "10", ""],
      ],
      "111.xlsx",
    );
    const ulPrio2 = parseUlMatrix(
      [
        ["", "Упаковочный лист № 222"],
        ["Номер п/п", "Грузовое место", "Номер посылки", "Аэропорт", "Вес", "Объем", "Категория", "Наименование", "кол-во", "Стоимость", "отметка"],
        ["1", "P1", "10000211381829", "KGD", "1", "0.1", "<>", "From prio 2 dup", "1", "10", ""],
        ["2", "P2", "10000208095697", "KGD", "1", "0.1", "<>", "From prio 2 only", "1", "20", ""],
      ],
      "222.xlsx",
    );
    const wb = buildWorkbook({ otpravka, ulPrio1: [ulPrio1], ulPrio2: [ulPrio2] });
    const itog = wb.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows[0].ulData).toBe("From prio 1");
    expect(itog.rows[0].ul).toBe("111");
    expect(itog.rows[1].ulData).toBe("From prio 2 only");
    expect(itog.rows[1].ul).toBe("222");
  });

  it("itogRowsNeedingTranslation skips filled translate and summary row", () => {
    const rows = appendItogSummaryRow([
      { _rowId: "a", control: "k1", ulData: "Shirt", translate: "" },
      { _rowId: "b", control: "k2", ulData: "Pants", translate: "Штаны" },
      { _rowId: "c", control: "k3", ulData: "", translate: "" },
    ]);
    expect(itogRowsNeedingTranslation(rows)).toEqual([{ rowKey: "a", text: "Shirt" }]);
    expect(itogRowsForTranslation(rows, { includeFilled: true })).toEqual([
      { rowKey: "a", text: "Shirt" },
      { rowKey: "b", text: "Pants" },
    ]);
    expect(countItogTranslatedRows(rows)).toBe(1);
  });

  it("applyItogTranslationsToWorkbook fills translate and rebuilds fix", () => {
    const itog = appendItogSummaryRow([
      { _rowId: "a", control: "k1", ulData: "Shirt", translate: "" },
      { _rowId: "b", control: "k2", ulData: "Pants", translate: "" },
    ]);
    const wb: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(),
      sheets: [
        { id: "itog", name: "итог", rows: itog },
        { id: "fix", name: "FIX", rows: [] },
      ],
    };
    const next = applyItogTranslationsToWorkbook(
      wb,
      new Map([
        ["k1", "Рубашка"],
        ["k2", "Штаны"],
      ]),
    );
    const nextItog = next.sheets.find((s) => s.id === "itog")!;
    expect(nextItog.rows[0].translate).toBe("Рубашка");
    expect(nextItog.rows[1].translate).toBe("Штаны");
    expect(isSummaryRow(nextItog.rows[nextItog.rows.length - 1])).toBe(true);
    const fix = next.sheets.find((s) => s.id === "fix")!;
    expect(fix.rows.length).toBeGreaterThan(0);
  });

  it("parseTranslationsJson accepts array and fenced json", () => {
    expect(parseTranslationsJson('{"translations":["Рубашка","Штаны"]}', 2)).toEqual(["Рубашка", "Штаны"]);
    expect(parseTranslationsJson('```json\n["A","B"]\n```', 2)).toEqual(["A", "B"]);
  });

  it("removeUlSheetFromWorkbook drops sheet, itog rows and kgd ul ref", () => {
    const wb = buildWorkbook({
      otpravka: parseOtpravkaMatrix(OTPRAVKA_SAMPLE),
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    const beforeItog = wb.sheets.find((s) => s.id === "itog")!.rows.filter((r) => !isSummaryRow(r)).length;
    expect(beforeItog).toBeGreaterThan(0);
    expect(wb.sheets.some((s) => s.id === "ul-02630423")).toBe(true);

    const next = removeUlSheetFromWorkbook(wb, "ul-02630423");
    expect(next.sheets.some((s) => s.id === "ul-02630423")).toBe(false);
    const itog = next.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows.filter((r) => !isSummaryRow(r)).every((r) => String(r.ul ?? "") !== "02630423")).toBe(true);
    const kgd = next.sheets.find((s) => s.id === "kgd")!;
    expect(kgd.rows.filter((r) => !isSummaryRow(r)).every((r) => String(r.ul ?? "") !== "02630423")).toBe(true);
  });

  it("removeItogRow keeps translate aligned with ulData after recalc", () => {
    const rows = appendItogSummaryRow([
      {
        _rowId: "itog-1-P1",
        control: "1111P1",
        parcel: "P1",
        ulData: "Product ONE",
        translate: "Товар ОДИН",
      },
      {
        _rowId: "itog-2-P2",
        control: "1112P2",
        parcel: "P2",
        ulData: "Product TWO",
        translate: "Товар ДВА",
      },
      {
        _rowId: "itog-3-P3",
        control: "1113P3",
        parcel: "P3",
        ulData: "Product THREE",
        translate: "Товар ТРИ",
      },
    ]);
    const wb: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(["1111P1", "1112P2", "1113P3"]),
      sheets: [{ id: "itog", name: "итог", columns: [], rows }],
    };
    const itogSheet = wb.sheets.find((s) => s.id === "itog")!;
    const removed = removeItogRow(itogSheet, "itog-2-P2");
    const next = recalcWorkbookAfterItogChange({
      ...wb,
      sheets: wb.sheets.map((s) => (s.id === "itog" ? removed : s)),
    });
    const data = stripSummaryRows(next.sheets.find((s) => s.id === "itog")!.rows);
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ parcel: "P1", ulData: "Product ONE", translate: "Товар ОДИН", num: 1 });
    expect(data[1]).toMatchObject({ parcel: "P3", ulData: "Product THREE", translate: "Товар ТРИ", num: 2 });
    expect(stableItogRowId(data[0]!)).toBe(String(data[0]!._rowId));
  });

  it("applyItogTranslations does not steal translation via bare parcel key", () => {
    const itog = appendItogSummaryRow([
      { _rowId: "itog:1111P1", control: "1111P1", parcel: "P1", ulData: "Shirt", translate: "Рубашка A" },
      { _rowId: "itog:1112P2", control: "1112P2", parcel: "P2", ulData: "Pants", translate: "Штаны B" },
    ]);
    const wb: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(),
      sheets: [{ id: "itog", name: "итог", rows: itog }],
    };
    const next = applyItogTranslationsToWorkbook(wb, new Map([["P1", "Чужой перевод"]]));
    const data = stripSummaryRows(next.sheets.find((s) => s.id === "itog")!.rows);
    expect(data[0]!.translate).toBe("Рубашка A");
    expect(data[1]!.translate).toBe("Штаны B");
  });

  it("ensureItogRowIds migrates legacy num-based ids to stable control ids", () => {
    const [row] = ensureItogRowIds([
      { _rowId: "itog-99-P1", control: "1111P1", parcel: "P1", ulData: "Item", translate: "Товар" },
    ]);
    expect(row!._rowId).toBe("itog:1111P1");
    expect(row!.translate).toBe("Товар");
  });
});
