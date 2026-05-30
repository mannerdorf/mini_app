/**
 * API заявок / ПВЗ (раздел «Документы» → новая заявка).
 */

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
};

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
  const data = (await res.json().catch(() => ({}))) as { pvz?: PvzItem[] };
  return data?.pvz || [];
}
