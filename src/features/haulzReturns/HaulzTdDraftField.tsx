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
  onChange: (value: string) => void;
};

export function HaulzTdDraftField({ fieldKey, label, value, ftsValue, onChange }: Props) {
  if (fieldKey === "title") {
    const display = ftsValue != null ? syncTitleDateFromFts(value, ftsValue) : value;
    return (
      <label className="hr-customs-form__field">
        <span>{label}</span>
        <input
          type="text"
          value={display}
          onChange={(e) => onChange(e.target.value)}
          title="Дата в заголовке синхронизируется с полем «02 ФТС №»"
        />
        {ftsValue ? (
          <span className="hr-td-date-field__hint">Дата «от …» берётся из поля 02 ФТС №</span>
        ) : null}
      </label>
    );
  }

  if (fieldKey === "fts") {
    const parts = splitDraftDateField("fts", value);
    const iso = ruDateToIso(parts.date ?? formatRuDate());
    return (
      <label className="hr-customs-form__field">
        <span>{label}</span>
        <div className="hr-td-date-field hr-td-date-field--fts">
          <span className="hr-td-date-field__fts-num">02 ФТС №</span>
          <span className="hr-td-date-field__ot">от</span>
          <input
            type="date"
            className="hr-td-date-field__picker"
            value={iso}
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
    return (
      <label className="hr-customs-form__field">
        <span>{label}</span>
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  const parts = splitDraftDateField(fieldKey, value);
  const iso = ruDateToIso(parts.date ?? formatRuDate());

  return (
    <label className="hr-customs-form__field">
      <span>{label}</span>
      <div className="hr-td-date-field">
        {parts.before ? <span className="hr-td-date-field__prefix">{parts.before}</span> : null}
        <input
          type="date"
          className="hr-td-date-field__picker"
          value={iso}
          onChange={(e) => {
            const ru = isoDateToRu(e.target.value);
            if (!ru) return;
            onChange(joinDraftDateField(fieldKey, { ...parts, date: ru }));
          }}
        />
        {parts.after ? <span className="hr-td-date-field__suffix">{parts.after}</span> : null}
      </div>
    </label>
  );
}
