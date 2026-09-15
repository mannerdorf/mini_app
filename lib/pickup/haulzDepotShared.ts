/** Без node-зависимостей — можно импортировать из фронтенда. */
export function isHaulzDepotResource(data: Record<string, string>): boolean {
  return data.haulz === "true" || data.code === "WH_MSK" || data.code === "WH_KGD";
}
