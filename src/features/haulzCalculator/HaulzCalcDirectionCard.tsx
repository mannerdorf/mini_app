import React, { type Ref } from "react";
import type { Direction } from "../../../lib/haulzCalculator/types";

type Props = {
  direction: Direction;
  onDirectionChange: (direction: Direction) => void;
  cardRef?: Ref<HTMLDivElement | null>;
};

export function HaulzCalcDirectionCard({ direction, onDirectionChange, cardRef }: Props) {
  return (
    <div ref={cardRef} className="haulz-calc-card documents-order-direction">
      <h2 className="haulz-calc-card__title">Маршрут</h2>
      <div className="haulz-calc-segment" role="tablist" aria-label="Маршрут перевозки">
        <button
          type="button"
          role="tab"
          aria-selected={direction === "mow_kgd"}
          className={`haulz-calc-segment__btn${direction === "mow_kgd" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => onDirectionChange("mow_kgd")}
        >
          МСК → КГД
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={direction === "kgd_mow"}
          className={`haulz-calc-segment__btn${direction === "kgd_mow" ? " haulz-calc-segment__btn--active" : ""}`}
          onClick={() => onDirectionChange("kgd_mow")}
        >
          КГД → МСК
        </button>
      </div>
    </div>
  );
}
