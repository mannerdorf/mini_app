import React, { useCallback, useEffect, useRef, useState } from "react";
import { Typography } from "@maxhub/max-ui";
import { isoDateToRu, ruDateToIso } from "../../lib/haulzReturns";

export type UlTdMetaPatch = {
  ulNumber: string;
  tdNumber: string;
  tdDate: string | null;
};

type Props = {
  sheetId: string;
  ulNumber: string;
  tdNumber: string | null | undefined;
  tdDate: string | null | undefined;
  onChange: (patch: UlTdMetaPatch) => void | Promise<void>;
  disabled?: boolean;
};

type LocalState = {
  ul: string;
  number: string;
  dateRu: string;
};

function toLocal(ulNumber: string, tdNumber: string | null | undefined, tdDate: string | null | undefined): LocalState {
  return {
    ul: ulNumber,
    number: String(tdNumber ?? ""),
    dateRu: String(tdDate ?? "").trim(),
  };
}

function toPatch(local: LocalState): UlTdMetaPatch {
  return {
    ulNumber: local.ul.trim(),
    tdNumber: local.number.trim(),
    tdDate: local.dateRu.trim() || null,
  };
}

export function HaulzUlTdField({ sheetId, ulNumber, tdNumber, tdDate, onChange, disabled }: Props) {
  const [local, setLocal] = useState<LocalState>(() => toLocal(ulNumber, tdNumber, tdDate));
  const committedRef = useRef(JSON.stringify(toPatch(local)));
  const localRef = useRef(local);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  localRef.current = local;

  useEffect(() => {
    const next = toLocal(ulNumber, tdNumber, tdDate);
    setLocal(next);
    committedRef.current = JSON.stringify(toPatch(next));
  }, [sheetId, ulNumber, tdNumber, tdDate]);

  const commit = useCallback(() => {
    const current = localRef.current;
    const normalized: LocalState = {
      ...current,
      number: current.number.trim(),
      dateRu: current.dateRu.trim(),
    };
    localRef.current = normalized;
    setLocal(normalized);
    const patch = toPatch(localRef.current);
    const key = JSON.stringify(patch);
    if (key === committedRef.current) return;
    committedRef.current = key;
    void onChangeRef.current(patch);
  }, []);

  useEffect(() => {
    return () => {
      const patch = toPatch(localRef.current);
      const key = JSON.stringify(patch);
      if (key !== committedRef.current) {
        committedRef.current = key;
        void onChangeRef.current(patch);
      }
    };
  }, [sheetId]);

  const dateIso = ruDateToIso(local.dateRu) ?? "";

  return (
    <div className="hr-td-field">
      <Typography.Body className="hr-td-field__title">Таможенная декларация</Typography.Body>
      <div className="hr-td-field__grid">
        <label className="hr-td-field__cell">
          <span className="hr-td-field__cell-label">УЛ №</span>
          <input
            type="text"
            className="hr-td-field__input"
            value={local.ul}
            disabled={disabled}
            onChange={(e) => setLocal((s) => ({ ...s, ul: e.target.value }))}
            onBlur={commit}
          />
        </label>
        <label className="hr-td-field__cell">
          <span className="hr-td-field__cell-label">Номер ТД</span>
          <input
            type="text"
            className="hr-td-field__input"
            value={local.number}
            disabled={disabled}
            onChange={(e) => setLocal((s) => ({ ...s, number: e.target.value }))}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          />
        </label>
        <label className="hr-td-field__cell">
          <span className="hr-td-field__cell-label">Дата УЛ</span>
          <input
            type="date"
            className="hr-td-field__input hr-td-field__input--date"
            value={dateIso}
            disabled={disabled}
            onChange={(e) => {
              const ru = isoDateToRu(e.target.value);
              setLocal((s) => ({ ...s, dateRu: ru ?? "" }));
            }}
            onBlur={commit}
          />
        </label>
      </div>
    </div>
  );
}
