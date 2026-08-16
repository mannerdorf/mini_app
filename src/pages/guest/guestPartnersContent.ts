export type GuestPartner = {
  id: string;
  name: string;
  logo: string;
};

/** Логотипы партнёров по образцам заказчика (полоски с официальными марками). */
export const GUEST_PARTNERS: GuestPartner[] = [
  { id: "europlan", name: "Европлан", logo: "/guest/partners/europlan.svg" },
  { id: "kamaz", name: "KAMAZ", logo: "/guest/partners/kamaz.svg" },
  { id: "sovcombank", name: "Совкомбанк", logo: "/guest/partners/sovcombank.svg" },
  { id: "vtb", name: "ВТБ", logo: "/guest/partners/vtb.svg" },
  { id: "detsky-mir", name: "Детский мир", logo: "/guest/partners/detsky-mir.svg" },
  { id: "magnit", name: "Магнит", logo: "/guest/partners/magnit.svg" },
  { id: "gloria-jeans", name: "Gloria Jeans", logo: "/guest/partners/gloria-jeans.svg" },
  { id: "mvideo", name: "М.Видео", logo: "/guest/partners/mvideo.svg" },
  { id: "dns", name: "DNS", logo: "/guest/partners/dns.svg" },
  { id: "eldorado", name: "Эльдорадо", logo: "/guest/partners/eldorado.svg" },
  { id: "autopiter", name: "autopiter.ru", logo: "/guest/partners/autopiter.svg" },
];
