import React from "react";
import { formatInvoiceNumber } from "../../lib/formatUtils";

const linkStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "var(--color-primary-blue)",
  fontWeight: 600,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: "2px",
  textAlign: "inherit",
};

type ClickableCargoNumberProps = {
  number: string | null | undefined;
  onOpen?: (cargoNumber: string) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export function ClickableCargoNumber({ number, onOpen, className, style, title }: ClickableCargoNumberProps) {
  const n = String(number ?? "").trim();
  const label = n ? formatInvoiceNumber(n) : "—";
  if (!n || !onOpen) {
    return <span className={className} style={style}>{label}</span>;
  }
  return (
    <button
      type="button"
      className={`entity-link-button${className ? ` ${className}` : ""}`}
      style={{ ...linkStyle, ...style }}
      title={title ?? "Открыть карточку перевозки"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(n);
      }}
    >
      {label}
    </button>
  );
}

type ClickableInvoiceNumberProps = {
  number?: string | null;
  invoice?: Record<string, unknown> | null;
  onOpen?: (invoice: Record<string, unknown>) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

type ClickableActNumberProps = {
  number?: string | null;
  act?: Record<string, unknown> | null;
  onOpen?: (act: Record<string, unknown>) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
};

export function ClickableActNumber({
  number,
  act,
  onOpen,
  className,
  style,
  title,
}: ClickableActNumberProps) {
  const num = String(number ?? act?.Number ?? act?.number ?? "").trim();
  const label = num ? formatInvoiceNumber(num) : "—";
  const payload = act ?? (num ? ({ Number: num } as Record<string, unknown>) : null);
  if (!payload || !onOpen) {
    return <span className={className} style={style}>{label}</span>;
  }
  return (
    <button
      type="button"
      className={`entity-link-button${className ? ` ${className}` : ""}`}
      style={{ ...linkStyle, ...style }}
      title={title ?? "Открыть УПД"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(payload);
      }}
    >
      {label}
    </button>
  );
}

export function ClickableInvoiceNumber({
  number,
  invoice,
  onOpen,
  className,
  style,
  title,
}: ClickableInvoiceNumberProps) {
  const num = String(number ?? invoice?.Number ?? invoice?.number ?? "").trim();
  const label = num ? formatInvoiceNumber(num) : "—";
  const payload = invoice ?? (num ? ({ Number: num } as Record<string, unknown>) : null);
  if (!payload || !onOpen) {
    return <span className={className} style={style}>{label}</span>;
  }
  return (
    <button
      type="button"
      className={`entity-link-button${className ? ` ${className}` : ""}`}
      style={{ ...linkStyle, ...style }}
      title={title ?? "Открыть счёт"}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(payload);
      }}
    >
      {label}
    </button>
  );
}

/** Стили кликабельной строки-листа (нет дочернего раскрытия). */
export function leafRowClickProps(onOpen: () => void, title: string): {
  onClick: (e: React.MouseEvent) => void;
  style: React.CSSProperties;
  title: string;
} {
  return {
    onClick: (e) => {
      e.stopPropagation();
      onOpen();
    },
    style: { cursor: "pointer" },
    title,
  };
}
