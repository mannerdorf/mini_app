import React, { useEffect, useState } from "react";
import { Button, Typography } from "@maxhub/max-ui";
import type { HaulzCarrier, HaulzCarrierInput } from "../../../lib/haulzReturns/carriers";

const EMPTY: HaulzCarrierInput = {
  name: "",
  legalAddress: "",
  inn: "",
  kpp: "",
  loadingAddress: "",
  unloadingAddress: "",
};

type Props = {
  open: boolean;
  title: string;
  initial?: HaulzCarrierInput | null;
  saving?: boolean;
  onClose: () => void;
  onSave: (input: HaulzCarrierInput) => void | Promise<void>;
};

export function HaulzCarrierFormModal({ open, title, initial, saving, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<HaulzCarrierInput>(EMPTY);

  useEffect(() => {
    if (!open) return;
    setDraft(initial ? { ...initial } : { ...EMPTY });
  }, [open, initial]);

  if (!open) return null;

  const setField = (key: keyof HaulzCarrierInput, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content hr-carrier-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <Typography.Headline variant="medium">{title}</Typography.Headline>
          <button type="button" className="modal-header-icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        <div className="hr-carrier-form">
          <label className="hr-carrier-form__field">
            <span>Название компании</span>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setField("name", e.target.value)}
              placeholder='ООО «ХОЛЗ»'
            />
          </label>
          <label className="hr-carrier-form__field">
            <span>Юридический адрес</span>
            <textarea
              value={draft.legalAddress}
              onChange={(e) => setField("legalAddress", e.target.value)}
              rows={3}
              placeholder="119049, Город Москва, ..."
            />
          </label>
          <div className="hr-carrier-form__row">
            <label className="hr-carrier-form__field">
              <span>ИНН</span>
              <input type="text" value={draft.inn} onChange={(e) => setField("inn", e.target.value)} />
            </label>
            <label className="hr-carrier-form__field">
              <span>КПП</span>
              <input type="text" value={draft.kpp} onChange={(e) => setField("kpp", e.target.value)} />
            </label>
          </div>
          <label className="hr-carrier-form__field">
            <span>Факт. адрес загрузки</span>
            <textarea
              value={draft.loadingAddress}
              onChange={(e) => setField("loadingAddress", e.target.value)}
              rows={2}
              placeholder="Россия, г. Калининград, ..."
            />
          </label>
          <label className="hr-carrier-form__field">
            <span>Факт. адрес выгрузки</span>
            <textarea
              value={draft.unloadingAddress}
              onChange={(e) => setField("unloadingAddress", e.target.value)}
              rows={2}
              placeholder="Россия, г. Москва, ..."
            />
          </label>
        </div>
        <div className="hr-carrier-form__actions">
          <Button type="button" className="filter-button" disabled={saving} onClick={onClose}>
            Отмена
          </Button>
          <Button
            type="button"
            className="button-primary"
            disabled={saving || !draft.name.trim()}
            onClick={() => void onSave(draft)}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function carrierToInput(c: HaulzCarrier): HaulzCarrierInput {
  return {
    name: c.name,
    legalAddress: c.legalAddress,
    inn: c.inn,
    kpp: c.kpp,
    loadingAddress: c.loadingAddress,
    unloadingAddress: c.unloadingAddress,
  };
}
