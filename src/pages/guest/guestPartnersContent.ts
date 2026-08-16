export type GuestPartner = {
  id: string;
  name: string;
  logo: string;
};

/** Официальные логотипы партнёров для гостевой главной. */
export const GUEST_PARTNERS: GuestPartner[] = [
  { id: "sber", name: "Сбер Логистика", logo: "/guest/partners/sber-logistics.svg" },
  { id: "wb", name: "Wildberries", logo: "/guest/partners/wildberries.png" },
  { id: "major", name: "Major", logo: "/guest/partners/major.svg" },
  { id: "ozon", name: "OZON", logo: "/guest/partners/ozon.png" },
  { id: "fivepost", name: "5post", logo: "/guest/partners/fivepost.png" },
  { id: "simple", name: "simple", logo: "/guest/partners/simple.png" },
  { id: "emex", name: "EMEX", logo: "/guest/partners/emex.png" },
  { id: "autodoc", name: "autodoc.ru", logo: "/guest/partners/autodoc.png" },
  { id: "autopiter", name: "autopiter.ru", logo: "/guest/partners/autopiter.png" },
  { id: "froza", name: "FROZA", logo: "/guest/partners/froza.png" },
];
