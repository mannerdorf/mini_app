import { useCallback, useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { normCargoKey } from "../lib/documentsPipeline";
import type { CargoItem } from "../../../types";
import { hasPerevozkaCargoFields } from "../../../lib/perevozkaNumber";
import { SendingsTableView } from "./SendingsTableView";
import { SendingsCardsView } from "./SendingsCardsView";
import type { SendingsSectionProps } from "./sendingsSectionProps";

export type { SendingsSectionProps } from "./sendingsSectionProps";

export function SendingsSection(props: SendingsSectionProps) {
  const { tableModeEffective, perevozkiItems, onOpenCargo } = props;

  const cargoByNormKey = useMemo(() => {
    const map = new Map<string, CargoItem>();
    for (const item of perevozkiItems ?? []) {
      const key = normCargoKey(String(item?.Number ?? (item as { number?: string }).number ?? ""));
      if (key && !map.has(key)) map.set(key, item);
    }
    return map;
  }, [perevozkiItems]);

  const handleOpenCargo = useCallback(
    (cargoNumber: string, partial?: Partial<CargoItem>) => {
      const key = normCargoKey(cargoNumber);
      const fromList = key ? cargoByNormKey.get(key) : undefined;
      if (fromList) {
        onOpenCargo(cargoNumber, fromList);
        return;
      }
      const stub = {
        Number: cargoNumber,
        _role: "Customer" as const,
        ...partial,
      } as CargoItem;
      if (hasPerevozkaCargoFields(stub as Record<string, unknown>)) {
        onOpenCargo(cargoNumber, stub);
        return;
      }
      onOpenCargo(cargoNumber);
    },
    [cargoByNormKey, onOpenCargo],
  );

  const viewProps = { ...props, handleOpenCargo };

  return (
    <AnimatePresence mode="wait">
      {tableModeEffective ? (
        <SendingsTableView {...viewProps} />
      ) : (
        <SendingsCardsView {...viewProps} />
      )}
    </AnimatePresence>
  );
}
