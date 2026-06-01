/** Справочник STOP из эталонной таблицы (лист STOP). */
export const STOP_WORDS: { word: string; result: string }[] = [
  { word: "Личные вещи", result: "STOP" },
  { word: "Документы", result: "STOP" },
  { word: "Пустаябутылка", result: "STOP" },
  { word: "Пустая бутылка", result: "STOP" },
  { word: "бутылка", result: "STOP" },
  { word: "Личныевещи", result: "STOP" },
  { word: "пакет", result: "STOP" },
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
  { word: "опись", result: "STOP" },
  { word: "вещи", result: "STOP" },
  { word: "карта", result: "STOP" },
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
  { word: "other", result: "STOP" },
  { word: "device", result: "STOP" },
  { word: "tools", result: "STOP" },
  { word: "橡皮绑带", result: "STOP" },
  { word: "case", result: "STOP" },
  { word: "Другое", result: "STOP" },
  { word: "ruler", result: "STOP" },
  { word: "clothes", result: "STOP" },
  { word: "connector", result: "STOP" },
  { word: "pendants", result: "STOP" },
  { word: "Stickers", result: "STOP" },
  { word: "Fittings", result: "STOP" },
  { word: "Bangles", result: "STOP" },
  { word: "Bracelets", result: "STOP" },
  { word: "lockparts", result: "STOP" },
  { word: "Renault", result: "STOP" },
  { word: "Printers", result: "STOP" },
];

const STOP_MAP = new Map(STOP_WORDS.map((e) => [e.word, e.result]));

export function lookupStopExact(text: string): string {
  const t = text.trim();
  if (!t) return "OK";
  return STOP_MAP.get(t) ?? "OK";
}
