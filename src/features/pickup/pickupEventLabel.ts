const labels: Record<string,string> = {
  set_job_billing: 'Изменены расчёты с заказчиком', set_job_order: 'Изменён номер заявки',
  set_job_status: 'Изменён статус забора', save_job: 'Забор сохранён', delete_job: 'Забор удалён',
  save_route: 'Маршрут сохранён', delete_route: 'Маршрут удалён', assign: 'Заборы назначены на маршрут',
  reorder: 'Изменён порядок точек', publish: 'Маршрут опубликован', start: 'Водитель приступил к маршруту',
  acknowledge: 'Водитель подтвердил маршрут', finish: 'Маршрут завершён', deposit: 'Груз сдан на склад',
  arrive: 'Водитель прибыл на точку', complete: 'Груз забран', problem: 'Сообщение о проблеме',
  cancel: 'Забор отменён', assign_many: 'Заборы назначены на маршрут',
  save_resource: 'Справочник обновлён', delete_resource: 'Запись справочника удалена',
  location_unreliable: 'Водитель сообщил о неверной позиции GPS', billing_send: 'Передача стоимости в 1С',
  resolve: 'Проблема рассмотрена диспетчером', cancel_job: 'Забор отменён',
};
export function pickupEventLabel(action: string): string {
  // Current API already stores Russian descriptions; preserve those and translate legacy codes.
  return labels[action] || (/^[А-Яа-яЁё]/.test(action) ? action : 'Другое действие');
}
