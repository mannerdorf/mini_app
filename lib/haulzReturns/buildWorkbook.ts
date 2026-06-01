import type {
  CellValue,
  HaulzSheet,
  HaulzSheetRow,
  HaulzWorkbook,
  OtpravkaRow,
  ParsedUlFile,
  UlDataRow,
} from "./types";
import { FIX_COLUMNS, ITog_HEADERS, UL_HEADERS } from "./types";
import { STOP_WORDS } from "./stopWords";
import { mergeUlFiles } from "./parseUl.js";
import {
  countUlPlaces,
  stopColumnValue,
  validateItogRow,
} from "./validators";
import type { ParsedUlFile as UlFile } from "./types";

export type BuildInput = {
  otpravka: OtpravkaRow[];
  ulPrio1: ParsedUlFile[];
  ulPrio2: ParsedUlFile[];
};

type UlMatch = {
  ulNumber: string;
  row: UlDataRow;
};

function findParcelInUl(
  ulPrio1: ParsedUlFile[],
  ulPrio2: ParsedUlFile[],
  parcel: string,
): UlMatch | null {
  for (const file of ulPrio1) {
    for (const row of file.sheet.rows) {
      if (row.parcel === parcel) {
        return { ulNumber: file.ulNumber, row };
      }
    }
  }
  for (const file of ulPrio2) {
    for (const row of file.sheet.rows) {
      if (row.parcel === parcel) {
        return { ulNumber: file.ulNumber, row };
      }
    }
  }
  return null;
}

function plombyLookup(otpravka: OtpravkaRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of otpravka) {
    if (!map.has(r.parcel)) map.set(r.parcel, r.cargoPlace);
  }
  return map;
}

