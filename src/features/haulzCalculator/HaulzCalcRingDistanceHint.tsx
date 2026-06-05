import React from "react";
import type { HaulzRingDistance } from "../../api/client/haulzCalculator";

type Props = {
  ringLabel: string;
  distance: HaulzRingDistance;
};

export function HaulzCalcRingDistanceHint({ ringLabel, distance }: Props) {
  const { km, osrmKm, dgisKm } = distance;
  const showBreakdown = osrmKm != null || dgisKm != null;

  if (!showBreakdown) {
    return (
      <p className="haulz-calc-hint">
        км за {ringLabel}: {km.toFixed(1)}
      </p>
    );
  }

  return (
    <p className="haulz-calc-hint haulz-calc-ring-dist">
      км за {ringLabel}: <span className="haulz-calc-ring-dist__used">{km.toFixed(1)}</span>
      <span className="haulz-calc-ring-dist__sources">
        {osrmKm != null && (
          <span className="haulz-calc-ring-dist__osrm">OSRM {osrmKm.toFixed(1)}</span>
        )}
        {osrmKm != null && dgisKm != null && <span className="haulz-calc-ring-dist__sep">·</span>}
        {dgisKm != null && (
          <span className="haulz-calc-ring-dist__dgis">2GIS {dgisKm.toFixed(1)}</span>
        )}
      </span>
    </p>
  );
}
