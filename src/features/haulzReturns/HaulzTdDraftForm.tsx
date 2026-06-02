import React from "react";
import { HaulzTdDraftField } from "./HaulzTdDraftField";

const COMPACT_LABELS: Record<string, string> = {
  productEaeu: "ТОВАР ЕАЭС",
  exportPermit: "ВЫВОЗ",
  zpu: "01 ЗПУ №",
  fts: "02 ФТС №",
  title: "Заголовок",
  headerTd: "ТД в шапке",
};

type Props = {
  variant: "proforma" | "specification";
  fieldOrder: readonly string[];
  draft: Record<string, string>;
  onFieldChange: (key: string, value: string) => void;
};

export function HaulzTdDraftForm({ variant, fieldOrder, draft, onFieldChange }: Props) {
  return (
    <div className="hr-customs-form-card">
      <div className={`hr-customs-form hr-customs-form--compact hr-customs-form--${variant}`}>
        {fieldOrder.map((key) => (
          <HaulzTdDraftField
            key={key}
            fieldKey={key}
            label={COMPACT_LABELS[key] ?? key}
            value={draft[key] ?? ""}
            ftsValue={key === "title" ? draft.fts : undefined}
            compact
            onChange={(v) => onFieldChange(key, v)}
          />
        ))}
      </div>
    </div>
  );
}
