import React, { FormEvent } from "react";
import { X } from "lucide-react";
import { Button, Input, Typography } from "@maxhub/max-ui";
import { ChatModal } from "../ChatModal";
import { LegalModal } from "./modals/LegalModal";
import { LegalReacceptModal } from "./modals/LegalReacceptModal";
import type { useLegalCompliance } from "../hooks/useLegalCompliance";

type LegalCompliance = ReturnType<typeof useLegalCompliance>;

type Props = {
  authLogin: string | undefined;
  legalCompliance: LegalCompliance;
  isOfferOpen: boolean;
  setIsOfferOpen: (value: boolean) => void;
  isPersonalConsentOpen: boolean;
  setIsPersonalConsentOpen: (value: boolean) => void;
  showPinModal: boolean;
  setShowPinModal: (value: boolean) => void;
  pinCode: string;
  setPinCode: (value: string) => void;
  pinError: boolean;
  setPinError: (value: boolean) => void;
  onPinSubmit: (e?: FormEvent) => void;
  isChatOpen: boolean;
  setIsChatOpen: (value: boolean) => void;
};

export function AppShellModals({
  authLogin,
  legalCompliance,
  isOfferOpen,
  setIsOfferOpen,
  isPersonalConsentOpen,
  setIsPersonalConsentOpen,
  showPinModal,
  setShowPinModal,
  pinCode,
  setPinCode,
  pinError,
  setPinError,
  onPinSubmit,
  isChatOpen,
  setIsChatOpen,
}: Props) {
  const closePinModal = () => {
    setShowPinModal(false);
    setPinCode("");
    setPinError(false);
  };

  return (
    <>
      <LegalModal
        isOpen={!!isOfferOpen}
        onClose={() => setIsOfferOpen(false)}
        title="Публичная оферта"
        stackAboveBlocker={legalCompliance.pending}
      >
        {legalCompliance.offerText}
      </LegalModal>
      <LegalModal
        isOpen={!!isPersonalConsentOpen}
        onClose={() => setIsPersonalConsentOpen(false)}
        title="Согласие на обработку персональных данных"
        stackAboveBlocker={legalCompliance.pending}
      >
        {legalCompliance.consentText}
      </LegalModal>

      {legalCompliance.pending && legalCompliance.status && (
        <LegalReacceptModal
          status={legalCompliance.status}
          offerLabel={legalCompliance.status.current.offer?.version_label ?? ""}
          consentLabel={legalCompliance.status.current.consent?.version_label ?? ""}
          accepting={legalCompliance.accepting}
          error={legalCompliance.error}
          onOpenOffer={() => setIsOfferOpen(true)}
          onOpenConsent={() => setIsPersonalConsentOpen(true)}
          onAccept={legalCompliance.acceptCurrent}
        />
      )}

      {showPinModal && (
        <div className="modal-overlay" onClick={closePinModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <Button className="modal-close-button" onClick={closePinModal} aria-label="Закрыть">
                <X size={20} />
              </Button>
            </div>
            <form onSubmit={onPinSubmit}>
              <div style={{ marginBottom: "1rem" }}>
                <Input
                  type="password"
                  className="login-input"
                  placeholder=""
                  value={pinCode}
                  onChange={(e) => {
                    setPinCode(e.target.value);
                    setPinError(false);
                  }}
                  autoFocus
                  maxLength={4}
                  style={{ textAlign: "center", fontSize: "1.5rem", letterSpacing: "0.5rem" }}
                />
                {pinError && (
                  <Typography.Body className="login-error" style={{ marginTop: "0.5rem", textAlign: "center" }}>
                    Неверный пин-код
                  </Typography.Body>
                )}
              </div>
              <Button className="button-primary" type="submit" style={{ width: "100%" }}>
                Войти
              </Button>
            </form>
          </div>
        </div>
      )}

      <ChatModal isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} userId={authLogin || "anon"} />
    </>
  );
}
