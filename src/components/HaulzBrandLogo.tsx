import React from "react";
import { HAULZ_SPLASH_BACKGROUND } from "../constants/brand";

type Props = {
  className?: string;
  /** Максимальная ширина блока (px или css). */
  maxWidth?: number | string;
};

/** Логотип HAULZ: белые буквы на синем фоне, без отдельной «плитки»/рамки. */
export function HaulzBrandLogo({ className, maxWidth = 200 }: Props) {
  const w = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  return (
    <div
      className={className ? `haulz-brand-logo ${className}` : "haulz-brand-logo"}
      style={{ maxWidth: w, background: HAULZ_SPLASH_BACKGROUND }}
      role="img"
      aria-label="HAULZ"
    >
      <span className="haulz-brand-logo__word">HAULZ</span>
    </div>
  );
}
