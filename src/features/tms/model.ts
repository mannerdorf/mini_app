export type Readiness =
  "pending" | "ready" | "unreceived" | "dispatched" | "unknown";
export type TmsCargo = {
  id: string;
  number: string;
  customer: string;
  customerId: string;
  receiver: string;
  sender?: string;
  received: string;
  route: string;
  weight: number | null;
  volume: number | null;
  places: number | null;
  readiness: Readiness;
  reason: string;
  updatedAt: string | null;
};
export type Compartment = { length: number; width: number; height: number };
export type Vehicle = {
  id: string;
  mode: "road" | "ferry";
  name: string;
  payload: number;
  volume: number;
  compartments: Compartment[];
};
// Planning presets only. The operator can replace every limit with the actual vehicle's specification.
const preset = (
  id: string,
  mode: Vehicle["mode"],
  name: string,
  payload: number,
  l: number,
  w: number,
  h: number,
  n = 1,
): Vehicle => ({
  id,
  mode,
  name,
  payload,
  volume: Math.floor(l * w * h * n * 10) / 10,
  compartments: Array.from({ length: n }, () => ({
    length: l,
    width: w,
    height: h,
  })),
});
export const VEHICLES: Vehicle[] = [
  preset("tent", "road", "Тент / штора · 13,6 м", 20000, 13.6, 2.45, 2.7),
  preset("reefer", "road", "Рефрижератор · 13,3 м", 20000, 13.3, 2.45, 2.5),
  preset("isotherm", "road", "Изотерм · 13,3 м", 20000, 13.3, 2.45, 2.5),
  preset("mega", "road", "Мега · 13,6 м", 20000, 13.6, 2.45, 3),
  preset(
    "train",
    "road",
    "Сцепка · 2 кузова по 7,7 м",
    20000,
    7.7,
    2.45,
    2.9,
    2,
  ),
  preset("rigid", "road", "Фургон · 10 т", 10000, 8, 2.45, 2.5),
  preset("20dc", "ferry", "20′ Dry", 28000, 5.89, 2.35, 2.39),
  preset("40dc", "ferry", "40′ Dry", 26000, 12.03, 2.35, 2.39),
  preset("40hc", "ferry", "40′ High Cube", 26000, 12.03, 2.35, 2.69),
  preset("45hc", "ferry", "45′ High Cube", 27000, 13.55, 2.35, 2.69),
  preset("20rf", "ferry", "20′ Reefer", 27000, 5.44, 2.29, 2.27),
  preset("40rh", "ferry", "40′ Reefer High Cube", 27000, 11.58, 2.29, 2.54),
  preset("20ot", "ferry", "20′ Open Top", 28000, 5.89, 2.35, 2.35),
  preset("40ot", "ferry", "40′ Open Top", 26000, 12.03, 2.35, 2.35),
  preset("20fr", "ferry", "20′ Flat Rack", 28000, 5.6, 2.2, 2.2),
  preset("40fr", "ferry", "40′ Flat Rack", 26000, 11.65, 2.2, 2.2),
];
export type PackageGroup = {
  count: number;
  length: number;
  width: number;
  height: number;
  weight: number;
  pallet: boolean;
  palletStacking?: boolean;
  floorOnly: boolean;
  stackable: boolean;
  maxTopLoad: number;
  rotate: boolean;
};
export type PlanOptions = {
  engine?: PackingEngine;
  packages?: Record<string, PackageGroup[]>;
  requireDimensions?: boolean;
  // Preliminary assumption only; 0 disables estimated supports. Measured rules take precedence.
  estimatedTopLoadFactor?: number;
  estimatedStacking?: "height" | "load";
  vehicle: Vehicle;
  order: "fifo" | "lifo";
  strictSelection: boolean;
  priority: string[];
  floorCustomers: string[];
  pallets: Record<string, number>;
  palletLength: number;
  palletWidth: number;
  reservePercent: number;
};
export type Placement = {
  cargoId: string;
  compartment: number;
  x: number;
  y: number;
  length: number;
  width: number;
  pallet: boolean;
  palletStacking?: boolean;
  z: number;
  height: number;
  weight: number;
  density: number;
  estimated: boolean;
  unit: string;
  support: string | null;
  supports?: { unit: string; share: number }[];
  topLoad: number;
  maxTopLoad: number;
};
export type LoadPlan = {
  engine?: PackingEngine;
  calculationMs?: number;
  estimatedPlaces?: number;
  variantsChecked?: number;
  selected: TmsCargo[];
  omitted: { cargo: TmsCargo; reason: string }[];
  placements: Placement[];
  weight: number;
  volume: number;
  pallets: number;
  floorArea: number;
  payloadLimit: number;
  volumeLimit: number;
};
export type PackingEngine = "current" | "laff" | "loadza";
export const PACKING_ENGINES = [
  {
    id: "laff",
    name: "LAFF",
    description:
      "Крупные основания первыми, заполнение пространства внутри ярусов.",
  },
  {
    id: "loadza",
    name: "LoadZa",
    description:
      "Размещение в свободных углах, контакт с соседями и поиск лучшей последовательности.",
  },
  {
    id: "current",
    name: "Текущий",
    description: "Предыдущий расчёт для сравнения.",
  },
] as const;
