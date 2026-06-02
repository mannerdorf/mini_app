/** Реквизиты ООО «ХОЛЗ» для шапки спецификации (строки 7–10). */
export const HOLZ_SPEC_PARTY_DEFAULTS = {
  name: "ООО «ХОЛЗ»",
  legalAddress:
    "119049, Город Москва, вн.тер. г. Муниципальный Округ Якиманка, ул Мытная, дом 28, строение 3, помещение 1/1",
  inn: "9706037094",
  kpp: "770601001",
  loadingAddress: "Россия, г. Калининград, ул. Железнодорожная 12 склад 23",
  unloadingAddress: "Россия, г. Москва, ул. Вавилова, д. 19",
} as const;

export type SpecPartyDefaults = typeof HOLZ_SPEC_PARTY_DEFAULTS;

function formatPartyBlock(party: SpecPartyDefaults): string {
  return `${party.name}  ${party.legalAddress}               ИНН / КПП: ${party.inn} / ${party.kpp}`;
}

export function formatSpecificationPartyRows(party: SpecPartyDefaults = HOLZ_SPEC_PARTY_DEFAULTS) {
  const block = formatPartyBlock(party);
  return {
    shipper: `ГРУЗООТПРАВИТЕЛЬ: ${block}`,
    loading: `Факт. адрес загрузки: ${party.loadingAddress}`,
    consignee: `ГРУЗОПОЛУЧАТЕЛЬ: ${block}`,
    unloading: `Факт. адрес выгрузки: ${party.unloadingAddress}`,
  };
}

/** Строки 7–8 шапки проформы: грузоотправитель и грузополучатель с адресами загрузки/выгрузки. */
export function formatProformaPartyRows(party: SpecPartyDefaults = HOLZ_SPEC_PARTY_DEFAULTS) {
  return {
    shipper: `ГРУЗООТПРАВИТЕЛЬ: ${party.name}  ${party.loadingAddress}`,
    consignee: `ГРУЗОПОЛУЧАТЕЛЬ: ${party.name} ${party.unloadingAddress}`,
  };
}
