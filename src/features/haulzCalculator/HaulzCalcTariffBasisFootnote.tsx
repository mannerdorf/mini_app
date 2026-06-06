import React from "react";

type Props = {
  footnote?: string | null;
};

export function HaulzCalcTariffBasisFootnote({ footnote }: Props) {
  if (!footnote) return null;
  return <p className="haulz-calc-summary__footnote">{footnote}</p>;
}