function countParcelDuplicates(parcels: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const p of parcels) {
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

export type ItogRowInternal = {
  num: number;
  ul: string;
  line: string;
  id: string;
  parcel: string;
  ulData: string;
  translate: string;
  qty: CellValue;
  weight: CellValue;
  cost: CellValue;
  seal: string;
  ulPlaces: number;
  stop: string;
  chars: number;
  control: string;
  englishOnly: boolean;
  au585: boolean;
  digitsOnly: boolean;
  pinkList: boolean;
  _rowId: string;
};

function buildItogRows(
  otpravka: OtpravkaRow[],
  ulPrio1: ParsedUlFile[],
  ulPrio2: ParsedUlFile[],
  sealMap: Map<string, string>,
): ItogRowInternal[] {
  const rows: ItogRowInternal[] = [];
  let num = 0;

  for (const o of otpravka) {
    num++;
    const match = findParcelInUl(ulPrio1, ulPrio2, o.parcel);
    const ul = match?.ulNumber ?? "";
    const line = match?.row.rowNum ?? "";
    const id = match?.row.cargoPlace ?? "";
    const ulData = match?.row.name ?? "";
    const qty = match?.row.qty ?? "";
    const weight = match?.row.weight ?? "";
    const cost = match?.row.cost ?? "";
    const seal = sealMap.get(o.parcel) ?? "";
    const validation = validateItogRow(ulData);

    rows.push({
      num,
      ul,
      line,
      id,
      parcel: o.parcel,
      ulData,
      translate: "",
      qty,
      weight,
      cost,
      seal,
      ulPlaces: 0,
      stop: stopColumnValue(ulData),
      chars: ulData.length,
      control: `${ul}${line}${o.parcel}`,
      englishOnly: validation.englishOnly,
      au585: validation.au585,
      digitsOnly: validation.digitsOnly,
      pinkList: validation.pinkList,
      _rowId: `itog-${num}-${o.parcel}`,
    });
  }

  const idUlPairs = rows.map((r) => ({ ul: r.ul, id: r.id }));
  for (const r of rows) {
    r.ulPlaces = countUlPlaces(idUlPairs, r.ul);
  }

  return rows;
}

function itogToSheetRows(rows: ItogRowInternal[]): HaulzSheetRow[] {
  return rows.map((r) => ({
    _rowId: r._rowId,
    num: r.num,
    ul: r.ul,
    line: r.line,
    id: r.id,
    parcel: r.parcel,
    ulData: r.ulData,
    translate: r.translate,
    qty: r.qty,
    weight: r.weight,
    cost: r.cost,
    seal: r.seal,
    ulPlaces: r.ulPlaces,
    stop: r.stop,
    chars: r.chars,
    control: r.control,
    englishOnly: r.englishOnly,
    au585: r.au585,
    digitsOnly: r.digitsOnly,
    pinkList: r.pinkList,
  }));
}

function buildKgdSheet(otpravka: OtpravkaRow[], ulPrio1: ParsedUlFile[], ulPrio2: ParsedUlFile[]): HaulzSheet {
  const dupCounts = countParcelDuplicates(otpravka.map((o) => o.parcel));
  const rows: HaulzSheetRow[] = otpravka.map((o, i) => {
    const match = findParcelInUl(ulPrio1, ulPrio2, o.parcel);
    return {
      _rowId: `kgd-${i}`,
      ul: match?.ulNumber ?? "",
      line: match?.row.rowNum ?? "",
      parcel: o.parcel,
      dupCount: dupCounts.get(o.parcel) ?? 0,
    };
  });
  return {
    id: "kgd",
    name: "KGD!",
    columns: [
      { key: "ul", label: "" },
      { key: "line", label: "Строка" },
      { key: "parcel", label: "посылка" },
      { key: "dupCount", label: "" },
    ],
    rows,
  };
}

function buildPlombySheet(otpravka: OtpravkaRow[]): HaulzSheet {
  return {
    id: "plomby",
    name: "пломбы",
    columns: [
      { key: "parcel", label: "" },
      { key: "cargoPlace", label: "" },
    ],
    rows: otpravka.map((o, i) => ({
      _rowId: `plomby-${i}`,
      parcel: o.parcel,
      cargoPlace: o.cargoPlace,
    })),
  };
}

function buildStopSheet(): HaulzSheet {
  return {
    id: "stop",
    name: "STOP",
    columns: [
      { key: "word", label: "" },
      { key: "result", label: "" },
    ],
    rows: STOP_WORDS.map((w, i) => ({
      _rowId: `stop-${i}`,
      word: w.word,
      result: w.result,
    })),
  };
}

export function buildUlSheetForParsedFile(file: ParsedUlFile, controlKeys: Set<string>): HaulzSheet {
  const rows: HaulzSheetRow[] = file.sheet.rows.map((row, i) => {
    const controlKey = `${file.ulNumber}${row.rowNum}${row.parcel}`;
    const inItog = controlKeys.has(controlKey) ? 1 : 0;
    return {
      _rowId: `${file.ulNumber}-${i}`,
      rowNum: row.rowNum,
      cargoPlace: row.cargoPlace,
      parcel: row.parcel,
      airport: row.airport,
      weight: row.weight,
      volume: row.volume,
      category: row.category,
      name: row.name,
      qty: row.qty,
      cost: row.cost,
      mark: file.ulNumber,
      rowNumMirror: row.rowNum,
      cargoMirror: row.cargoPlace,
      inItog,
    };
  });
  return {
    id: `ul-${file.ulNumber}`,
    name: file.ulNumber,
    columns: UL_HEADERS,
    rows,
  };
}

export function buildWorkbook(input: BuildInput): HaulzWorkbook {
  const { otpravka, ulPrio1, ulPrio2 } = input;
  const ulSheets = mergeUlFiles(ulPrio1, ulPrio2);
  const sealMap = plombyLookup(otpravka);
  const itogInternal = buildItogRows(otpravka, ulPrio1, ulPrio2, sealMap);
  const controlKeys = new Set(itogInternal.map((r) => r.control));

  const sheets: HaulzSheet[] = [
    {
      id: "itog",
      name: "итог",
      columns: ITog_HEADERS,
      rows: itogToSheetRows(itogInternal),
    },
    buildKgdSheet(otpravka, ulPrio1, ulPrio2),
    buildPlombySheet(otpravka),
    buildStopSheet(),
    ...ulSheets.map((f) => buildUlSheetForParsedFile(f, controlKeys)),
  ];

  return { sheets, itogControlKeys: controlKeys };
}

export function recalcWorkbookAfterItogChange(workbook: HaulzWorkbook): HaulzWorkbook {
  const itogSheet = workbook.sheets.find((s) => s.id === "itog");
  if (!itogSheet) return workbook;

  const idUlPairs = itogSheet.rows.map((r) => ({
    ul: String(r.ul ?? ""),
    id: String(r.id ?? ""),
  }));

  const updatedItogRows = itogSheet.rows.map((r, idx) => {
    const ulData = String(r.ulData ?? "");
    const validation = validateItogRow(ulData);
    const ul = String(r.ul ?? "");
    return {
      ...r,
      num: idx + 1,
      ulPlaces: countUlPlaces(idUlPairs, ul),
      stop: stopColumnValue(ulData),
      chars: ulData.length,
      englishOnly: validation.englishOnly,
      au585: validation.au585,
      digitsOnly: validation.digitsOnly,
      pinkList: validation.pinkList,
    };
  });

  const controlKeys = new Set(
    updatedItogRows.map((r) => String(r.control ?? "")),
  );

  const sheets = workbook.sheets.map((sheet) => {
    if (sheet.id === "itog") {
      return { ...sheet, rows: updatedItogRows };
    }
    if (sheet.id.startsWith("ul-")) {
      return {
        ...sheet,
        rows: sheet.rows.map((row) => {
          const key = `${row.mark ?? ""}${row.rowNum ?? ""}${row.parcel ?? ""}`;
          return { ...row, inItog: controlKeys.has(key) ? 1 : 0 };
        }),
      };
    }
    return sheet;
  });

  return { sheets, itogControlKeys: controlKeys };
}

export function buildFixSheetFromItog(itogSheet: HaulzSheet): HaulzSheet {
  return {
    id: "fix",
    name: "FIX",
    columns: FIX_COLUMNS,
    rows: itogSheet.rows.map((r) => {
      const out: HaulzSheetRow = { _rowId: r._rowId };
      for (const col of FIX_COLUMNS) {
        out[col.key] = r[col.key] ?? "";
      }
      return out;
    }),
  };
}

export type { UlFile };
