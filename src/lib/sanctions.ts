export type SanctionVerdict = "sanctioned" | "clear" | "review";

export type SanctionCheckResult = {
  verdict: SanctionVerdict;
  tnvedCode: string;
  reason: string;
  matchedBy: "tnved" | "keyword" | "dictionary" | "none";
};

type TnvedDictionaryEntry = {
  pattern: RegExp;
  code: string;
  reason: string;
};

type SanctionRule = {
  type: "tnved_prefix" | "keyword";
  value: string | RegExp;
  verdict: Exclude<SanctionVerdict, "clear">;
  reason: string;
};

const TNVED_DICTIONARY: TnvedDictionaryEntry[] = [
  { pattern: /болт|винт/i, code: "731815", reason: "крепеж из черных металлов, требуется уточнение материала" },
  { pattern: /гайк/i, code: "731816", reason: "гайки из черных металлов" },
  { pattern: /шайб/i, code: "731822", reason: "шайбы из черных металлов" },
  { pattern: /подшипник/i, code: "8482", reason: "подшипники" },
  { pattern: /клапан|вентил/i, code: "8481", reason: "клапаны/арматура" },
  { pattern: /насос/i, code: "8413", reason: "насосы" },
  { pattern: /двигател|электродвиг/i, code: "8501", reason: "двигатели/электродвигатели" },
  { pattern: /микросхем|чип|процессор/i, code: "8542", reason: "интегральные схемы" },
  { pattern: /цемент/i, code: "2523", reason: "цемент" },
  { pattern: /древес|фанер|пиломат/i, code: "44", reason: "древесина и изделия из древесины" },
  { pattern: /стекл/i, code: "70", reason: "стекло и изделия из стекла" },
  { pattern: /алюмин/i, code: "76", reason: "алюминий и изделия из алюминия" },
  { pattern: /бумаг|картон/i, code: "48", reason: "бумага/картон" },
  { pattern: /гипс/i, code: "2520", reason: "гипс" },
];

const SANCTION_RULES: SanctionRule[] = [
  { type: "tnved_prefix", value: "72", verdict: "sanctioned", reason: "черные металлы" },
  { type: "tnved_prefix", value: "73", verdict: "sanctioned", reason: "изделия из черных металлов" },
  { type: "tnved_prefix", value: "2523", verdict: "sanctioned", reason: "цемент" },
  { type: "tnved_prefix", value: "44", verdict: "sanctioned", reason: "древесина/изделия из древесины" },
  { type: "tnved_prefix", value: "70", verdict: "sanctioned", reason: "стекло/изделия из стекла" },
  { type: "tnved_prefix", value: "76", verdict: "sanctioned", reason: "алюминий/изделия из алюминия" },
  { type: "tnved_prefix", value: "48", verdict: "sanctioned", reason: "бумага/картон" },
  { type: "tnved_prefix", value: "2520", verdict: "sanctioned", reason: "гипс" },
  { type: "tnved_prefix", value: "2701", verdict: "sanctioned", reason: "уголь" },
  { type: "tnved_prefix", value: "2710", verdict: "sanctioned", reason: "нефтепродукты" },
  { type: "tnved_prefix", value: "31", verdict: "sanctioned", reason: "удобрения" },
  { type: "tnved_prefix", value: "2203", verdict: "sanctioned", reason: "алкогольная продукция" },
  { type: "tnved_prefix", value: "8482", verdict: "review", reason: "подшипники из списка усиленного контроля Литвы" },
  { type: "tnved_prefix", value: "8481", verdict: "review", reason: "клапаны/арматура из списка усиленного контроля Литвы" },
  { type: "tnved_prefix", value: "8501", verdict: "review", reason: "электродвигатели из списка усиленного контроля Литвы" },
  { type: "tnved_prefix", value: "8542", verdict: "review", reason: "микросхемы/электроника из списка усиленного контроля Литвы" },
  { type: "keyword", value: /болт|винт|гайк|шайб/i, verdict: "sanctioned", reason: "крепеж обычно попадает в группу 7318" },
  { type: "keyword", value: /подшипник/i, verdict: "review", reason: "ключевое слово для 8482" },
  { type: "keyword", value: /клапан|вентил/i, verdict: "review", reason: "ключевое слово для 8481" },
];

export function normalizeTnvedCode(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "").trim();
}

export function pickNomenclatureText(parcel: any): string {
  const goodsRaw = parcel?.Товары ?? parcel?.Goods ?? parcel?.goods;
  const goods = Array.isArray(goodsRaw) ? goodsRaw[0] : (goodsRaw && typeof goodsRaw === "object" ? goodsRaw : {});
  return String(
    goods?.ТМЦ ??
      goods?.Номенклатура ??
      goods?.Nomenclature ??
      goods?.Name ??
      goods?.SKU ??
      parcel?.ТМЦ ??
      parcel?.Номенклатура ??
      parcel?.Nomenclature ??
      parcel?.Name ??
      ""
  ).trim();
}

export function resolveTnvedByNomenclature(nomenclature: string): SanctionCheckResult {
  const text = String(nomenclature ?? "").trim();
  if (!text) {
    return { verdict: "review", tnvedCode: "", reason: "нет номенклатуры для определения ТН ВЭД", matchedBy: "none" };
  }
  const matched = TNVED_DICTIONARY.find((entry) => entry.pattern.test(text));
  if (!matched) {
    return { verdict: "review", tnvedCode: "", reason: "ТН ВЭД не найден по справочнику номенклатуры", matchedBy: "none" };
  }
  return { verdict: "review", tnvedCode: matched.code, reason: matched.reason, matchedBy: "dictionary" };
}

export function checkSanctionsByNomenclature(nomenclature: string, tnved?: unknown): SanctionCheckResult {
  const resolved = normalizeTnvedCode(tnved) ? {
    verdict: "review" as const,
    tnvedCode: normalizeTnvedCode(tnved),
    reason: "код ТН ВЭД задан в данных",
    matchedBy: "tnved" as const,
  } : resolveTnvedByNomenclature(nomenclature);

  const code = resolved.tnvedCode;
  if (code) {
    const codeRule = SANCTION_RULES.find((rule) => rule.type === "tnved_prefix" && code.startsWith(String(rule.value)));
    if (codeRule) {
      return { verdict: codeRule.verdict, tnvedCode: code, reason: codeRule.reason, matchedBy: "tnved" };
    }
  }

  const keywordRule = SANCTION_RULES.find((rule) => rule.type === "keyword" && rule.value instanceof RegExp && rule.value.test(nomenclature));
  if (keywordRule) {
    return { verdict: keywordRule.verdict, tnvedCode: code, reason: keywordRule.reason, matchedBy: "keyword" };
  }

  if (!code) return resolved;
  return { verdict: "clear", tnvedCode: code, reason: "совпадений с текущим санкционным справочником не найдено", matchedBy: "tnved" };
}

export function mergeSanctionVerdicts(results: SanctionCheckResult[]): SanctionCheckResult {
  const sanctioned = results.find((result) => result.verdict === "sanctioned");
  if (sanctioned) return sanctioned;
  const review = results.find((result) => result.verdict === "review");
  if (review) return review;
  return { verdict: "clear", tnvedCode: "", reason: "совпадений с текущим санкционным справочником не найдено", matchedBy: "none" };
}
