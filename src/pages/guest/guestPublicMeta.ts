import { GUEST_HOME_META, type GuestMetaConfig } from "../../hooks/useGuestDocumentMeta";
export const GUEST_PUBLIC_META: Record<string, GuestMetaConfig> = {
  home: GUEST_HOME_META,
  calculator: {
          title: "Калькулятор перевозки Москва ↔ Калининград | HAULZ",
          description:
            "Онлайн-калькулятор B2B-перевозки между Москвой и Калининградом: вес, объём, паром, авто, авиа.",
          path: "/kalkulyator",
        },
  app: { title: "Приложение HAULZ", description: "Приложение HAULZ для управления перевозками.", path: "/app" },
  faq: {
          title: "FAQ — перевозки HAULZ Москва ↔ Калининград",
          description: "Ответы о расчёте, отслеживании и документах HAULZ на маршруте Москва — Калининград.",
          path: "/faq",
        },
  blog: {
          title: "Блог HAULZ — логистика Москва ↔ Калининград",
          description: "Статьи о перевозках, тарифах и B2B-логистике между Москвой и Калининградом.",
          path: "/blog",
        },
  warehouses: {
          title: "Склады HAULZ — Москва и Калининград",
          description: "Адреса и контакты складов HAULZ в Московской области и Калининграде.",
          path: "/sklady",
        },
  about: {
          title: "О компании HAULZ",
          description: "B2B-логистика между Москвой и Калининградом: перевозки, документы, калькулятор.",
          path: "/o-kompanii",
        },
};
