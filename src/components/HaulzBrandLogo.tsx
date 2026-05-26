import React from "react";
import { HAULZ_LOGO_SRC } from "../constants/brand";

type Props = {
  className?: string;
  /** Максимальная ширина логотипа (px или css). */
  maxWidth?: number | string;
};

/** Логотип HAULZ на синем фоне (без скруглённой подложки с чёрными углами). */
export function HaulzBrandLogo({ className, maxWidth = 200 }: Props) {
  return (
    <img
      src={HAULZ_LOGO_SRC}
      alt="HAULZ"
      className={className ? `haulz-brand-logo ${className}` : "haulz-brand-logo"}
      style={{ maxWidth: typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth }}
      decoding="async"
    />
  );
}
