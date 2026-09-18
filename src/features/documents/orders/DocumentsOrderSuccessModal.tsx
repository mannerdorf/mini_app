import React from "react";
import { GuardedDialog } from "../../../components/GuardedDialog";
import { CheckCircle2, X } from "lucide-react";

type Props = {
  nomerZayavki: string;
  onClose: () => void;
};

export function DocumentsOrderSuccessModal({ nomerZayavki, onClose }: Props) {
  return (
    <GuardedDialog title="Заявка создана в 1С" className="modal-overlay" onClose={onClose}>
      <div
        className="haulz-calc-map-modal documents-order-success-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="haulz-calc-map-modal__head">
          <div id="documents-order-success-title" className="haulz-calc-map-modal__title">
            <CheckCircle2 className="w-5 h-5" style={{ marginRight: "0.35rem", color: "#16a34a" }} />
            Заявка создана в 1С
          </div>
          <button type="button" className="haulz-calc-map-modal__close" aria-label="Закрыть" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="haulz-calc-map-modal__hint documents-order-success-modal__text">
          Создана заявка № <strong>{nomerZayavki}</strong>. Документ записан в 1С без проведения.
          Полные данные появятся в списке после обновления по расписанию.
        </p>
        <div className="haulz-calc-map-modal__actions">
          <button type="button" className="haulz-calc-btn-primary" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </GuardedDialog>
  );
}
