import { cityToCode } from "../../../lib/formatUtils";

export function pendingPointLabel(row: Record<string, unknown>, kind: "from" | "to"): string {
  if (kind === "from") {
    return String(
      row?.АдресОтправки ??
        row?.ПунктОтправкиНаименование ??
        row?.ПунктОтправки ??
        row?.ПунктОтправления ??
        row?.SenderPoint ??
        "",
    ).trim();
  }
  return String(
    row?.АдресНазначения ??
      row?.ПунктНазначенияНаименование ??
      row?.ПунктНазначения ??
      row?.ПунктДоставки ??
      row?.DestinationPoint ??
      row?.ReceiverPoint ??
      "",
  ).trim();
}

export function orderRouteLabel(
  row: Record<string, unknown>,
  senderPoint: string,
  destinationPoint: string,
): string {
  const cityFrom = String(row?.CitySender ?? "").trim();
  const cityTo = String(row?.CityReceiver ?? "").trim();
  if (cityFrom && cityTo) return `${cityFrom} – ${cityTo}`;
  return (
    [cityToCode(senderPoint) || senderPoint, cityToCode(destinationPoint) || destinationPoint]
      .filter(Boolean)
      .join(" – ") || "—"
  );
}
