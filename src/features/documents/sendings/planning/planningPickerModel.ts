import type { TmsCargo } from '../../../tms/model';

export type PlanningPickerView = 'customer' | 'cargo' | 'receiver' | 'date';
export const PICKER_VIEWS: { value: PlanningPickerView; label: string }[] = [
  { value: 'customer', label: 'По заказчику' },
  { value: 'cargo', label: 'По перевозкам' },
  { value: 'receiver', label: 'По получателю' },
  { value: 'date', label: 'По датам' },
];

export function receiptDateLabel(value: string): string {
  return value ? value.split('-').reverse().join('.') : 'Без даты поступления';
}

export function matchesPickerSearch(cargo: TmsCargo, search: string): boolean {
  return [cargo.number, cargo.customer, cargo.receiver, cargo.received, receiptDateLabel(cargo.received)]
    .join(' ').toLocaleLowerCase('ru').includes(search.trim().toLocaleLowerCase('ru'));
}

export function groupPickerCargo(candidates: TmsCargo[], view: Exclude<PlanningPickerView, 'cargo'>) {
  const groups = new Map<string, { key: string; label: string; cargo: TmsCargo[]; weight: number; volume: number }>();
  for (const cargo of candidates) {
    const key = view === 'customer' ? cargo.customerId || cargo.customer : view === 'receiver' ? cargo.receiver : cargo.received;
    const label = view === 'customer' ? cargo.customer : view === 'receiver' ? cargo.receiver : receiptDateLabel(cargo.received);
    let group = groups.get(key);
    if (!group) {
      group = { key, label, cargo: [], weight: 0, volume: 0 };
      groups.set(key, group);
    }
    group.cargo.push(cargo);
    group.weight += cargo.weight || 0;
    group.volume += cargo.volume || 0;
  }
  return [...groups.values()].sort((a, b) => view === 'date'
    ? (a.key || '9999').localeCompare(b.key || '9999')
    : a.label.localeCompare(b.label, 'ru') || a.key.localeCompare(b.key, 'ru'));
}
