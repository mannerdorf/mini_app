export type GuestPartner = {
  id: string;
  name: string;
  logo: string;
};

/** Логотипы партнёров для гостевой главной. */
export const GUEST_PARTNERS: GuestPartner[] = [
  { id: "sber", name: "Сбер Логистика", logo: "/guest/partners/sber-logistics.svg" },
  { id: "wb", name: "Wildberries", logo: "/guest/partners/wildberries.svg" },
  { id: "major", name: "Major", logo: "/guest/partners/major.svg" },
  { id: "ozon", name: "OZON", logo: "/guest/partners/ozon.svg" },
  { id: "fivepost", name: "5post", logo: "/guest/partners/fivepost.svg" },
  { id: "simple", name: "simple", logo: "/guest/partners/simple.svg" },
  { id: "emex", name: "EMEX", logo: "/guest/partners/emex.svg" },
  { id: "autodoc", name: "autodoc.ru", logo: "/guest/partners/autodoc.svg" },
  { id: "autopiter", name: "autopiter.ru", logo: "/guest/partners/autopiter.svg" },
  { id: "froza", name: "FROZA", logo: "/guest/partners/froza.svg" },
];
