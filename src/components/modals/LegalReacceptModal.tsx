import React, { useEffect, useState } from "react";
import { Button } from "@maxhub/max-ui";
import { Loader2 } from "lucide-react";
import type { LegalStatusResponse } from "../../api/client/legal";

type Props = {
  status: LegalStatusResponse;
  offerLabel: string;
  consentLabel: string;
  accepting: boolean;
  error: string | null;
  onOpenOffer: () => void;
  onOpenConsent: () => void;
  onAccept: () => Promise<void>;
};

function LegalAcceptRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="legal-reaccept-modal__row switch-wrapper">
      <input
        type="checkbox"
        className="legal-reaccept-modal__checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={`switch-container legal-reaccept-modal__switch${checked ? " checked" : ""}`} aria-hidden>
        <span className="switch-knob" />
      </span>
      <span className="legal-reaccept-modal__label">{children}</span>
    </label>
  );
}

/** Блокирующее окно при выходе новой редакции оферты и/или согласия. */
export function LegalReacceptModal({
  status,
  offerLabel,
  consentLabel,
  accepting,
  error,
  onOpenOffer,
  onOpenConsent,
  onAccept,
}: Props) {
  const needOffer = status.pending.offer;
  const needConsent = status.pending.consent;
  const [agreeOffer, setAgreeOffer] = useState(!needOffer);
  const [agreeConsent, setAgreeConsent] = useState(!needConsent);

  useEffect(() => {
    setAgreeOffer(!needOffer);
    setAgreeConsent(!needConsent);
  }, [needOffer, needConsent]);

  const canSubmit =
    (!needOffer || agreeOffer) &&
    (!needConsent || agreeConsent) &&
    !accepting;

  return (
    <div
      className="modal-overlay legal-reaccept-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-reaccept-title"
    >
      <div
        className="modal-content legal-reaccept-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="legal-reaccept-title" className="legal-reaccept-modal__title">
          Новая редакция документов
        </h2>
        <p className="legal-reaccept-modal__lead">
          Для продолжения работы в личном кабинете необходимо принять актуальные редакции.
        </p>

        <div className="legal-reaccept-modal__rows">
          {needOffer && (
            <LegalAcceptRow checked={agreeOffer} onChange={setAgreeOffer}>
              Согласие с{" "}
              <button
                type="button"
                className="legal-reaccept-modal__link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenOffer();
                }}
              >
                публичной офертой
              </button>
              {offerLabel ? <span className="legal-reaccept-modal__version"> (ред. {offerLabel})</span> : null}
            </LegalAcceptRow>
          )}

          {needConsent && (
            <LegalAcceptRow checked={agreeConsent} onChange={setAgreeConsent}>
              Согласие на{" "}
              <button
                type="button"
                className="legal-reaccept-modal__link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpenConsent();
                }}
              >
                обработку персональных данных
              </button>
              {consentLabel ? <span className="legal-reaccept-modal__version"> (ред. {consentLabel})</span> : null}
            </LegalAcceptRow>
          )}
        </div>

        {error && <p className="legal-reaccept-modal__error">{error}</p>}

        <Button
          className="button-primary legal-reaccept-modal__submit"
          type="button"
          disabled={!canSubmit}
          onClick={() => void onAccept()}
        >
          {accepting ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: "0 auto" }} /> : "Принять"}
        </Button>
      </div>
    </div>
  );
}
