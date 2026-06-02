import React from "react";
import {
  formatRuDate,
  isTdDraftDateField,
  isoDateToRu,
  joinDraftDateField,
  ruDateToIso,
  splitDraftDateField,
  syncTitleDateFromFts,
} from "../../lib/haulzReturns";

type Props = {
  fieldKey: string;
  label: string;
  value: string;
  ftsValue?: string;
  compact?: boolean;
  onChange: (value: string) => void;
};

function fieldClass(fieldKey: string, compact?: boolean): string {
  const parts = ["hr-customs-form__field"];
  if (compact) parts.push("hr-customs-form__field--compact");
  if (fieldKey === "title") parts.push("hr-customs-form__field--wide");
  return parts.join(" ");
}

function CompactInlineInput({
  label,
  ariaLabel,
  value,
  onChange,
  wide,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  wide?: boolean;
}) {
  return (
    <div className={`hr-td-inline-field${wide ? " hr-td-inline-field--wide" : ""}`}>
      <span className="hr-td-inline-field__label">{label}</span>
      <input
        type="text"
        className="hr-td-inline-field__input"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function HaulzTdDraftField({ fieldKey, label, value, ftsValue, compact, onChange }: Props) {
  if (fieldKey === "title") {
    const display = ftsValue != null ? syncTitleDateFromFts(value, ftsValue) : value;
    if (compact) {
      return (
        <label className={fieldClass(fieldKey, compact)}>
          <CompactInlineInput
            label={label}
            ariaLabel="Заголовок документа"
            value={display}
            wide
            onChange={onChange}
          />
        </label>
      );
    }
    return (
      <label className={fieldClass(fieldKey, compact)}>
        <span>{label}</span>
        <input
          type="text"
          className="hr-customs-form__input--wide"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          title="Даты «от …» синхронизируются с полем 02 ФТС №"
        />
      </label>
    );
  }

  if (fieldKey === "fts") {
    const parts = splitDraftDateField("fts", value);
    const iso = ruDateToIso(parts.date ?? formatRuDate());
    return (
      <label className={fieldClass(fieldKey, compact)}>
        {!compact ? <span>{label}</span> : null}
        <div className="hr-td-inline-field">
          <span className="hr-td-inline-field__label">02 ФТС №</span>
          <span className="hr-td-inline-field__sep">от</span>
          <input
            type="date"
            className="hr-td-inline-field__date"
            value={iso}
            aria-label={label}
            onChange={(e) => {
              const ru = isoDateToRu(e.target.value);
              if (!ru) return;
              onChange(joinDraftDateField("fts", { before: "02 ФТС № от ", date: ru, after: "" }));
            }}
          />
        </div>
      </label>
    );
  }

  if (!isTdDraftDateField(fieldKey)) {
    if (compact) {
      return (
        <label className={fieldClass(fieldKey, compact)}>
          <CompactInlineInput label={label} ariaLabel={label} value={value} onChange={onChange} />
        </label>
      );
    }
    return (
      <label className={fieldClass(fieldKey, compact)}>
        <span>{label}</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  const parts = splitDraftDateField(fieldKey, value);
  const iso = ruDateToIso(parts.date ?? formatRuDate());
  const prefix = compact ? label : (parts.before ?? "").trimEnd();

  return (
    <label className={fieldClass(fieldKey, compact)}>
      {!compact ? <span>{label}</span> : null}
      <div className="hr-td-inline-field">
        {prefix ? <span className="hr-td-inline-field__label">{prefix}</span> : null}
        <input
          type="date"
          className="hr-td-inline-field__date"
          value={iso}
          aria-label={label}
          onChange={(e) => {
            const ru = isoDateToRu(e.target.value);
            if (!ru) return;
            onChange(joinDraftDateField(fieldKey, { ...parts, date: ru }));
          }}
        />
        {!compact && parts.after ? <span className="hr-td-inline-field__suffix">{parts.after}</span> : null}
      </div>
    </label>
  );
}
