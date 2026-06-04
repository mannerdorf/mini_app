import type { ExtraServicePayload } from "./types.js";

/** Стартовый набор доп. услуг (CDEK-подобный), редактируется в админке. */
export const DEFAULT_CDEK_EXTRAS: ExtraServicePayload[] = [
  {
    code: "declared_value",
    label: "Объявленная ценность",
    description: "Страхование по объявленной стоимости груза",
    applies_to: "shipment",
    pricing_type: "percent_of_declared_value",
    percent: 0.5,
    min_amount_rub: 50,
    default_on: false,
  },
  {
    code: "safe_deal",
    label: "Безопасная сделка",
    applies_to: "shipment",
    pricing_type: "fixed",
    amount_rub: 150,
    default_on: false,
  },
  {
    code: "inventory",
    label: "Опись вложения",
    applies_to: "documents",
    pricing_type: "fixed",
    amount_rub: 100,
    default_on: false,
  },
  {
    code: "sms_notify",
    label: "SMS-уведомления",
    applies_to: "recipient",
    pricing_type: "fixed",
    amount_rub: 30,
    default_on: false,
  },
  {
    code: "recipient_pays",
    label: "Доставка за счёт получателя",
    applies_to: "recipient",
    pricing_type: "fixed",
    amount_rub: 0,
    default_on: false,
  },
  {
    code: "packaging",
    label: "Упаковка",
    applies_to: "shipment",
    pricing_type: "fixed",
    amount_rub: 250,
    default_on: false,
  },
  {
    code: "loading_overtime",
    label: "Сверхнормативная погрузка",
    description: "По тарифу забора (руб/час), уточняется при оформлении",
    applies_to: "sender",
    pricing_type: "fixed",
    amount_rub: 0,
    default_on: false,
  },
];
