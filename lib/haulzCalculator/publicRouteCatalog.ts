import type { Direction, MainlineMode } from "./types.js";
import { MAINLINE_MODE_ORDER, mainlineModeLabelRu } from "./mainlineMode.js";
import { HAULZ_WAREHOUSES } from "./warehouses.js";

export type PublicRouteId = "mow_kgd" | "kgd_mow";

export type PublicRouteStage = {
  id: string;
  title: string;
  detail: string;
};

export type PublicRouteInfo = {
  id: PublicRouteId;
  direction: Direction;
  from: string;
  to: string;
  fromCode: string;
  toCode: string;
  slug: string;
  path: string;
  corridorLabel: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  summary: string;
  focus: string;
  modes: string[];
  cargo: string[];
  stages: PublicRouteStage[];
  features: string[];
  faq: Array<{ q: string; a: string }>;
};

const CANONICAL_ORIGIN = "https://haulz.space";

export const PUBLIC_ROUTE_CATALOG: PublicRouteInfo[] = [
  {
    id: "mow_kgd",
    direction: "mow_kgd",
    from: "Москва",
    to: "Калининград",
    fromCode: "MOW",
    toCode: "KGD",
    slug: "perevozka-moskva-kaliningrad",
    path: "/perevozka-moskva-kaliningrad",
    corridorLabel: "Восток → Запад",
    seoTitle: "Перевозка грузов Москва — Калининград | HAULZ",
    seoDescription:
      "B2B-перевозка грузов из Москвы в Калининград: LTL, FTL, паром и авто. Онлайн-калькулятор, таможня ЕАЭС/ЕС, склады HAULZ.",
    h1: "Перевозка грузов Москва — Калининград",
    summary:
      "Перевозка генеральных, режимных, акцизных, опасных и санкционных грузов. LTL, LCL (сборные) и FTL, FCL (полная загрузка).",
    focus: "Полный цикл доставки в Калининград с таможенным сопровождением ЕАЭС и ЕС.",
    modes: ["LTL", "LCL", "FTL", "FCL"],
    cargo: ["Генеральные", "Режимные", "Акцизные", "Опасные", "Санкционные"],
    stages: [
      { id: "pickup", title: "Первая миля", detail: "Забор у отправителя, консолидация и подготовка к магистрали" },
      { id: "warehouse", title: "Склад", detail: "Обработка, упаковка и маркировка на складе HAULZ" },
      { id: "linehaul", title: "Магистраль", detail: "Автомобильный или морской коридор до Калининграда" },
      { id: "customs", title: "Таможня", detail: "Оформление по требованиям ЕАЭС и ЕС" },
      { id: "lastmile", title: "Последняя миля", detail: "Доставка до конечного пункта назначения" },
    ],
    features: [
      "Заборная логистика (первая миля)",
      "Складская обработка, упаковка и маркировка груза",
      "Магистральная транспортировка автомобильными или морскими маршрутами",
      "Таможенное оформление в соответствии с требованиями ЕАЭС и ЕС",
      "Идентификация и маркировка грузов для точности и безопасности",
      "Доставка до конечного пункта назначения (последняя миля)",
    ],
    faq: [
      {
        q: "Сколько стоит перевозка из Москвы в Калининград?",
        a: "Стоимость зависит от веса, объёма и режима магистрали (паром, авто, авиа). Ориентир можно получить в калькуляторе HAULZ или через Public API estimate.",
      },
      {
        q: "Какие типы грузов вы перевозите по маршруту Москва — Калининград?",
        a: "Генеральные, режимные, акцизные, опасные и санкционные грузы — LTL/LCL и FTL/FCL.",
      },
      {
        q: "Как быстро доставляете груз в Калининград?",
        a: "Срок зависит от режима магистрали. Точный расчёт срока и цены — в калькуляторе на haulz.space.",
      },
    ],
  },
  {
    id: "kgd_mow",
    direction: "kgd_mow",
    from: "Калининград",
    to: "Москва",
    fromCode: "KGD",
    toCode: "MOW",
    slug: "perevozka-kaliningrad-moskva",
    path: "/perevozka-kaliningrad-moskva",
    corridorLabel: "Запад → Восток",
    seoTitle: "Перевозка грузов Калининград — Москва | HAULZ",
    seoDescription:
      "B2B-перевозка из Калининграда в Москву: возврат из ОЭЗ, импорт из ЕС, LTL и FTL. Калькулятор, документы и таможня ЕАЭС.",
    h1: "Перевозка грузов Калининград — Москва",
    summary:
      "Возврат товаров из ОЭЗ Калининградской области и импорт из ЕС. LTL, LCL (сборные) и FTL, FCL (полная загрузка).",
    focus: "Возврат из ОЭЗ и импорт из ЕС с контролем документов на каждом этапе.",
    modes: ["LTL", "LCL", "FTL", "FCL"],
    cargo: ["Возврат ОЭЗ", "Производство КО", "Импорт ЕС", "ЕАЭС"],
    stages: [
      { id: "origin", title: "Отправление", detail: "Забор в Калининграде: склад, производство или точка импорта" },
      { id: "docs", title: "Документы", detail: "Подготовка комплекта для импорта и экспорта" },
      { id: "corridor", title: "Коридор", detail: "Сборные и полные загрузки по маршруту в Москву" },
      { id: "customs", title: "Таможня", detail: "Сопровождение процедур по законодательству ЕАЭС" },
      { id: "delivery", title: "Доставка", detail: "Выдача на складе или до конечного адреса в Москве" },
    ],
    features: [
      "LTL, LCL (сборные грузы) и FTL, FCL (полная загрузка)",
      "Грузы, ввезённые в ОЭЗ Калининградской области из стран ЕАЭС и ЕС",
      "Товары, произведённые на территории Калининградской области",
      "Оформление документов для импорта и экспорта",
      "Полный контроль на каждом этапе: забор, склад, доставка до конечного пункта",
      "Соблюдение таможенного законодательства ЕАЭС и сопровождение процедур",
    ],
    faq: [
      {
        q: "Сколько стоит перевозка из Калининграда в Москву?",
        a: "Зависит от веса, объёма и режима доставки. Ориентировочный расчёт — в калькуляторе HAULZ или Public API.",
      },
      {
        q: "Перевозите ли грузы из ОЭЗ и импорт из ЕС?",
        a: "Да, это ключевой профиль направления Калининград → Москва: возврат из ОЭЗ и импорт из ЕС с документальным сопровождением.",
      },
      {
        q: "Где склад HAULZ в Калининграде?",
        a: `${HAULZ_WAREHOUSES.kaliningrad.fullAddress}. Часы работы: ${HAULZ_WAREHOUSES.kaliningrad.hours}.`,
      },
    ],
  },
];

