import type { TmsCargo, Vehicle } from '../../../tms/model';

export type RecommendationMode = 'fifo' | 'paid' | 'delivery';
export type RecommendationRequest = {
  mode: RecommendationMode;
  candidates: TmsCargo[];
  selected: TmsCargo[];
  locked: string[];
  vehicle?: Pick<Vehicle, 'payload' | 'volume'>;
};
export type RecommendationResult = {
  numbers: string[];
  weight: number;
  volume: number;
  paidWeight: number;
  excluded: number;
  missingPaid: number;
  missingDelivery?: number;
  missingMetrics?: number;
  optimal: boolean;
  message?: string;
};
const EPS = 1e-8;
const known = (value: number | null | undefined): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const fifoOrder = (a: TmsCargo, b: TmsCargo) => (a.received || '9999').localeCompare(b.received || '9999') || a.number.localeCompare(b.number, 'ru', { numeric: true });
const validDateKey = (value: string | undefined): boolean => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1990-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
};
const validSlaDeadline = (value: string | undefined) => !!value && validDateKey(value.slice(0,10)) && Number.isFinite(Date.parse(value));
const deliveryOrder = (a: TmsCargo, b: TmsCargo) => Date.parse(a.slaDeadline!) - Date.parse(b.slaDeadline!) || fifoOrder(a,b);
type Item = { cargo: TmsCargo; w: number; v: number; p: number };
type SelectedNode = { item: Item; previous: SelectedNode | null };
type State = { index: number; w: number; v: number; p: number; pick: SelectedNode | null };

