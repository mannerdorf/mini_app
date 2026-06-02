import { describe, expect, it } from "vitest";
import { buildWorkbook, hydrateUlSheetFromParsed } from "./buildWorkbook";
import { rebuildItogFromKgd, removeKgdDuplicates } from "./kgdOperations";
import { addStopWord, removeStopWord } from "./stopOperations";
import { parseOtpravkaMatrix } from "./parseOtpravka";
import { parseUlMatrix } from "./parseUl";
import { removeItogStopRowsFromWorkbook } from "./itogOperations";
import { appendItogSummaryRow, appendKgdSummaryRow, appendUlSummaryRow, collectUlNumbersInItog, computeItogTotals, computeUlTotals, countUlDataRows, isItogDataRowFilled, isItogStopRow, isSummaryRow, isUlDataRowFilled, isUlRowInItog, isUlTabInItog, removeItogStopRows, removeUlRow, stripSummaryRows, syncUlSheetFromControlKeys } from "./ulTotals";
import { removeUlSheetFromWorkbook } from "./ulSheetOperations";
import { removeItogRow } from "./ulTotals";
import { buildFixSheetFromItog, recalcWorkbookAfterItogChange } from "./workbookRecalc";
import { ensureItogRowIds, stableItogRowId } from "./itogRowKeys";
import { mergeWorkbookOnReprocess } from "./mergeWorkbookOnReprocess";
import { itogValidationFromRow } from "./validators";
import { parseCarrierInput, formatCarrierCard } from "./carriers";
import { proformaExportFileName, specificationExportFileName } from "./tdDocuments/fileNames.js";
import { isHolzCarrier, validateTdPrep, buildTdPrepared } from "./tdDocuments/index.js";
import { replaceDraftRuDate, splitDraftDateField, syncTitleDateFromFts, computeProformaTotals, normalizeSpecificationDraft } from "./tdDocuments/draftDateFields.js";
import { workbookForApi, workbookForApiWithinBudget, mergeWorkbookPatch } from "./workbookApi";
import { mergeTdDraft, mergeWorkbookTdMeta } from "./tdMetaMerge";
import { parseTranslationsJson } from "./openaiTranslate";
import {
  applyItogTranslationsToWorkbook,
  countItogTranslatedRows,
  itogRowsNeedingTranslation,
  itogRowsForTranslation,
  acceptItogTranslation,
  syncRussianOnlyItogTranslations,
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
    expect(isSummaryRow(kgd.rows[0]!)).toBe(true);
    expect(kgd.rows[1]!.num).toBe(1);
    expect(kgd.rows[2]!.num).toBe(2);
  });

  it("rebuilds итог from KGD rows", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    const wb = buildWorkbook({ otpravka, ulPrio1: [ul], ulPrio2: [] });
    const trimmed = removeKgdDuplicates(wb);
    const next = rebuildItogFromKgd(trimmed);
    const itog = next.sheets.find((s) => s.id === "itog")!;
    const kgd = trimmed.sheets.find((s) => s.id === "kgd")!;
    expect(itog.rows.filter((r) => !isSummaryRow(r)).length).toBe(
      kgd.rows.filter((r) => !isSummaryRow(r)).length,
    );
    expect(itog.rows[1]!.parcel).toBe(kgd.rows[1]!.parcel);
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

  it("prepends summary row at the top", () => {
    const rows = [
      { rowNum: "1", cargoPlace: "A", parcel: "111", weight: 2, volume: 1, cost: 10 },
    ];
    const withSummary = appendUlSummaryRow(rows);
    expect(withSummary).toHaveLength(2);
    expect(isSummaryRow(withSummary[0]!)).toBe(true);
    expect(String(withSummary[0]!.weight)).toMatch(/Вес брутто/);
    expect(String(withSummary[0]!.volume)).toMatch(/Объём/);
    expect(String(withSummary[0]!.name)).toMatch(/Количество мест 1/);
    expect(String(withSummary[0]!.cost)).toMatch(/Сумма/);
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
    expect(isUlRowInItog(synced.rows[1]!)).toBe(true);
    expect(isUlRowInItog(synced.rows[2]!)).toBe(false);
    expect(isSummaryRow(synced.rows[0]!)).toBe(true);
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
    expect(String(next.rows[0]!.name)).toContain("Количество мест 1");
  });
  it("appends itog summary with place count, weight and cost", () => {
    const rows = [
      { parcel: "111", weight: 1.5, cost: 100 },
      { parcel: "222", weight: 0.5, cost: 50 },
    ];
    const withSummary = appendItogSummaryRow(rows);
    const summary = withSummary[0]!;
    expect(withSummary).toHaveLength(3);
    expect(String(summary.line)).toContain("Количество мест 2");
    expect(String(summary.weight)).toMatch(/Вес брутто/);
    expect(String(summary.cost)).toMatch(/Сумма/);
    expect(computeItogTotals(rows).weight).toBe(2);
  });

  it("appends kgd summary with place count", () => {
    const rows = [{ parcel: "111" }, { parcel: "222" }];
    const withSummary = appendKgdSummaryRow(rows);
    expect(isSummaryRow(withSummary[0]!)).toBe(true);
    expect(String(withSummary[0]!.parcel)).toContain("Количество мест 2");
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
    const dataRows = stripSummaryRows(itog.rows);
    const withStop = {
      ...wb,
      sheets: wb.sheets.map((s) =>
        s.id === "itog"
          ? {
              ...s,
              rows: appendItogSummaryRow([
                { ...dataRows[0]!, stop: "STOP", _rowId: "a" },
                { ...dataRows[1]!, stop: "OK", _rowId: "b", parcel: "999" },
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
    const kgd = wb.sheets.find((s) => s.id === "kgd")!;
    expect(itog.rows).toHaveLength(3);
    expect(isSummaryRow(itog.rows[0]!)).toBe(true);
    expect(isSummaryRow(kgd.rows[0]!)).toBe(true);
    expect(itog.rows[1]!.ul).toBe("02630423");
    expect(itog.rows[1]!.ulData).toBe("Test item");
    expect(itog.rows[1]!.seal).toBe("10000211381829");
    const ulSheet = wb.sheets.find((s) => s.id === "ul-02630423")!;
    expect(ulSheet.rows[1]!.inItog).toBe(1);
    const summary = ulSheet.rows[0]!;
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
    expect(itog.rows[1]!.ulData).toBe("From prio 1");
    expect(itog.rows[1]!.ul).toBe("111");
    expect(itog.rows[2]!.ulData).toBe("From prio 2 only");
    expect(itog.rows[2]!.ul).toBe("222");
  });

  it("itogRowsNeedingTranslation skips filled translate and summary row", () => {
    const rows = appendItogSummaryRow([
      { _rowId: "a", control: "k1", ulData: "Shirt", translate: "" },
      { _rowId: "b", control: "k2", ulData: "Pants", translate: "Штаны" },
      { _rowId: "c", control: "k3", ulData: "", translate: "" },
      { _rowId: "d", control: "k4", ulData: "Крючки", translate: "" },
    ]);
    expect(itogRowsNeedingTranslation(rows)).toEqual([{ rowKey: "a", text: "Shirt" }]);
    expect(itogRowsForTranslation(rows, { includeFilled: true })).toEqual([
      { rowKey: "a", text: "Shirt" },
      { rowKey: "b", text: "Pants" },
    ]);
    expect(countItogTranslatedRows(rows)).toBe(1);
  });

  it("acceptItogTranslation rejects Russian to English", () => {
    expect(acceptItogTranslation("Крючки", "Hooks")).toBe(false);
    expect(acceptItogTranslation("Крючки", "Крючки")).toBe(true);
    expect(acceptItogTranslation("Shirt", "Рубашка")).toBe(true);
  });

  it("syncRussianOnlyItogTranslations copies ulData and fixes wrong translate", () => {
    const wb: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(),
      excludedUlNumbers: new Set(),
      sheets: [{
        id: "itog",
        name: "итог",
        rows: appendItogSummaryRow([
          { _rowId: "a", control: "k1", ulData: "Крючки", translate: "Hooks" },
          { _rowId: "b", control: "k2", ulData: "Shirt", translate: "" },
        ]),
      }],
    };
    const { workbook: next, changed } = syncRussianOnlyItogTranslations(wb);
    expect(changed).toBe(true);
    expect(next.sheets[0]!.rows[1]!.translate).toBe("Крючки");
    expect(next.sheets[0]!.rows[2]!.translate).toBe("");
  });

  it("applyItogTranslationsToWorkbook fills translate and rebuilds fix", () => {
    const itog = appendItogSummaryRow([
      { _rowId: "a", control: "k1", ulData: "Shirt", translate: "" },
      { _rowId: "b", control: "k2", ulData: "Pants", translate: "" },
    ]);
    const wb: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(),
      excludedUlNumbers: new Set(),
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
    expect(nextItog.rows[1]!.translate).toBe("Рубашка");
    expect(nextItog.rows[2]!.translate).toBe("Штаны");
    expect(isSummaryRow(nextItog.rows[0]!)).toBe(true);
    const fix = next.sheets.find((s) => s.id === "fix")!;
    expect(fix.rows.length).toBeGreaterThan(0);
  });

  it("buildFixSheetFromItog sorts by ul then line ascending", () => {
    const itog = {
      id: "itog",
      name: "итог",
      columns: [],
      rows: [
        { _rowId: "r1", ul: "233", line: "2", num: 1 },
        { _rowId: "r2", ul: "232", line: "2", num: 2 },
        { _rowId: "r3", ul: "232", line: "1", num: 3 },
        { _rowId: "r4", ul: "233", line: "1", num: 4 },
      ],
    };
    const fix = buildFixSheetFromItog(itog);
    expect(fix.rows.map((r) => `${r.ul}/${r.line}`)).toEqual(["232/1", "232/2", "233/1", "233/2"]);
  });

  it("buildFixSheetFromItog copies validation flags from itog", () => {
    const itog = {
      id: "itog",
      name: "итог",
      columns: [],
      rows: [
        {
          _rowId: "r1",
          num: 1,
          ulData: "Shirts",
          englishOnly: true,
          au585: false,
          digitsOnly: false,
          pinkList: false,
        },
        {
          _rowId: "r2",
          num: 2,
          ulData: "Личные вещи",
          englishOnly: false,
          au585: false,
          digitsOnly: false,
          pinkList: true,
        },
      ],
    };
    const fix = buildFixSheetFromItog(itog);
    expect(fix.rows).toHaveLength(2);
    expect(fix.rows[0]!.englishOnly).toBe(true);
    expect(fix.rows[1]!.pinkList).toBe(true);
    expect(itogValidationFromRow(fix.rows[0]!)).toEqual({
      englishOnly: true,
      au585: false,
      digitsOnly: false,
      pinkList: false,
    });
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
    expect(next.excludedUlNumbers.has("02630423")).toBe(true);
    expect(next.sheets.some((s) => s.id === "ul-02630423")).toBe(false);
    const itog = next.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows.filter((r) => !isSummaryRow(r)).every((r) => String(r.ul ?? "") !== "02630423")).toBe(true);
    const kgd = next.sheets.find((s) => s.id === "kgd")!;
    expect(kgd.rows.filter((r) => !isSummaryRow(r)).every((r) => String(r.ul ?? "") !== "02630423")).toBe(true);
  });

  it("mergeWorkbookOnReprocess does not restore excluded UL sheets", () => {
    const wb = buildWorkbook({
      otpravka: parseOtpravkaMatrix(OTPRAVKA_SAMPLE),
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    const deleted = removeUlSheetFromWorkbook(wb, "ul-02630423");
    const rebuilt = buildWorkbook({
      otpravka: parseOtpravkaMatrix(OTPRAVKA_SAMPLE),
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    const merged = mergeWorkbookOnReprocess(deleted, rebuilt);
    expect(merged.excludedUlNumbers.has("02630423")).toBe(true);
    expect(merged.sheets.some((s) => s.id === "ul-02630423")).toBe(false);
    const itog = merged.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows.filter((r) => !isSummaryRow(r)).every((r) => String(r.ul ?? "") !== "02630423")).toBe(true);
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
    const wb: HaulzWorkbook = {
      itogControlKeys: new Set(["1111P1", "1112P2", "1113P3"]),
      excludedUlNumbers: new Set(),
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
      excludedUlNumbers: new Set(),
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

  it("mergeWorkbookOnReprocess fills empty ulData and keeps translate", () => {
    const previous: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(["1111P1", "1112P2"]),
      excludedUlNumbers: new Set(),
      sheets: [
        {
          id: "itog",
          name: "итог",
          columns: [],
          rows: appendItogSummaryRow([
            {
              _rowId: "itog:1111P1",
              control: "1111P1",
              parcel: "P1",
              ulData: "Shirt",
              translate: "Рубашка",
            },
            {
              _rowId: "itog:1112P2",
              control: "1112P2",
              parcel: "P2",
              ulData: "",
              translate: "",
            },
          ]),
        },
        { id: "stop", name: "STOP", columns: [], rows: [{ _rowId: "stop-custom", word: "X", result: "STOP" }] },
      ],
    };
    const rebuilt: import("./types").HaulzWorkbook = {
      itogControlKeys: new Set(["1111P1", "1112P2", "1113P3"]),
      excludedUlNumbers: new Set(),
      sheets: [
        {
          id: "itog",
          name: "итог",
          columns: [],
          rows: appendItogSummaryRow([
            {
              _rowId: "itog:1111P1",
              control: "1111P1",
              parcel: "P1",
              ulData: "Shirt",
              translate: "",
            },
            {
              _rowId: "itog:1112P2",
              control: "1112P2",
              parcel: "P2",
              ulData: "Pants",
              translate: "",
            },
            {
              _rowId: "itog:1113P3",
              control: "1113P3",
              parcel: "P3",
              ulData: "Hat",
              translate: "",
            },
          ]),
        },
        { id: "stop", name: "STOP", columns: [], rows: [] },
      ],
    };
    const merged = mergeWorkbookOnReprocess(previous, rebuilt);
    const itog = stripSummaryRows(merged.sheets.find((s) => s.id === "itog")!.rows);
    expect(itog).toHaveLength(2);
    expect(itog.find((r) => r.parcel === "P1")?.translate).toBe("Рубашка");
    expect(itog.find((r) => r.parcel === "P2")?.ulData).toBe("Pants");
    expect(itog.some((r) => r.parcel === "P3")).toBe(false);
    expect(merged.sheets.find((s) => s.id === "stop")?.rows[0]?.word).toBe("X");
  });
});

describe("carriers", () => {
  it("parseCarrierInput requires name", () => {
    expect(parseCarrierInput({ name: " ООО Тест " })).toEqual({
      name: "ООО Тест",
      legalAddress: "",
      inn: "",
      kpp: "",
      loadingAddress: "",
      unloadingAddress: "",
    });
    expect(parseCarrierInput({})).toBeNull();
  });

  it("formatCarrierCard builds readable block", () => {
    const text = formatCarrierCard({
      name: "ООО «ХОЛЗ»",
      legalAddress: "Москва",
      inn: "9706037094",
      kpp: "770601001",
      loadingAddress: "Калининград",
      unloadingAddress: "Москва",
    });
    expect(text).toContain("ООО «ХОЛЗ»");
    expect(text).toContain("ИНН / КПП: 9706037094 / 770601001");
    expect(text).toContain("Факт. адрес загрузки: Калининград");
  });
});

describe("workbookForApi", () => {
  it("defers UL rows and keeps itog rows", () => {
    const wb = buildWorkbook({
      otpravka: [{ cargoPlace: "A", parcel: "111" }],
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    const api = workbookForApi(wb);
    const ul = api.sheets.find((s) => s.id.startsWith("ul-"));
    const itog = api.sheets.find((s) => s.id === "itog");
    expect(ul?.ulDeferred).toBe(true);
    expect(ul?.rows).toHaveLength(0);
    expect(itog?.rows.length).toBeGreaterThan(0);
    expect(itog?.itogDeferred).toBeFalsy();
  });

  it("does not throw on sheet without id", () => {
    const wb = buildWorkbook({
      otpravka: [{ cargoPlace: "A", parcel: "111" }],
      ulPrio1: [parseUlMatrix(UL_SAMPLE, "02630423.xlsx")],
      ulPrio2: [],
    });
    (wb.sheets[0] as { id?: string }).id = undefined;
    expect(() => workbookForApi(wb)).not.toThrow();
  });

  it("defers itog when payload exceeds budget", () => {
    const wb = buildWorkbook({
      otpravka: [{ cargoPlace: "A", parcel: "111" }],
      ulPrio1: [],
      ulPrio2: [],
    });
    const itog = wb.sheets.find((s) => s.id === "itog")!;
    const bigRow: Record<string, string> = { parcel: "x" };
    for (let i = 0; i < 200; i++) bigRow[`c${i}`] = "x".repeat(500);
    itog.rows = Array.from({ length: 9000 }, (_, n) => ({ ...bigRow, num: n })) as typeof itog.rows;
    const api = workbookForApiWithinBudget(wb, 0);
    const apiItog = api.sheets.find((s) => s.id === "itog");
    expect(apiItog?.itogDeferred).toBe(true);
    expect(apiItog?.rows).toHaveLength(0);
    expect(() => JSON.stringify(api)).not.toThrow();
  });
});

describe("tdDocuments", () => {
  it("collectFixRows sorts by ul then line and maps tdNumber", () => {
    const wb = {
      sheets: [
        {
          id: "fix",
          name: "FIX",
          columns: [],
          rows: [
            { ul: "233", line: "2", id: "a", parcel: "p", translate: "n", qty: 1, weight: 1, cost: 1 },
            { ul: "232", line: "2", id: "b", parcel: "p", translate: "n", qty: 1, weight: 1, cost: 1 },
            { ul: "232", line: "1", id: "c", parcel: "p", translate: "n", qty: 1, weight: 1, cost: 1 },
          ],
        },
        { id: "ul-232", name: "232", columns: [], rows: [], tdNumber: "TD-232" },
        { id: "ul-233", name: "233", columns: [], rows: [], tdNumber: "TD-233" },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    const rows = collectFixRows(wb);
    expect(rows.map((r) => `${r.ul}/${r.line}`)).toEqual(["232/1", "232/2", "233/2"]);
    expect(rows[0]!.tdNumber).toBe("TD-232");
    expect(rows[2]!.tdNumber).toBe("TD-233");
  });

  it("collectFixRows maps tdNumber when ul differs by leading zeros", () => {
    const wb = {
      sheets: [
        {
          id: "fix",
          name: "FIX",
          columns: [],
          rows: [{ ul: "2606521", line: "1", id: "a", parcel: "p", translate: "n", qty: 1, weight: 1, cost: 1 }],
        },
        { id: "ul-02606521", name: "02606521", columns: [], rows: [], tdNumber: "TD-001" },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    expect(collectFixRows(wb)[0]!.tdNumber).toBe("TD-001");
  });

  it("collectFixRows and writeoff use translate column not ulData", () => {
    const wb = {
      sheets: [
        {
          id: "fix",
          name: "FIX",
          columns: [],
          rows: [{
            ul: "232",
            line: "1",
            id: "cp1",
            parcel: "P100",
            ulData: "English product",
            translate: "Английский товар",
            qty: 1,
            weight: 1,
            cost: 1,
          }],
        },
        {
          id: "itog",
          name: "итог",
          columns: [],
          rows: [{
            ul: "232",
            line: "1",
            id: "cp1",
            parcel: "P100",
            ulData: "English product",
            translate: "Английский товар",
            qty: 1,
            weight: 1,
            cost: 1,
          }],
        },
        {
          id: "ul-232",
          name: "232",
          columns: [],
          tdNumber: "TD-1",
          rows: [{
            rowNum: "1",
            cargoPlace: "cp1",
            parcel: "P100",
            name: "English product",
            inItog: 1,
            qty: 1,
            weight: 1,
            cost: 1,
          }],
        },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    expect(collectFixRows(wb)[0]!.name).toBe("Английский товар");
    const ulSheet = wb.sheets.find((s) => s.id === "ul-232")!;
    expect(collectWriteoffRowsForUl(wb, ulSheet, "232")[0]!.name).toBe("Английский товар");
  });

  it("specificationExportFileName transliterates document title", () => {
    expect(specificationExportFileName("Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026")).toBe(
      "Spetsifikatsiya No1 ot 02.06.2026 k CMR b-n ot 02.06.2026.xlsx",
    );
  });

  it("proformaExportFileName transliterates document title", () => {
    expect(proformaExportFileName("Счет-проформа №1 от 02.06.2026")).toBe(
      "Schet-proforma No1 ot 02.06.2026.xlsx",
    );
  });

  it("formatWriteoffTitle builds header from specification draft", async () => {
    const { formatWriteoffTitle, formatWriteoffTdLine } = await import("./tdDocuments/formatWriteoffHeader.js");
    const title = formatWriteoffTitle({
      sheetNumber: 1,
      ulNumber: "02612691",
      tdNumber: "10229010/280426/0113288",
      rows: [{ airport: "Калининград (KGD)" } as import("./tdDocuments/collectTdRows.js").UlWriteoffRow],
      specification: {
        exportPermit: "ВЫВОЗ РАЗРЕШЕН      28.04.2026",
        title: "Спецификация №1 от 28.04.2026 к CMR б/н от 19.03.2026",
      },
    });
    expect(title).toBe(
      "Дополнительный лист списания №1 от 28.04.2026 к упаковочному листу № 02612691 в Калининград (KGD) от 19.03.2026",
    );
    expect(formatWriteoffTdLine("10229010/280426/0113288")).toBe(
      "Вывезено по ТД 10229010/280426/0113288/ /",
    );
  });

  it("normalizeSpecificationDraft syncs exportPermit date from fts", () => {
    expect(
      normalizeSpecificationDraft({
        fts: "02 ФТС № от 15.03.2026",
        exportPermit: "ВЫВОЗ РАЗРЕШЕН      02.06.2026",
        title: "Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026",
      }).exportPermit,
    ).toContain("15.03.2026");
    expect(
      normalizeSpecificationDraft({
        fts: "02 ФТС № от 15.03.2026",
        exportPermit: "ВЫВОЗ РАЗРЕШЕН      02.06.2026",
        title: "Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026",
      }).title,
    ).toContain("15.03.2026");
  });

  it("syncProformaHeaderFromSpecification copies spec headerTd and dates to proforma export", async () => {
    const { syncProformaHeaderFromSpecification, resolveTdExportDraft } = await import(
      "./tdDocuments/resolveTdDraft.js"
    );
    const { buildProformaBuffer } = await import("./tdDocuments/buildProforma.js");
    const ExcelJS = await import("exceljs");

    const specification = {
      productEaeu: "ТОВАР ЕАЭС",
      exportPermit: "ВЫВОЗ РАЗРЕШЕН      15.03.2026",
      zpu: "01 ЗПУ №",
      fts: "02 ФТС № от 15.03.2026",
      title: "Спецификация №1 от 15.03.2026 к CMR б/н от 15.03.2026",
      headerTd: "10229010/280426/0113288",
    };
    const proforma = syncProformaHeaderFromSpecification(specification, {
      title: "Счет-проформа №1 от 02.06.2026",
    });
    expect(proforma.fts).toBe("02 ФТС № от 15.03.2026");
    expect(proforma.exportPermit).toContain("15.03.2026");
    expect(proforma.title).toContain("15.03.2026");

    const { proforma: exportProforma, headerTd } = resolveTdExportDraft({ specification, proforma: {} });
    expect(exportProforma.exportPermit).toContain("15.03.2026");
    expect(headerTd).toBe("10229010/280426/0113288");
    const buf = await buildProformaBuffer([], exportProforma, headerTd);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.getWorksheet("проформа") ?? wb.worksheets[0]!;
    expect(String(sheet.getCell(2, 5).value ?? sheet.getCell("E2").value ?? "")).toContain("15.03.2026");
    expect(String(sheet.getCell(4, 5).value ?? "")).toContain("15.03.2026");
    expect(String(sheet.getCell(5, 5).value ?? "")).toBe("10229010/280426/0113288");
  });

  it("buildProformaBuffer merges header within 7 columns and clears borders", async () => {
    const { buildProformaBuffer } = await import("./tdDocuments/buildProforma.js");
    const ExcelJS = await import("exceljs");
    const buf = await buildProformaBuffer(
      [{ num: 1, ul: "1", line: "1", id: "ID1", parcel: "P1", name: "Test", qty: 1, weight: 1, cost: 1, tdNumber: "TD", seal: "" }],
      {
        productEaeu: "ТОВАР ЕАЭС",
        exportPermit: "ВЫВОЗ РАЗРЕШЕН 02.06.2026",
        zpu: "01 ЗПУ №",
        fts: "02 ФТС № от 02.06.2026",
        title: "Счет-проформа №1 от 02.06.2026",
      },
      "10229010/280426/0113288",
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0]!;
    expect(sheet.columnCount).toBe(7);
    expect(sheet.model.merges).toContain("A7:G7");
    expect(sheet.model.merges).toContain("A8:G8");
    expect(sheet.model.merges).toContain("A5:D5");
    expect(sheet.model.merges).toContain("E5:G5");
    expect(sheet.model.merges).toContain("E1:G1");
    expect(sheet.getCell(7, 2).value).toBeNull();
    expect(sheet.getCell(1, 1).border?.top?.style).toBeFalsy();
    expect(sheet.getCell(10, 1).border?.top?.style).toBe("thin");
    expect(sheet.getCell(11, 7).border?.right?.style).toBe("thin");
    expect(String(sheet.getCell(12, 4).value ?? "")).toContain("Итого");
    expect(sheet.getCell(12, 5).value).toBe(1);
    expect(sheet.getCell(12, 6).value).toBe(1);
    expect(sheet.getCell(12, 7).value).toBe(1);
    expect(sheet.getCell(12, 4).font?.bold).toBe(true);
    expect(sheet.getCell(12, 6).numFmt).toBe("0.00");
    expect(sheet.getCell(12, 7).numFmt).toBe("#,##0.00");
    expect(sheet.getCell(12, 7).border?.bottom?.style).toBe("thin");
  });

  it("buildSpecificationBuffer merges header and clears borders", async () => {
    const { buildSpecificationBuffer } = await import("./tdDocuments/buildSpecification.js");
    const ExcelJS = await import("exceljs");
    const buf = await buildSpecificationBuffer(
      [{ num: 1, ul: "1", line: "1", id: "ID1", parcel: "P1", name: "Test", qty: 1, weight: 1, cost: 1, tdNumber: "TD", seal: "" }],
      {
        productEaeu: "ТОВАР ЕАЭС",
        exportPermit: "ВЫВОЗ РАЗРЕШЕН 02.06.2026",
        zpu: "01 ЗПУ №",
        fts: "02 ФТС № от 02.06.2026",
        title: "Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026",
        headerTd: "10229010/260526/0113288",
      },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheet = wb.worksheets[0]!;
    expect(sheet.model.merges).toContain("A7:H7");
    expect(sheet.model.merges).toContain("A8:H8");
    expect(sheet.model.merges).toContain("A5:D5");
    expect(sheet.getCell(7, 2).value).toBeNull();
    expect(sheet.getCell(1, 1).border?.top?.style).toBeFalsy();
    expect(sheet.getCell(12, 1).border?.top?.style).toBe("thin");
    expect(sheet.getCell(13, 8).border?.right?.style).toBe("thin");
    expect(String(sheet.getCell(14, 4).value ?? "")).toContain("Итого");
    expect(sheet.getCell(14, 5).value).toBe(1);
    expect(sheet.getCell(14, 8).border?.bottom?.style).toBe("thin");
    expect(sheet.getCell(12, 1).font?.size).toBe(10);
    expect(sheet.getCell(13, 1).font?.size).toBe(10);
  });

  it("splitDraftDateField parses and replaces embedded ru dates", () => {
    const exportPermit = "ВЫВОЗ РАЗРЕШЕН      02.06.2026";
    expect(splitDraftDateField("exportPermit", exportPermit).date).toBe("02.06.2026");
    expect(replaceDraftRuDate("exportPermit", exportPermit, "15.03.2026")).toContain("15.03.2026");

    const fts = "02 ФТС № от 02.06.2026";
    expect(splitDraftDateField("fts", fts).date).toBe("02.06.2026");
    expect(replaceDraftRuDate("fts", fts, "15.03.2026")).toBe("02 ФТС № от 15.03.2026");

    const title = "Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026";
    expect(splitDraftDateField("title", title).date).toBe("02.06.2026");
    expect(replaceDraftRuDate("title", title, "15.03.2026")).toBe(
      "Спецификация №1 от 15.03.2026 к CMR б/н от 02.06.2026",
    );
  });

  it("syncTitleDateFromFts copies fts date into both title dates", () => {
    const fts = "02 ФТС № от 15.03.2026";
    const title = "Спецификация №1 от 02.06.2026 к CMR б/н от 02.06.2026";
    expect(syncTitleDateFromFts(title, fts)).toBe(
      "Спецификация №1 от 15.03.2026 к CMR б/н от 15.03.2026",
    );
    expect(syncTitleDateFromFts("Спецификация №1 от 02.06.2026 к CMR", fts)).toBe(
      "Спецификация №1 от 15.03.2026 к CMR б/н от 15.03.2026",
    );
  });

  it("computeProformaTotals sums qty/weight/cost and counts unique UL as places", () => {
    const rows = [
      { ul: "232", qty: 2, weight: "0,397", cost: "7 990,00" },
      { ul: "232", qty: 1, weight: 1.427, cost: 650 },
      { ul: "233", qty: 1, weight: "0,199", cost: "1 495,00" },
    ] as import("./tdDocuments/collectTdRows.js").FixTdRow[];
    expect(computeProformaTotals(rows)).toEqual({
      places: 2,
      qty: 4,
      weight: 2.02,
      cost: 10135,
    });
  });

  it("computeProformaTotals rounds summed decimals to 2 places", () => {
    const rows = [
      { ul: "1", qty: 1, weight: 0.1, cost: 0.1 },
      { ul: "2", qty: 1, weight: 0.2, cost: 0.2 },
      { ul: "3", qty: 1, weight: 2681.85, cost: 9019377.27 },
    ] as import("./tdDocuments/collectTdRows.js").FixTdRow[];
    const totals = computeProformaTotals(rows);
    expect(totals.weight).toBe(2682.15);
    expect(totals.cost).toBe(9019377.57);
  });

  it("mergeWorkbookPatch keeps carrierId and tdNumber on deferred UL patch", () => {
    const stored = {
      sheets: [{
        id: "ul-02606521",
        name: "02606521",
        columns: [],
        rows: [{ rowNum: "1", parcel: "p", inItog: 1 }],
        carrierId: null,
        tdNumber: null,
      }],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    const incoming = {
      sheets: [{
        id: "ul-02606521",
        name: "02606521",
        columns: [],
        rows: [],
        carrierId: "42",
        tdNumber: "10229010/260526/0113288",
      }],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    const merged = mergeWorkbookPatch(stored, incoming);
    const ul = merged.sheets.find((s) => s.id === "ul-02606521");
    expect(ul?.carrierId).toBe("42");
    expect(ul?.tdNumber).toBe("10229010/260526/0113288");
    expect(ul?.rows).toHaveLength(1);
  });

  it("mergeWorkbookTdMeta keeps tdDraft edits over stale tdPrepared.draft", () => {
    const stored = {
      tdDraft: { specification: { headerTd: "NEW-TD", fts: "updated fts" } },
      tdPrepared: {
        preparedAt: "2026-01-01T00:00:00.000Z",
        fixRows: [{ ul: "1", line: "1", tdNumber: "OLD" } as import("./tdDocuments/collectTdRows.js").FixTdRow],
        writeoffs: [],
        draft: { specification: { headerTd: "OLD-TD", fts: "old fts" } },
      },
    };
    const incoming = { tdDraft: undefined, tdPrepared: undefined };
    const merged = mergeWorkbookPatch(
      {
        sheets: [],
        itogControlKeys: new Set<string>(),
        excludedUlNumbers: new Set<string>(),
        ...stored,
      },
      {
        sheets: [{ id: "itog", name: "итог", columns: [], rows: [{ ul: "1" }] }],
        itogControlKeys: new Set<string>(),
        excludedUlNumbers: new Set<string>(),
        ...incoming,
      },
    );
    expect(merged.tdDraft?.specification?.headerTd).toBe("NEW-TD");
    expect(merged.tdPrepared?.draft?.specification?.headerTd).toBe("NEW-TD");
    expect(merged.tdPrepared?.fixRows).toHaveLength(1);
  });

  it("mergeTdDraft combines specification and proforma fields", () => {
    const merged = mergeTdDraft(
      { specification: { headerTd: "A" } },
      { proforma: { title: "Proforma 1" }, specification: { fts: "fts text" } },
    );
    expect(merged?.specification).toEqual({ headerTd: "A", fts: "fts text" });
    expect(merged?.proforma).toEqual({ title: "Proforma 1" });
  });

  it("hydrateUlSheetFromParsed keeps carrierId and tdNumber from stored sheet", () => {
    const existing = {
      id: "ul-02611106",
      name: "02611106",
      columns: [],
      rows: [],
      carrierId: "42",
      tdNumber: "10229010/260526/0113288",
      ulDeferred: true,
    };
    const parsed = {
      ulNumber: "02611106",
      sheet: {
        rows: [{ rowNum: "1", cargoPlace: "cp", parcel: "p", airport: "", weight: 1, volume: 1, category: "", name: "n", qty: 1, cost: 1 }],
      },
    } as import("./types.js").ParsedUlFile;
    const hydrated = hydrateUlSheetFromParsed(existing, parsed, new Set(["026111061p"]));
    expect(hydrated.carrierId).toBe("42");
    expect(hydrated.tdNumber).toBe("10229010/260526/0113288");
    expect(hydrated.ulDeferred).toBe(false);
    expect(hydrated.rows.length).toBeGreaterThan(0);
  });

  it("buildTdPrepared stores fix rows and draft", () => {
    const wb = {
      sheets: [
        {
          id: "fix",
          name: "FIX",
          columns: [],
          rows: [{ ul: "232", line: "1", id: "a", parcel: "p", translate: "n", qty: 1, weight: 1, cost: 1 }],
        },
        {
          id: "ul-232",
          name: "232",
          columns: [],
          rows: [{ rowNum: "1", inItog: 1, cargoPlace: "id", parcel: "p", name: "x", qty: 1, weight: 1, cost: 1 }],
          tdNumber: "TD-232",
        },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    const prepared = buildTdPrepared(wb, new Map());
    expect(prepared.fixRows).toHaveLength(1);
    expect(prepared.fixRows[0]!.tdNumber).toBe("TD-232");
    expect(prepared.draft.specification?.headerTd).toBe("TD-232");
    expect(prepared.draft.specification?.fts).toContain("от");
    expect(prepared.draft.specification?.title).toContain("от");
    expect(prepared.writeoffs).toHaveLength(1);
  });

  it("isHolzCarrier detects Холз", () => {
    expect(isHolzCarrier({ id: "1", name: 'ООО «ХОЛЗ»', legalAddress: "", inn: "9706037094", kpp: "", loadingAddress: "", unloadingAddress: "", createdAt: "", updatedAt: "" })).toBe(true);
    expect(isHolzCarrier({ id: "2", name: "ООО Гео", legalAddress: "", inn: "123", kpp: "", loadingAddress: "", unloadingAddress: "", createdAt: "", updatedAt: "" })).toBe(false);
  });

  it("validateTdPrep requires FIX and tdNumber on UL with inItog rows", () => {
    const wb = {
      sheets: [
        {
          id: "ul-02612691",
          name: "02612691",
          columns: [],
          rows: [{ rowNum: "1", inItog: 1, cargoPlace: "id", parcel: "p", name: "x", qty: 1, weight: 1, cost: 1 }],
        },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
    };
    expect(validateTdPrep(wb).some((e) => e.includes("FIX"))).toBe(true);
    wb.sheets.push({ id: "fix", name: "FIX", columns: [], rows: [{ ul: "02612691", line: "1" }] });
    expect(validateTdPrep(wb).some((e) => e.includes("ТД"))).toBe(true);
  });

  it("buildWriteoffInputs uses live UL rows and tdNumber from workbook", async () => {
    const { buildWriteoffInputs } = await import("./tdDocuments/preview.js");
    const wb = {
      sheets: [
        {
          id: "ul-02606521",
          name: "02606521",
          columns: [],
          carrierId: "c1",
          tdNumber: "10229010/280426/0113288",
          rows: [
            { rowNum: "989", inItog: 1, cargoPlace: "id1", parcel: "p1", name: "item 1", qty: 1, weight: 1, cost: 1, airport: "Калининград (KGD)" },
            { rowNum: "990", inItog: 1, cargoPlace: "id2", parcel: "p2", name: "item 2", qty: 1, weight: 2, cost: 2, airport: "Калининград (KGD)" },
          ],
        },
      ],
      itogControlKeys: new Set<string>(),
      excludedUlNumbers: new Set<string>(),
      tdPrepared: {
        preparedAt: "2026-01-01T00:00:00.000Z",
        fixRows: [],
        writeoffs: [{
          ulNumber: "02606521",
          tdNumber: "",
          sheetNumber: 1,
          rows: [{ num: 1, ulNumber: "02606521", rowNum: "989", line: "989", id: "id1", parcel: "p1", airport: "", weight: 1, volume: 0, category: "", name: "old", qty: 1, cost: 1 }],
        }],
        draft: {},
      },
    };
    const inputs = buildWriteoffInputs({ workbook: wb, carriersById: new Map(), draft: {} });
    expect(inputs).toHaveLength(1);
    expect(inputs[0]!.rows).toHaveLength(2);
    expect(inputs[0]!.tdNumber).toBe("10229010/280426/0113288");
  });

  it("poruchenieFileName matches template naming", async () => {
    const { poruchenieFileName, carrierShortLabel } = await import("./tdDocuments/buildPoruchenie.js");
    expect(carrierShortLabel('ООО «Геологистика»')).toBe("Гео");
    expect(
      poruchenieFileName({
        ulNumber: "02612691",
        assignmentNumber: "6",
        carrier: { id: "1", name: 'ООО «Геологистика»', legalAddress: "", inn: "", kpp: "", loadingAddress: "", unloadingAddress: "", createdAt: "", updatedAt: "" },
      }),
    ).toBe("02612691_Поручение_Агенту_Холз_Гео_6.docx");
  });

  it("resolvePoruchenieUlDraft defaults date from specification fts", async () => {
    const { resolvePoruchenieUlDraft } = await import("./tdDocuments/formatPoruchenieDraft.js");
    const resolved = resolvePoruchenieUlDraft(
      { fts: "02 ФТС № от 28.04.2026" },
      3,
    );
    expect(resolved.number).toBe("3");
    expect(resolved.date).toBe("28.04.2026");
    expect(resolved.contractNumber).toBe("01/26");
    expect(resolved.contractDate).toBe("01.01.2026");
  });

  it("buildPoruchenieBuffer replaces header number, dates and contract", async () => {
    const { buildPoruchenieBuffer } = await import("./tdDocuments/buildPoruchenie.js");
    const PizZip = (await import("pizzip")).default;
    const buf = await buildPoruchenieBuffer({
      ulNumber: "02612691",
      assignmentNumber: "9",
      writeoffNumber: 6,
      tdNumber: "10229010/280426/0113288",
      date: "27.04.2026",
      contractNumber: "02/27",
      contractDate: "15.05.2026",
      carrier: {
        id: "1",
        name: "ООО «ТестПеревозчик»",
        legalAddress: "Москва",
        inn: "123",
        kpp: "456",
        loadingAddress: "",
        unloadingAddress: "",
        createdAt: "",
        updatedAt: "",
      },
      rows: [
        {
          num: 1,
          ulNumber: "02612691",
          rowNum: "5",
          line: "5",
          id: "GEOMR00-6947001",
          parcel: "10000195020905",
          airport: "KGD",
          weight: "0,658",
          volume: "0.1",
          category: "<>",
          name: "Test item",
          qty: "1",
          cost: "7996",
        },
      ],
    });
    const xml = new PizZip(buf).file("word/document.xml")?.asText() ?? "";
    const plain = [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((m) => m[1]).join("");
    expect(plain).toContain("ПОРУЧЕНИЕ № 9 от 27.04.2026");
    expect(plain).toContain("27 апреля 2026 г.");
    expect(plain).toContain("«ТестПеревозчик»");
    expect(plain).toContain("02/27 от 15.05.2026");
    expect(plain).toContain("агентского договора № 02/27 от 15.05.2026");
    expect(plain).toContain("ООО «Геологистика»");
    expect(plain).toContain("Мандров А.А");
  });

  it("buildPoruchenieBuffer fills template table rows", async () => {
    const { buildPoruchenieBuffer } = await import("./tdDocuments/buildPoruchenie.js");
    const PizZip = (await import("pizzip")).default;
    const buf = await buildPoruchenieBuffer({
      ulNumber: "02612691",
      assignmentNumber: "6",
      writeoffNumber: 6,
      tdNumber: "10229010/280426/0113288",
      date: "31.05.2026",
      carrier: {
        id: "1",
        name: "ООО «Геологистика»",
        legalAddress: "Москва",
        inn: "123",
        kpp: "456",
        loadingAddress: "",
        unloadingAddress: "",
        createdAt: "",
        updatedAt: "",
      },
      rows: [
        {
          num: 1,
          ulNumber: "02612691",
          rowNum: "5",
          line: "5",
          id: "GEOMR00-6947001",
          parcel: "10000195020905",
          airport: "KGD",
          weight: "0,658",
          volume: "0.1",
          category: "<>",
          name: "Test item",
          qty: "1",
          cost: "7996",
        },
      ],
    });
    expect(buf.length).toBeGreaterThan(1000);
    const zip = new PizZip(buf);
    const xml = zip.file("word/document.xml")?.asText() ?? "";
    expect(xml).toContain("Test item");
    expect(xml).toContain("GEOMR00-6947001");
    expect(xml).not.toContain("GEOMR00-6946998");
    const rowCount = (xml.match(/<w:tr[\s>]/g) ?? []).length;
    expect(rowCount).toBe(2);
  });
});