export function getPublicRouteByDirection(direction: Direction): PublicRouteInfo | undefined {
  return PUBLIC_ROUTE_CATALOG.find((r) => r.direction === direction);
}

export function getPublicRouteBySlug(slug: string): PublicRouteInfo | undefined {
  return PUBLIC_ROUTE_CATALOG.find((r) => r.slug === slug || r.path === slug || r.path === `/${slug}`);
}

export function getPublicRouteByPath(pathname: string): PublicRouteInfo | undefined {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  return PUBLIC_ROUTE_CATALOG.find((r) => r.path === normalized);
}

export function publicRouteCalculatorUrl(direction: Direction): string {
  return `/kalkulyator?direction=${direction}`;
}

export function publicCanonicalUrl(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${CANONICAL_ORIGIN}${p}`;
}

export function listPublicMainlineModes(): MainlineMode[] {
  return [...MAINLINE_MODE_ORDER];
}

export function publicMainlineModeLabels(): Record<MainlineMode, string> {
  return {
    auto: mainlineModeLabelRu("auto"),
    ferry: mainlineModeLabelRu("ferry"),
    air: mainlineModeLabelRu("air"),
  };
}

export function publicWarehousesPayload() {
  return (Object.keys(HAULZ_WAREHOUSES) as Array<keyof typeof HAULZ_WAREHOUSES>).map((city) => {
    const w = HAULZ_WAREHOUSES[city];
    return {
      city,
      code: w.code,
      label: w.label,
      fullAddress: w.fullAddress,
      hours: w.hours,
      phone: w.phone,
      email: w.email,
      point: w.point,
    };
  });
}
