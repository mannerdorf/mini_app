export const GOODS_NAME_1C_MAX_LENGTH = 49;

/** Обрезает наименование товара под лимит поля Name в 1С. */
export function truncateGoodsNameFor1c(value: unknown, fallback = ""): string {
  const name = String(value ?? "").trim() || fallback;
  if (!name) return "";
  return name.length > GOODS_NAME_1C_MAX_LENGTH ? name.slice(0, GOODS_NAME_1C_MAX_LENGTH) : name;
}

