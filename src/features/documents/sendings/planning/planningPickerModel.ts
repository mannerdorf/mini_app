import type { TmsCargo } from '../../../tms/model';

export type PlanningPickerView = 'customer' | 'cargo' | 'receiver' | 'date';
export type PlanningPickerGroup = {
  key: string;
  label: string;
  cargo: TmsCargo[];
  weight: number;
  volume: number;
  children?: PlanningPickerGroup[];
};
export const PICKER_VIEWS: { value: PlanningPickerView; label: string }[] = [
  { value: 'cargo', label: 'По перевозкам' },
  { value: 'customer', label: 'По заказчику' },
  { value: 'receiver', label: 'По получателю' },
  { value: 'date', label: 'По датам' },
];

export function receiptDateLabel(value: string): string {
  return value ? value.split('-').reverse().join('.') : 'Без даты поступления';
}

export function groupPickerCargo(candidates: TmsCargo[], view: Exclude<PlanningPickerView, 'cargo'>) {
  const groups = new Map<string, PlanningPickerGroup>();
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

export function groupPickerHierarchy(candidates: TmsCargo[], view: Exclude<PlanningPickerView, 'cargo'>): PlanningPickerGroup[] {
  const childView = view === 'date' ? 'customer' : 'date';
  return groupPickerCargo(candidates, view).map(group => ({
    ...group,
    children: groupPickerCargo(group.cargo, childView),
  }));
}
