/**
 * API заявок / ПВЗ (раздел «Документы» → новая заявка).
 */

export type PvzConfirmedCoords = {
  latitude: number;
  longitude: number;
  fullAddress?: string;
};

export type PvzItem = {
  Ссылка: string;
  Наименование: string;
  КодДляПечати: string;
  ГородНаименование: string;
  РегионНаименование: string;
  ВладелецИНН: string;
  ВладелецНаименование: string;
  ОтправительПолучательНаименование: string;
  КонтактноеЛицо: string;
  ПодтвержденныеКоординаты?: PvzConfirmedCoords;
};

export function pvzItemConfirmedCoords(item: PvzItem | null | undefined): PvzConfirmedCoords | null {
  const c = item?.ПодтвержденныеКоординаты;
  if (!c || !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return null;
  return c;
}

export async function fetchPvzList(auth: {
  login: string;
  password: string;
  inn?: string | null;
}): Promise<PvzItem[]> {
  const res = await fetch("/api/pvz-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login: auth.login,
      password: auth.password,
      inn: auth.inn || undefined,
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { pvz?: PvzItem[]; error?: string };
  if (!res.ok) {
    throw new Error(data?.error || `Ошибка загрузки ПВЗ (${res.status})`);
  }
  return data?.pvz || [];
}
