import React from "react";
import {
  formatPoruchenieCityLine,
  formatPoruchenieContractLine,
  formatPoruchenieTitleLine,
  isoDateToRu,
  ruDateToIso,
} from "../../lib/haulzReturns";

type Props = {
  number: string;
  date: string;
  contractNumber: string;
  contractDate: string;
  onNumberChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onContractNumberChange: (value: string) => void;
  onContractDateChange: (value: string) => void;
};

export function HaulzPoruchenieDraftForm({
  number,
  date,
  contractNumber,
  contractDate,
  onNumberChange,
  onDateChange,
  onContractNumberChange,
  onContractDateChange,
}: Props) {
  const iso = ruDateToIso(date);
  const contractIso = ruDateToIso(contractDate);
  const header = { number, date, contractNumber, contractDate };

  return (
    <div className="hr-customs-form-card">
      <div className="hr-poruchenie-header-preview" aria-label="Предпросмотр шапки поручения">
        <div className="hr-poruchenie-header-preview__title">{formatPoruchenieTitleLine(header)}</div>
        <div className="hr-poruchenie-header-preview__city">{formatPoruchenieCityLine(header)}</div>
        <div className="hr-poruchenie-header-preview__contract">{formatPoruchenieContractLine(header)}</div>
      </div>
      <div className="hr-customs-form hr-customs-form--compact hr-customs-form--poruchenie">
        <label className="hr-customs-form__field hr-customs-form__field--compact">
          <div className="hr-td-inline-field">
            <span className="hr-td-inline-field__label">Поручение №</span>
            <input
              type="text"
              className="hr-td-inline-field__input"
              inputMode="numeric"
              value={number}
              aria-label="Номер поручения"
              onChange={(e) => onNumberChange(e.target.value)}
            />
          </div>
        </label>
        <label className="hr-customs-form__field hr-customs-form__field--compact">
          <div className="hr-td-inline-field">
            <span className="hr-td-inline-field__label">Дата</span>
            <span className="hr-td-inline-field__sep">от</span>
            <input
              type="date"
              className="hr-td-inline-field__date"
              value={iso}
              aria-label="Дата поручения"
              onChange={(e) => {
                const ru = isoDateToRu(e.target.value);
                if (ru) onDateChange(ru);
              }}
            />
          </div>
        </label>
        <label className="hr-customs-form__field hr-customs-form__field--compact">
          <div className="hr-td-inline-field">
            <span className="hr-td-inline-field__label">Договор №</span>
            <input
              type="text"
              className="hr-td-inline-field__input"
              value={contractNumber}
              aria-label="Номер агентского договора"
              onChange={(e) => onContractNumberChange(e.target.value)}
            />
          </div>
        </label>
        <label className="hr-customs-form__field hr-customs-form__field--compact">
          <div className="hr-td-inline-field">
            <span className="hr-td-inline-field__label">Дата договора</span>
            <span className="hr-td-inline-field__sep">от</span>
            <input
              type="date"
              className="hr-td-inline-field__date"
              value={contractIso}
              aria-label="Дата агентского договора"
              onChange={(e) => {
                const ru = isoDateToRu(e.target.value);
                if (ru) onContractDateChange(ru);
              }}
            />
          </div>
        </label>
      </div>
    </div>
  );
}
