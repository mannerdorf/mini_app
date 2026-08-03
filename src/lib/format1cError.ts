/** Короткое сообщение об ошибке 1С для UI (без дампа модуля). */
export function shorten1cError(message: string): string {
  const raw = String(message ?? "").trim();
  if (!raw) return "Ошибка 1С";

  const notDefined = raw.match(/не определена\s*\(([^)]+)\)/i);
  if (notDefined?.[1]) {
    const fn = notDefined[1].trim();
    if (/^GetCustomer$/i.test(fn)) {
      return "В 1С нет метода GetCustomer — используется Getcustomers с Inn";
    }
    return `Метод 1С «${fn}» недоступен`;
  }

  if (/GetCustomer/i.test(raw) && /не определена|not defined/i.test(raw)) {
    return "В 1С нет метода GetCustomer — используется Getcustomers с Inn";
  }

  if (raw.length > 120) {
    const tail = raw.match(/:\s*([^:{}]{10,120})$/);
    if (tail?.[1]) return tail[1].trim();
    return `${raw.slice(0, 117)}…`;
  }

  return raw;
}
