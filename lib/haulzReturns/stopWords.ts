/** Справочник STOP из эталонной таблицы (лист STOP). */
export type StopMatchMode = "exact" | "partial";

export const STOP_MATCH_MODE_LABELS: Record<StopMatchMode, string> = {
  exact: "Точное совпадение",
  partial: "Частичное совпадение",
};

export type StopWordEntry = {
  word: string;
  result: string;
  matchMode?: StopMatchMode;
};

export const STOP_WORDS: StopWordEntry[] = [
  { word: "Личные вещи", result: "STOP" },
  { word: "Документы", result: "STOP" },
  { word: "Пустаябутылка", result: "STOP" },
  { word: "Пустая бутылка", result: "STOP" },
  { word: "бутылка", result: "STOP", matchMode: "partial" },
  { word: "Личныевещи", result: "STOP" },
  { word: "пакет", result: "STOP", matchMode: "partial" },
  { word: "Конверт", result: "STOP" },
  { word: "Докуметы", result: "STOP" },
  { word: "документы УПД", result: "STOP" },
  {
    word: "Документы и печатная продукция ТН ВЭД (4901990000); Товары народного потребления ТН ВЭД (6204199000); Косметика и парфюмерия ТН ВЭД (3304990000)",
    result: "STOP",
  },
  { word: "товары интернет-магазина; товары интернет-магазина", result: "STOP" },
  { word: "Товар-подмена", result: "STOP" },
  { word: "приложена опись", result: "STOP" },
  { word: "опись", result: "STOP", matchMode: "partial" },
  { word: "вещи", result: "STOP", matchMode: "partial" },
  { word: "карта", result: "STOP", matchMode: "partial" },
  {
    word: "Вино игристое Ле Гран Нуар Брют Резерв, Ле Гран Нуар Розе, Ханс Баер Рислинг Зект, Нипоццано Ризеррва",
    result: "STOP",
  },
  { word: "докумениы", result: "STOP" },
  { word: "DOCUMENT", result: "STOP" },
  { word: "товары интернет-магазина", result: "STOP" },
  { word: "Документ", result: "STOP" },
  { word: "Товарподмена", result: "STOP" },
  { word: "Товары народного потребления", result: "STOP" },
  { word: "Одежда", result: "STOP" },
  { word: "SIM-карта", result: "STOP" },
  { word: "Не указано", result: "STOP" },
  { word: "other", result: "STOP", matchMode: "partial" },
  { word: "device", result: "STOP", matchMode: "partial" },
  { word: "tools", result: "STOP", matchMode: "partial" },
  { word: "橡皮绑带", result: "STOP" },
  { word: "case", result: "STOP", matchMode: "partial" },
  { word: "Другое", result: "STOP" },
  { word: "ruler", result: "STOP", matchMode: "partial" },
  { word: "clothes", result: "STOP", matchMode: "partial" },
  { word: "connector", result: "STOP", matchMode: "partial" },
  { word: "pendants", result: "STOP", matchMode: "partial" },
  { word: "Stickers", result: "STOP", matchMode: "partial" },
  { word: "Fittings", result: "STOP", matchMode: "partial" },
  { word: "Bangles", result: "STOP", matchMode: "partial" },
  { word: "Bracelets", result: "STOP", matchMode: "partial" },
  { word: "lockparts", result: "STOP", matchMode: "partial" },
  { word: "Renault", result: "STOP", matchMode: "partial" },
  { word: "Printers", result: "STOP", matchMode: "partial" },
];

const STOP_MAP = new Map(STOP_WORDS.map((e) => [e.word, e.result]));

export function normalizeStopMatchMode(raw: unknown): StopMatchMode {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "partial" ? "partial" : "exact";
}

function stopRowMatches(text: string, word: string, mode: StopMatchMode): boolean {
  const t = text.trim();
  const w = word.trim();
  if (!t || !w) return false;
  if (mode === "partial") {
    return t.toLocaleLowerCase("ru").includes(w.toLocaleLowerCase("ru"));
  }
  return t === w;
}

export function lookupStopFromRows(
  text: string,
  rows: { word?: unknown; result?: unknown; matchMode?: unknown }[],
): string {
  const t = text.trim();
  if (!t) return "OK";
  for (const row of rows) {
    const word = String(row.word ?? "").trim();
    if (!word) continue;
    const mode = normalizeStopMatchMode(row.matchMode);
    if (stopRowMatches(t, word, mode)) {
      return String(row.result ?? "STOP");
    }
  }
  return "OK";
}

export function lookupStopExact(text: string): string {
  const t = text.trim();
  if (!t) return "OK";
  return STOP_MAP.get(t) ?? "OK";
}
