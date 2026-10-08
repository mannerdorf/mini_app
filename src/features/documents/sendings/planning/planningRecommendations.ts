import type { TmsCargo, Vehicle } from '../../../tms/model';

export const RECOMMENDATION_MODES = ['fifo', 'paid', 'delivery', 'sla-paid'] as const;
export type RecommendationMode = typeof RECOMMENDATION_MODES[number];
export type RecommendationRequest = {
  mode: RecommendationMode;
  candidates: TmsCargo[];
  selected: TmsCargo[];
  locked: string[];
  vehicle?: Pick<Vehicle, 'payload' | 'volume'>;
  slaCutoff?: string;
};
export type RecommendationContext = Omit<RecommendationRequest, 'mode'>;
export type RecommendationReason = { kind: 'recommended' | 'skipped' | 'selected' | 'locked'; text: string };
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
  reasons: Record<string, RecommendationReason>;
};
export type RecommendationComparison = Record<RecommendationMode, RecommendationResult>;
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
  const reasons: RecommendationResult['reasons'] = {};
  const selectedNumbers = new Set(request.selected.map(cargo => cargo.number)), lockedNumbers = new Set(request.locked);
  const explain = (cargo: TmsCargo, kind: RecommendationReason['kind'], text: string) => { reasons[cargo.number] = { kind, text }; };
  for (const cargo of request.candidates) {
    if (lockedNumbers.has(cargo.number)) explain(cargo, 'locked', 'Уже включена в фактическую отправку; снять выбор нельзя.');
    else if (selectedNumbers.has(cargo.number)) explain(cargo, 'selected', 'Уже выбрана в этот план; её вес и объём учтены в заполнении ТС.');
  }
  const empty: RecommendationResult = { numbers: [], weight: 0, volume: 0, paidWeight: 0, excluded: 0, missingPaid: 0, optimal: true, reasons };
  const blocked = (message: string) => {
    for (const cargo of request.candidates) if (!reasons[cargo.number]) explain(cargo, 'skipped', message);
    return { ...empty, message };
  };
  const { vehicle, mode } = request;
  if (!vehicle || !known(vehicle.payload) || !known(vehicle.volume) || vehicle.payload <= 0 || vehicle.volume <= 0)
    return blocked('Для подбора выберите тип ТС или контейнера');
  const selected = [...new Map(request.selected.map(cargo => [cargo.number, cargo])).values()];
  if (selected.some(cargo => !known(cargo.weight) || !known(cargo.volume)))
    return blocked('У выбранных перевозок не заполнены вес или объём');
  const usedWeight = selected.reduce((sum, cargo) => sum + cargo.weight!, 0), usedVolume = selected.reduce((sum, cargo) => sum + cargo.volume!, 0);
  if (usedWeight > vehicle.payload + EPS || usedVolume > vehicle.volume + EPS)
    return blocked('ТС переполнено — освободите место для подбора');
  if (mode === 'sla-paid' && !validDateKey(request.slaCutoff)) return blocked('Укажите дату «SLA до» для приоритетных перевозок');
  const slaMode = mode === 'delivery' || mode === 'sla-paid';
  const urgent = (cargo: TmsCargo) => mode === 'sla-paid' && cargo.slaDeadline!.slice(0,10) <= request.slaCutoff!;
  const excludedNumbers = new Set([...selected.map(cargo => cargo.number), ...request.locked]);
  const available = [...new Map(request.candidates.map(cargo => [cargo.number, cargo])).values()].filter(cargo => !excludedNumbers.has(cargo.number));
  const missingDelivery=slaMode?available.filter(cargo=>!validSlaDeadline(cargo.slaDeadline)).length:0;
  const missingMetrics=available.filter(cargo=>!known(cargo.weight)||!known(cargo.volume)).length;
  let excluded = 0;
  const eligible = available.filter(cargo => {
    const missing: string[] = [];
    if (!known(cargo.weight)) missing.push('вес');
    if (!known(cargo.volume)) missing.push('объём');
    if (slaMode && !validSlaDeadline(cargo.slaDeadline)) missing.push('срок по SLA');
    if (mode === 'fifo' && !validDateKey(cargo.received)) missing.push('дата поступления на склад');
    if ((mode === 'paid' || mode === 'sla-paid' && validSlaDeadline(cargo.slaDeadline) && !urgent(cargo)) && !known(cargo.paidWeight)) missing.push('платный вес');
    if (missing.length) { excluded++; explain(cargo, 'skipped', `Не хватает данных: ${missing.join(', ')}.`); }
    return !missing.length;
  }).sort(slaMode ? deliveryOrder : fifoOrder);
  if(slaMode&&available.length>0&&missingDelivery===available.length)return {...empty,excluded,missingDelivery,missingMetrics,message:'Не удалось рассчитать срок по SLA: у доступных перевозок нет корректной даты поступления на склад отправления.'};
  const weight = Math.max(0, vehicle.payload - usedWeight), volume = Math.max(0, vehicle.volume - usedVolume);
  let recommended: TmsCargo[] = [], optimal = true;
  const priorityNumbers = new Set<string>();
  if (mode === 'fifo' || mode === 'delivery' || mode === 'sla-paid') {
    let w = 0, v = 0;
    for (const cargo of eligible) if ((mode !== 'sla-paid' || urgent(cargo)) && w + cargo.weight! <= weight + EPS && v + cargo.volume! <= volume + EPS) {
      recommended.push(cargo); w += cargo.weight!; v += cargo.volume!; priorityNumbers.add(cargo.number);
    }
  }
  if (mode === 'paid' || mode === 'sla-paid') {
    const usedW = recommended.reduce((sum, cargo) => sum + cargo.weight!, 0), usedV = recommended.reduce((sum, cargo) => sum + cargo.volume!, 0);
    const items = eligible.filter(cargo => !priorityNumbers.has(cargo.number) && known(cargo.paidWeight) && cargo.paidWeight > 0 && cargo.weight! <= weight - usedW + EPS && cargo.volume! <= volume - usedV + EPS)
      .map(cargo => ({ cargo, w: cargo.weight!, v: cargo.volume!, p: cargo.paidWeight! }));
    const result = maximizePaid(items, weight - usedW, volume - usedV, maxNodes);
    recommended.push(...result.cargo); optimal = result.optimal;
  }
  const recommendedNumbers = new Set(recommended.map(cargo => cargo.number));
  const totalW = recommended.reduce((sum, cargo) => sum + cargo.weight!, 0), totalV = recommended.reduce((sum, cargo) => sum + cargo.volume!, 0);
  const format = (value: number) => value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  const dateLabel = (value: string) => value.slice(0,10).split('-').reverse().join('.');
  for (const cargo of eligible) {
    if (recommendedNumbers.has(cargo.number)) {
      const detail = mode === 'fifo' ? `Раннее поступление: ${dateLabel(cargo.received!)}; добавлена по очереди FIFO.`
        : mode === 'delivery' ? `Ближайший срок по SLA: ${dateLabel(cargo.slaDeadline!)}; добавлена по очереди сроков.`
        : mode === 'sla-paid' && priorityNumbers.has(cargo.number) ? `Приоритет по SLA: срок ${dateLabel(cargo.slaDeadline!)} до выбранной границы ${dateLabel(request.slaCutoff!)} включительно.`
        : `${mode === 'sla-paid' ? 'Дозагрузка после приоритетных перевозок SLA' : 'Подбор по платному весу'}: входит в ${optimal ? 'набор с максимальным платным весом' : 'лучший найденный набор'}.`;
      explain(cargo, 'recommended', `${detail} Занимает ${format(cargo.weight!)} кг и ${format(cargo.volume!)} м³.${known(cargo.paidWeight) ? ` Платный вес: +${format(cargo.paidWeight)} кг.` : ' Платный вес не заполнен.'}`);
    } else {
      const lackW = Math.max(0, cargo.weight! - (weight - totalW)), lackV = Math.max(0, cargo.volume! - (volume - totalV));
      const lacks: string[] = [];
      if (lackW > EPS) lacks.push(`${format(lackW)} кг грузоподъёмности`);
      if (lackV > EPS) lacks.push(`${format(lackV)} м³ объёма`);
      const prefix = mode === 'sla-paid' && urgent(cargo) ? `Приоритет по SLA: срок ${dateLabel(cargo.slaDeadline!)}. ` : '';
      explain(cargo, 'skipped', lacks.length ? `${prefix}Не помещается вместе с рекомендованными перевозками: не хватает ${lacks.join(' и ')}.`
        : `${prefix}${cargo.paidWeight === 0 ? 'Платный вес равен нулю; эта перевозка не увеличивает платный вес набора.' : 'Не вошла в лучший найденный набор по платному весу.'}`);
    }
  }
  return { numbers: [...recommendedNumbers], weight: totalW, volume: totalV, paidWeight: recommended.reduce((sum, cargo) => sum + (known(cargo.paidWeight) ? cargo.paidWeight : 0), 0),
    excluded, missingDelivery, missingMetrics, missingPaid: recommended.filter(cargo => !known(cargo.paidWeight)).length, optimal, reasons };
}

export function comparePlanningRecommendations(context: RecommendationContext, maxNodes = 120000): RecommendationComparison {
  return Object.fromEntries(RECOMMENDATION_MODES.map(mode => [mode, recommendPlanningCargo({ ...context, mode }, maxNodes)])) as RecommendationComparison;
}

// Unknown PW cannot be ranked as zero. Equal variants receive the same stripe;
// when every comparable variant is equal, there is no best/worst distinction.
export function recommendationPaidRanks(results: RecommendationComparison): Partial<Record<RecommendationMode, 'max' | 'min'>> {
  const comparable = RECOMMENDATION_MODES.filter(mode => !results[mode].message && !results[mode].missingPaid);
  const values = comparable.map(mode => results[mode].paidWeight);
  if (values.length < 2) return {};
  const max = Math.max(...values), min = Math.min(...values);
  if (max - min <= EPS) return {};
  const ranks: Partial<Record<RecommendationMode, 'max' | 'min'>> = {};
  for (const mode of comparable) {
    if (Math.abs(results[mode].paidWeight - max) <= EPS) ranks[mode] = 'max';
    else if (Math.abs(results[mode].paidWeight - min) <= EPS) ranks[mode] = 'min';
  }
  return ranks;
}
