/** Reviewed service content is separate from editorial articles and CMS news. */
export type ServiceContent = {
  slug: string; title: string; description: string; answer: string;
  status: 'draft' | 'approved'; approvedAt?: string; reviewedAt: string; validUntil: string;
  factIds: string[];
  sections: { id: string; title: string; text: string }[];
  questions: { question: string; answer: string }[];
};
export const SERVICE_CONTENT: ServiceContent[] = [{
  slug: 'sbornye-gruzy', title: 'Сборные грузы между Москвой и Калининградом',
  description: 'Сборная перевозка Москва ↔ Калининград: направления, забор и доставка до адреса, параметры для расчёта стоимости.',
  answer: 'Сборная перевозка — доставка партии вместе с грузами других отправителей. HAULZ перевозит сборные грузы из Москвы в Калининград и обратно. Доступны передача на складе, забор у отправителя и доставка до адреса. Для предварительного расчёта укажите направление, вес, размеры и условия забора и доставки.',
  status: 'approved', approvedAt: '2026-10-01', reviewedAt: '2026-10-01', validUntil: '2026-10-31',
  factIds: ['service.route', 'service.groupage', 'service.door', 'service.warehouse', 'product.calculator_scope'],
  sections: [
    { id: 'directions', title: 'Два направления. Один понятный процесс.', text: 'Отправка из Москвы в Калининград и из Калининграда в Москву. Выберите направление при расчёте — от него зависят условия вашей перевозки.' },
    { id: 'handover', title: 'Со склада или от вашего адреса', text: 'Можно передать груз на складе либо указать адрес забора. Для получателя также доступны склад и доставка до адреса. Эти варианты нужно учитывать отдельно при расчёте.' },
    { id: 'estimate', title: 'Стоимость — по параметрам вашего груза', text: 'Подготовьте вес, размеры грузовых мест и адреса, если нужен забор или доставка. Калькулятор даёт предварительный расчёт; окончательные условия конкретного груза уточняются при оформлении.' },
    { id: 'steps', title: 'От расчёта к отправке', text: 'Выберите направление, внесите параметры груза и способ передачи. Проверьте предварительный расчёт, затем передайте заявку на оформление. До передачи груза уточните требования к его подготовке и документам.' },
  ],
  questions: [
    { question: 'Можно отправить груз из Калининграда в Москву?', answer: 'Да. Сборные перевозки доступны в обоих направлениях: Москва → Калининград и Калининград → Москва.' },
    { question: 'Обязательно самостоятельно приезжать на склад?', answer: 'Нет. Можно выбрать забор у отправителя и доставку до адреса. Укажите эти условия при расчёте.' },
    { question: 'Цена в калькуляторе окончательная?', answer: 'Калькулятор показывает предварительный расчёт. Стоимость зависит от параметров груза и выбранных условий забора и доставки.' },
    { question: 'Какие грузы можно отправить?', answer: 'Для конкретного груза сначала уточните условия при оформлении. Доступность сборной перевозки сама по себе не подтверждает приём опасных или других специальных грузов.' },
  ],
}];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  const date = new Date(value);
  return datePattern.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isPublishedService(service: ServiceContent, now = new Date()): boolean {
  const today = now.toLocaleDateString('sv-SE', {timeZone: 'Europe/Moscow'});
  return service.status === 'approved' && !!service.approvedAt &&
    [service.approvedAt, service.reviewedAt, service.validUntil].every(validDate) &&
    service.approvedAt <= today && service.reviewedAt <= today && today <= service.validUntil &&
    service.reviewedAt <= service.validUntil;
}
export function publishedServicePaths(now = new Date()): string[] {
  return SERVICE_CONTENT.filter(s => isPublishedService(s, now)).map(s => `/uslugi/${s.slug}`);
}
