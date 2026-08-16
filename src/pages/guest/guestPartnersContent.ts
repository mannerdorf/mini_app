export type GuestPartner = {
  id: string;
  name: string;
  logo: string;
};

/** Логотипы партнёров по образцам заказчика (wordmark / фирменный знак). */
export const GUEST_PARTNERS: GuestPartner[] = [
  { id: "froza", name: "FROZA", logo: "/guest/partners/froza.svg" },
  { id: "autopiter", name: "autopiter.ru", logo: "/guest/partners/autopiter.svg" },
  { id: "autodoc", name: "autodoc.ru", logo: "/guest/partners/autodoc.svg" },
  { id: "emex", name: "EMEX", logo: "/guest/partners/emex.svg" },
  { id: "simple", name: "simple", logo: "/guest/partners/simple.svg" },
  { id: "fivepost", name: "5post", logo: "/guest/partners/fivepost.svg" },
  { id: "ozon", name: "OZON", logo: "/guest/partners/ozon.svg" },
  { id: "major", name: "Major", logo: "/guest/partners/major.svg" },
  { id: "wildberries", name: "Wildberries", logo: "/guest/partners/wildberries.svg" },
  { id: "sber-logistics", name: "Сбер Логистика", logo: "/guest/partners/sber-logistics.svg" },
];
