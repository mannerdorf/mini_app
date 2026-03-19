export type OperationType =
  | 'REVENUE'
  | 'COGS'
  | 'OPEX'
  | 'CAPEX'
  | 'BELOW_EBITDA_DIVIDENDS'
  | 'BELOW_EBITDA_TRANSIT';

export type Department =
  | 'LOGISTICS_MSK'
  | 'LOGISTICS_KGD'
  | 'ADMINISTRATION'
  | 'DIRECTION'
  | 'IT'
  | 'SALES'
  | 'SERVICE'
  | 'GENERAL';

export type LogisticsStage =
  | 'PICKUP'
  | 'DEPARTURE_WAREHOUSE'
  | 'MAINLINE'
  | 'ARRIVAL_WAREHOUSE'
  | 'LAST_MILE';

export type Direction = 'MSK_TO_KGD' | 'KGD_TO_MSK';

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  REVENUE: 'Выручка',
  COGS: 'COGS',
  OPEX: 'OPEX',
  CAPEX: 'CAPEX',
  BELOW_EBITDA_DIVIDENDS: 'Ниже EBITDA (дивиденды)',
  BELOW_EBITDA_TRANSIT: 'Транзит (кредиты/нал)',
};

export const DEPARTMENT_LABELS: Record<Department, string> = {
  LOGISTICS_MSK: 'Логистика Москва',
  LOGISTICS_KGD: 'Логистика КГД',
  ADMINISTRATION: 'Администрация',
  DIRECTION: 'Дирекция',
  IT: 'IT',
  SALES: 'Продажи',
  SERVICE: 'Сервис',
  GENERAL: 'Общее',
};

export const LOGISTICS_STAGE_LABELS: Record<LogisticsStage, string> = {
  PICKUP: 'Заборная логистика',
  DEPARTURE_WAREHOUSE: 'Склад отправления',
  MAINLINE: 'Магистраль',
  ARRIVAL_WAREHOUSE: 'Склад получения',
  LAST_MILE: 'Последняя миля',
};

export const DIRECTION_LABELS: Record<Direction, string> = {
  MSK_TO_KGD: 'МСК → КГД',
  KGD_TO_MSK: 'КГД → МСК',
};

export const LOGISTICS_STAGES: LogisticsStage[] = [
  'PICKUP', 'DEPARTURE_WAREHOUSE', 'MAINLINE', 'ARRIVAL_WAREHOUSE', 'LAST_MILE',
];

export const DEPARTMENTS: Department[] = [
  'LOGISTICS_MSK', 'LOGISTICS_KGD', 'ADMINISTRATION', 'DIRECTION', 'IT', 'SALES', 'SERVICE', 'GENERAL',
];

export const DIRECTIONS: Direction[] = ['MSK_TO_KGD', 'KGD_TO_MSK'];

export const SUBDIVISIONS = [
  { id: 'pickup_msk', label: 'Заборная логистика Москва', department: 'LOGISTICS_MSK' as Department, logisticsStage: 'PICKUP' as LogisticsStage },
  { id: 'warehouse_msk', label: 'Склад Москва', department: 'LOGISTICS_MSK' as Department, logisticsStage: 'DEPARTURE_WAREHOUSE' as LogisticsStage },
  { id: 'mainline', label: 'Магистраль', department: 'LOGISTICS_MSK' as Department, logisticsStage: 'MAINLINE' as LogisticsStage },
  { id: 'warehouse_kgd', label: 'Склад Калининград', department: 'LOGISTICS_KGD' as Department, logisticsStage: 'ARRIVAL_WAREHOUSE' as LogisticsStage },
  { id: 'lastmile_kgd', label: 'Последняя миля Калининград', department: 'LOGISTICS_KGD' as Department, logisticsStage: 'LAST_MILE' as LogisticsStage },
  { id: 'sales', label: 'Отдел продаж', department: 'SALES' as Department, logisticsStage: null },
  { id: 'administration', label: 'Администрация', department: 'ADMINISTRATION' as Department, logisticsStage: null },
  { id: 'direction', label: 'Дирекция', department: 'DIRECTION' as Department, logisticsStage: null },
] as const;

export const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];
