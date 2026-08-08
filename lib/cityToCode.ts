/** Все города Калининградской области → KGD; все города Московской области → MSK (как в разделе «Грузы»). */
export function cityToCode(city: string | number | undefined | null): string {
  if (city === undefined || city === null) return "";
  const s = String(city).trim().toLowerCase();
  if (/^wh_msk$/.test(s)) return "MSK";
  if (/^wh_kgd$/.test(s)) return "KGD";
  if (/калининградская\s*область|калининград|кгд/.test(s)) return "KGD";
  if (
    /советск|черняховск|балтийск|гусев|светлый|гурьевск|зеленоградск|светлогорск|пионерский|багратионовск|нестеров|озёрск|правдинск|полесск|лаврово|мамоново|янтарный/.test(
      s,
    )
  )
    return "KGD";
  if (/московская\s*область|москва|мск|msk/.test(s)) return "MSK";
  if (
    /подольск|балашиха|химки|королёв|мытищи|люберцы|электросталь|коломна|одинцово|серпухов|орехово-зуево|раменское|жуковский|пушкино|сергиев\s*посад|воскресенск|лобня|клин|дубна|егорьевск|чехов|дмитров|ступино|ногинск|долгопрудный|реутов|андреевск|фрязино|троицк|ивантеевка|дзержинский|видное|красногорск|домодедово|железнодорожный|котельники/.test(
      s,
    )
  )
    return "MSK";
  return String(city).trim();
}

export function formatCargoRoute(sender: unknown, receiver: unknown): string {
  const from = cityToCode(sender as string);
  const to = cityToCode(receiver as string);
  return [from, to].filter(Boolean).join(" – ") || "";
}
