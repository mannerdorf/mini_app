import React, { useState } from "react";
import { Button, Flex, Switch, Typography } from "@maxhub/max-ui";
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

  const canSubmit =
    (!needOffer || agreeOffer) &&
    (!needConsent || agreeConsent) &&
    !accepting;

  return (
    <div className="modal-overlay" style={{ zIndex: 12000 }} role="dialog" aria-modal="true" aria-labelledby="legal-reaccept-title">
      <div
        className="modal-content"
        style={{ maxWidth: "28rem", margin: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <Typography.Headline id="legal-reaccept-title" style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>
          Новая редакция документов
        </Typography.Headline>
        <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)", marginBottom: "1rem" }}>
          Для продолжения работы в личном кабинете необходимо принять актуальные редакции.
        </Typography.Body>

        {needOffer && (
          <Flex align="center" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
            <Switch checked={agreeOffer} onCheckedChange={(v) => setAgreeOffer(!!v)} />
            <Typography.Body style={{ fontSize: "0.85rem", flex: 1 }}>
              Согласие с{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenOffer();
                }}
              >
                публичной офертой
              </a>
              {offerLabel ? ` (ред. ${offerLabel})` : ""}
            </Typography.Body>
          </Flex>
        )}

        {needConsent && (
          <Flex align="center" style={{ marginBottom: "0.75rem", gap: "0.5rem" }}>
            <Switch checked={agreeConsent} onCheckedChange={(v) => setAgreeConsent(!!v)} />
            <Typography.Body style={{ fontSize: "0.85rem", flex: 1 }}>
              Согласие на{" "}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onOpenConsent();
                }}
              >
                обработку персональных данных
              </a>
              {consentLabel ? ` (ред. ${consentLabel})` : ""}
            </Typography.Body>
          </Flex>
        )}

        {error && (
          <Typography.Body style={{ color: "var(--color-error)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
            {error}
          </Typography.Body>
        )}

        <Button
          className="button-primary"
          type="button"
          disabled={!canSubmit}
          onClick={() => void onAccept()}
          style={{ width: "100%" }}
        >
          {accepting ? <Loader2 className="w-5 h-5 animate-spin" style={{ margin: "0 auto" }} /> : "Принять"}
        </Button>
      </div>
    </div>
  );
}
