import { useEffect, type Dispatch, type SetStateAction } from "react";
import { cityToCode } from "../../../lib/formatUtils";

export function buildTransportOptionsFromSendings(
  sendingsForTransportOptions: unknown[],
  normalizeTransportDisplay: (value: string) => string,
): string[] {
  const set = new Set<string>();
  sendingsForTransportOptions.forEach((row) => {
    const r = row as Record<string, unknown>;
    const v = normalizeTransportDisplay(
      String(r?.АвтомобильCMRНаименование ?? r?.AutoReg ?? r?.autoReg ?? r?.AutoType ?? ""),
    );
    if (v) set.add(v);
  });
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

export function buildUniqueSendingRoutes(sendingsItems: unknown[]): string[] {
  const set = new Set<string>();
  (sendingsItems || []).forEach((item) => {
    const i = item as Record<string, unknown>;
    const from = cityToCode(
      String(i?.ПунктОтправленияГородАэропорт ?? i?.CitySender ?? i?.ГородОтправления ?? ""),
    );
    const to = cityToCode(
      String(i?.ПунктНазначенияГородАэропорт ?? i?.CityReceiver ?? i?.ГородНазначения ?? ""),
    );
    const route = [from, to].filter(Boolean).join(" – ");
    if (route) set.add(route);
  });
  return [...set].sort((a, b) => a.localeCompare(b, "ru"));
}

/** Clears transport filter when selected vehicle is no longer in the current options list. */
export function useSendingsTransportFilterSync(
  transportFilter: string,
  transportOptions: string[],
  setTransportFilter: Dispatch<SetStateAction<string>>,
) {
  useEffect(() => {
    if (!transportFilter) return;
    if (transportOptions.includes(transportFilter)) return;
    setTransportFilter("");
  }, [transportFilter, transportOptions, setTransportFilter]);
}
