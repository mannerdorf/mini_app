import React from "react";

type Props = {
  className?: string;
  /** Максимальная ширина блока (px или css). */
  maxWidth?: number | string;
};

const LETTERS = ["H", "A", "U", "L", "Z"] as const;

/** Анимированный wordmark HAULZ на белом фоне (без синего куба). */
export function HaulzBrandLogo({ className, maxWidth = 240 }: Props) {
  const w = typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;
  return (
    <div
      className={className ? `haulz-brand-logo ${className}` : "haulz-brand-logo"}
      style={{ maxWidth: w }}
      role="img"
      aria-label="HAULZ"
    >
      <span className="haulz-brand-logo__word" aria-hidden>
        {LETTERS.map((letter, index) => (
          <span
            key={letter}
            className="haulz-brand-logo__letter"
            style={{ animationDelay: `${index * 0.14}s` }}
          >
            {letter}
          </span>
        ))}
      </span>
    </div>
  );
}