// Two capacity constraints, one objective: the sum of the cargo's actual PW.
// Fractional relaxations provide valid upper bounds. A bounded search returns a
// feasible best-known set when it cannot prove the optimum within its work budget.
function maximizePaid(items: Item[], weight: number, volume: number, maxNodes: number) {
  const ordered = [...items].sort((a, b) => b.p / Math.max(EPS, b.w / Math.max(weight, EPS) + b.v / Math.max(volume, EPS))
    - a.p / Math.max(EPS, a.w / Math.max(weight, EPS) + a.v / Math.max(volume, EPS)) || fifoOrder(a.cargo, b.cargo));
  let best: State = { index: 0, w: 0, v: 0, p: 0, pick: null };
  const orders = [ordered, [...items].sort((a, b) => b.p - a.p || fifoOrder(a.cargo, b.cargo)),
    [...items].sort((a, b) => b.p / Math.max(b.w, EPS) - a.p / Math.max(a.w, EPS) || fifoOrder(a.cargo, b.cargo)),
    [...items].sort((a, b) => b.p / Math.max(b.v, EPS) - a.p / Math.max(a.v, EPS) || fifoOrder(a.cargo, b.cargo))];
  for (const order of orders) {
    let candidate: State = { index: 0, w: 0, v: 0, p: 0, pick: null };
    for (const item of order) if (candidate.w + item.w <= weight + EPS && candidate.v + item.v <= volume + EPS) {
      candidate = { ...candidate, w: candidate.w + item.w, v: candidate.v + item.v, p: candidate.p + item.p, pick: { item, previous: candidate.pick } };
    }
    if (candidate.p > best.p + EPS) best = candidate;
  }
  const suffix = new Array<number>(ordered.length + 1).fill(0);
  for (let i = ordered.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + ordered[i].p;
  const byResource = (dimension: 'w' | 'v') => ordered.map((item, index) => ({ item, index }))
    .sort((a, b) => a.item[dimension] === 0 ? b.item[dimension] === 0 ? b.item.p - a.item.p : -1
      : b.item[dimension] === 0 ? 1 : b.item.p / b.item[dimension] - a.item.p / a.item[dimension]);
  const weightOrder = byResource('w'), volumeOrder = byResource('v');
  const fractional = (order: typeof weightOrder, start: number, remaining: number, dimension: 'w' | 'v') => {
    let bound = 0;
    for (const { item, index } of order) {
      if (index < start) continue;
      if (item[dimension] === 0) { bound += item.p; continue; }
      if (remaining <= 0) break;
      const share = Math.min(1, remaining / item[dimension]);
      bound += item.p * share; remaining -= item[dimension] * share;
    }
    return bound;
  };
  const stack: State[] = [{ index: 0, w: 0, v: 0, p: 0, pick: null }];
  let visited = 0;
  while (stack.length && visited < maxNodes) {
    const state = stack.pop()!; visited++;
    if (state.p > best.p + EPS) best = state;
    if (state.index === ordered.length || state.p + suffix[state.index] <= best.p + EPS) continue;
    const bound = state.p + Math.min(fractional(weightOrder, state.index, weight - state.w, 'w'), fractional(volumeOrder, state.index, volume - state.v, 'v'));
    if (bound <= best.p + EPS) continue;
    const item = ordered[state.index], index = state.index + 1;
    stack.push({ ...state, index });
    if (state.w + item.w <= weight + EPS && state.v + item.v <= volume + EPS)
      stack.push({ index, w: state.w + item.w, v: state.v + item.v, p: state.p + item.p, pick: { item, previous: state.pick } });
  }
  const cargo: TmsCargo[] = [];
  for (let pick = best.pick; pick; pick = pick.previous) cargo.push(pick.item.cargo);
  return { cargo: cargo.sort(fifoOrder), optimal: !stack.length };
}

export function recommendPlanningCargo(request: RecommendationRequest, maxNodes = 120000): RecommendationResult {
  const empty: RecommendationResult = { numbers: [], weight: 0, volume: 0, paidWeight: 0, excluded: 0, missingPaid: 0, optimal: true };
  const { vehicle, mode } = request;
  if (!vehicle || !known(vehicle.payload) || !known(vehicle.volume) || vehicle.payload <= 0 || vehicle.volume <= 0)
    return { ...empty, message: 'Для подбора выберите тип ТС или контейнера' };
  const selected = [...new Map(request.selected.map(cargo => [cargo.number, cargo])).values()];
  if (selected.some(cargo => !known(cargo.weight) || !known(cargo.volume)))
    return { ...empty, message: 'У выбранных перевозок не заполнены вес или объём' };
  const usedWeight = selected.reduce((sum, cargo) => sum + cargo.weight!, 0), usedVolume = selected.reduce((sum, cargo) => sum + cargo.volume!, 0);
  if (usedWeight > vehicle.payload + EPS || usedVolume > vehicle.volume + EPS)
    return { ...empty, message: 'ТС переполнено — освободите место для подбора' };
  const excludedNumbers = new Set([...selected.map(cargo => cargo.number), ...request.locked]);
  const available = [...new Map(request.candidates.map(cargo => [cargo.number, cargo])).values()].filter(cargo => !excludedNumbers.has(cargo.number));
  const missingDelivery=mode==='delivery'?available.filter(cargo=>!validSlaDeadline(cargo.slaDeadline)).length:0;
  const missingMetrics=available.filter(cargo=>!known(cargo.weight)||!known(cargo.volume)).length;
  let excluded = 0;
  const eligible = available.filter(cargo => {
    const valid = known(cargo.weight) && known(cargo.volume) && (mode === 'paid' ? known(cargo.paidWeight) : mode === 'delivery' ? validSlaDeadline(cargo.slaDeadline) : validDateKey(cargo.received));
    if (!valid) excluded++;
    return valid;
  }).sort(mode === 'delivery' ? deliveryOrder : fifoOrder);
  if(mode==='delivery'&&available.length>0&&missingDelivery===available.length)return {...empty,excluded,missingDelivery,missingMetrics,message:'Не удалось рассчитать срок по SLA: у доступных перевозок нет корректной даты поступления на склад отправления.'};
  const weight = Math.max(0, vehicle.payload - usedWeight), volume = Math.max(0, vehicle.volume - usedVolume);
  let recommended: TmsCargo[] = [], optimal = true;
  if (mode === 'fifo' || mode === 'delivery') {
    let w = 0, v = 0;
    for (const cargo of eligible) if (w + cargo.weight! <= weight + EPS && v + cargo.volume! <= volume + EPS) {
      recommended.push(cargo); w += cargo.weight!; v += cargo.volume!;
    }
  } else {
    const items = eligible.filter(cargo => cargo.paidWeight! > 0 && cargo.weight! <= weight + EPS && cargo.volume! <= volume + EPS)
      .map(cargo => ({ cargo, w: cargo.weight!, v: cargo.volume!, p: cargo.paidWeight! }));
    const result = maximizePaid(items, weight, volume, maxNodes);
    recommended = result.cargo; optimal = result.optimal;
  }
  return { numbers: recommended.map(cargo => cargo.number), weight: recommended.reduce((sum, cargo) => sum + cargo.weight!, 0),
    volume: recommended.reduce((sum, cargo) => sum + cargo.volume!, 0), paidWeight: recommended.reduce((sum, cargo) => sum + (cargo.paidWeight || 0), 0),
    excluded, missingDelivery, missingMetrics, missingPaid: recommended.filter(cargo => !known(cargo.paidWeight)).length, optimal };
}
