import React from "react";
import { fetchLegalPublic } from "../../api/client/legal";
import { LegalModal } from "../../components/modals/LegalModal";
import {
  HAULZ_EMAIL,
  HAULZ_MAX_SUPPORT_BOT_URL,
} from "../../constants/brand";
import { PERSONAL_DATA_CONSENT_TEXT, PUBLIC_OFFER_TEXT } from "../../constants/legalTexts";
import { HAULZ_LEGAL } from "../../../lib/haulzLegal";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";

type Props = {
  onAbout: () => void;
  onFaq: () => void;
  onApp: () => void;
  onCalculator: () => void;
  onLogin: () => void;
};

type LegalDoc = "offer" | "consent" | null;

const NAV_LINKS: Array<{ label: string; onClick: keyof Pick<Props, "onAbout" | "onFaq" | "onApp" | "onCalculator" | "onLogin"> }> = [
  { label: "Склады HAULZ", onClick: "onAbout" },
  { label: "FAQ", onClick: "onFaq" },
  { label: "Калькулятор", onClick: "onCalculator" },
  { label: "Приложение", onClick: "onApp" },
  { label: "Войти в кабинет", onClick: "onLogin" },
];

export function GuestFooter({ onAbout, onFaq, onApp, onCalculator, onLogin }: Props) {
  const [legalDoc, setLegalDoc] = React.useState<LegalDoc>(null);
  const [offerText, setOfferText] = React.useState(PUBLIC_OFFER_TEXT);
  const [consentText, setConsentText] = React.useState(PERSONAL_DATA_CONSENT_TEXT);

  React.useEffect(() => {
    void fetchLegalPublic()
      .then((pub) => {
        if (pub.offer?.body_text) setOfferText(pub.offer.body_text);
        if (pub.consent?.body_text) setConsentText(pub.consent.body_text);
      })
      .catch(() => {
        /* default texts */
      });
  }, []);

  const handlers: Record<(typeof NAV_LINKS)[number]["onClick"], () => void> = {
    onAbout,
    onFaq,
    onApp,
    onCalculator,
    onLogin,
  };

  const year = new Date().getFullYear();

  return (
    <>
      <footer className="guest-footer" aria-label="Подвал сайта">
        <div className="guest-footer__glow" aria-hidden />
        <div className="mx-auto max-w-guest px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <div className="inline-flex min-w-[4.75rem] items-center justify-center rounded-xl bg-haulz-brand px-3 py-1.5 text-sm font-bold tracking-[0.12em] text-white">
                HAULZ
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-[hsl(var(--guest-muted-foreground))]">
                B2B-логистика между Москвой и Калининградом: перевозки, документы, отслеживание и калькулятор в личном кабинете.
              </p>
              <p className="mt-4 text-xs leading-relaxed text-[hsl(var(--guest-muted-foreground))]">
                {HAULZ_LEGAL.name}
                <br />
                ИНН {HAULZ_LEGAL.inn} · ОГРН {HAULZ_LEGAL.ogrn}
              </p>
            </div>

            <div className="lg:col-span-2">
              <h2 className="guest-footer__heading">Разделы</h2>
              <ul className="guest-footer__links">
                {NAV_LINKS.map((item) => (
                  <li key={item.label}>
                    <button type="button" onClick={handlers[item.onClick]}>
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-3">
              <h2 className="guest-footer__heading">Связаться с нами</h2>
              <ul className="guest-footer__links">
                <li>
                  <a href={`mailto:${HAULZ_EMAIL}`}>{GUEST_CONTACT_EMAIL_LABEL}</a>
                </li>
                <li>
                  <a href={HAULZ_MAX_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer">
                    MAX
                  </a>
                </li>
              </ul>
              <div className="mt-4 space-y-1 text-xs text-[hsl(var(--guest-muted-foreground))]">
                {HAULZ_LEGAL.offices.map((office) => (
                  <p key={office.city}>
                    {office.city}:{" "}
                    <a href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} className="text-haulz-brand hover:underline">
                      {office.phone}
                    </a>
                  </p>
                ))}
              </div>
            </div>

            <div className="lg:col-span-3">
              <h2 className="guest-footer__heading">Правовая информация</h2>
              <ul className="guest-footer__links">
                <li>
                  <button type="button" onClick={() => setLegalDoc("offer")}>
                    Публичная оферта
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => setLegalDoc("consent")}>
                    Согласие на обработку персональных данных
                  </button>
                </li>
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-[hsl(var(--guest-muted-foreground))]">
                {HAULZ_LEGAL.address}
              </p>
            </div>
          </div>

          <div className="guest-footer__bottom">
            <p>© {year} {HAULZ_LEGAL.name}. Все права защищены.</p>
            <p className="guest-footer__bottom-meta">Маршрут Москва ↔ Калининград · haulz.space</p>
          </div>
        </div>
      </footer>

      <LegalModal isOpen={legalDoc === "offer"} onClose={() => setLegalDoc(null)} title="Публичная оферта">
        {offerText}
      </LegalModal>
      <LegalModal
        isOpen={legalDoc === "consent"}
        onClose={() => setLegalDoc(null)}
        title="Согласие на обработку персональных данных"
      >
        {consentText}
      </LegalModal>
    </>
  );
}
