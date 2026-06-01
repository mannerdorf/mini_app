import { describe, expect, it } from "vitest";
import { buildWorkbook } from "./buildWorkbook";
import { parseOtpravkaMatrix } from "./parseOtpravka";
import { parseUlMatrix } from "./parseUl";
import {
  isEnglishOnly,
  isPinkListMatch,
  stopColumnValue,
} from "./validators";

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
});

describe("buildWorkbook", () => {
  it("builds итог with matched UL data", () => {
    const otpravka = parseOtpravkaMatrix(OTPRAVKA_SAMPLE);
    const ul = parseUlMatrix(UL_SAMPLE, "02630423.xlsx");
    const wb = buildWorkbook({ otpravka, ulFiles: [ul] });
    const itog = wb.sheets.find((s) => s.id === "itog")!;
    expect(itog.rows).toHaveLength(2);
    expect(itog.rows[0].ul).toBe("02630423");
    expect(itog.rows[0].ulData).toBe("Test item");
    expect(itog.rows[0].seal).toBe("10000211381829");
    const ulSheet = wb.sheets.find((s) => s.id === "ul-02630423")!;
    expect(ulSheet.rows[0].inItog).toBe(1);
  });
});
