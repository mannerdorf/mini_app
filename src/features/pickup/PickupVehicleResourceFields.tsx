import React from "react";
import { PickupVehicleSelectOrCustomField } from "./PickupVehicleSelectOrCustomField";
import {
  VEHICLE_BODY_TYPE_PRESETS,
  VEHICLE_CAPACITY_KG_PRESETS,
  VEHICLE_CAPACITY_M3_PRESETS,
  VEHICLE_DIMENSIONS_PRESETS,
  VEHICLE_LOADING_PRESETS,
  VEHICLE_MODEL_PRESETS,
  VEHICLE_PALLETS_PRESETS,
  VEHICLE_PERMITS_PRESETS,
} from "../../../lib/pickup/vehiclePresets";

type Props = {
  data: Record<string, string>;
  update: (key: string, v: string) => void;
};

/** Поля автомобиля: пресеты из списка или свой ввод. */
export function PickupVehicleResourceFields({ data, update }: Props) {
  return (
    <div className="pk-grid">
      <PickupVehicleSelectOrCustomField
        label="Марка / модель"
        value={data.model ?? ""}
        onChange={(v) => update("model", v)}
        presets={VEHICLE_MODEL_PRESETS}
        placeholder="Например: ГАЗель Next"
      />
      <PickupVehicleSelectOrCustomField
        label="Тип кузова"
        value={data.bodyType ?? ""}
        onChange={(v) => update("bodyType", v)}
        presets={VEHICLE_BODY_TYPE_PRESETS}
      />
      <PickupVehicleSelectOrCustomField
        label="Внутренние размеры кузова, см"
        value={data.dimensions ?? ""}
        onChange={(v) => update("dimensions", v)}
        presets={VEHICLE_DIMENSIONS_PRESETS}
        placeholder="Д×Ш×В, см"
      />
      <PickupVehicleSelectOrCustomField
        label="Тип загрузки"
        value={data.loading ?? ""}
        onChange={(v) => update("loading", v)}
        presets={VEHICLE_LOADING_PRESETS}
      />
      <PickupVehicleSelectOrCustomField
        label="Пропуска / ограничения"
        value={data.permits ?? ""}
        onChange={(v) => update("permits", v)}
        presets={VEHICLE_PERMITS_PRESETS}
        placeholder="Свободный текст"
      />
      <PickupVehicleSelectOrCustomField
        label="Грузоподъёмность, кг"
        value={data.capacityKg ?? ""}
        onChange={(v) => update("capacityKg", v)}
        presets={VEHICLE_CAPACITY_KG_PRESETS}
        inputType="number"
        min="0"
        step="any"
        placeholder="кг"
      />
      <PickupVehicleSelectOrCustomField
        label="Полезный объём, м³"
        value={data.capacityM3 ?? ""}
        onChange={(v) => update("capacityM3", v)}
        presets={VEHICLE_CAPACITY_M3_PRESETS}
        inputType="number"
        min="0"
        step="any"
        placeholder="м³"
      />
      <PickupVehicleSelectOrCustomField
        label="Палетоместа"
        value={data.pallets ?? ""}
        onChange={(v) => update("pallets", v)}
        presets={VEHICLE_PALLETS_PRESETS}
        inputType="number"
        min="0"
        step="1"
        placeholder="шт."
      />
    </div>
  );
}
