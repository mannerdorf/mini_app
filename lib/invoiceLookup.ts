/** 1C display numbers omit the zero prefix; the document year remains a separate key. */
export function invoiceLookupNumber(value: unknown): string {
  return String(value ?? '').trim().replace(/^0000-/, '').replace(/^0+/, '').toUpperCase();
}
export function selectInvoiceDetail(items: Record<string, unknown>[], reference: Record<string, unknown>, year: string) {
  const number = invoiceLookupNumber(reference.Number ?? reference.number);
  let matches = items.filter(item => number && invoiceLookupNumber(item.Number ?? item.number) === number && String(item.DateDoc ?? item.Date ?? item.date ?? '').slice(0, 4) === year);
  const customer = String(reference.Customer ?? reference.customer ?? '').trim().toLowerCase();
  if (customer) matches = matches.filter(item => String(item.Customer ?? item.customer ?? '').trim().toLowerCase() === customer);
  if (matches.length > 1) throw new Error('Найдено несколько счетов с этим номером. Откройте нужный счёт в разделе «Счета» по дате и заказчику.');
  if (!matches.length) throw new Error(`Счёт за ${year} год не найден среди доступных документов. Проверьте период и доступ к заказчику.`);
  if (!Array.isArray(matches[0].List)) throw new Error('Сервер вернул счёт без подробностей. Обновите данные и повторите загрузку.');
  return matches[0];
}
