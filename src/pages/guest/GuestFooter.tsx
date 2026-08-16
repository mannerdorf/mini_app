import React from "react";
import { fetchLegalPublic } from "../../api/client/legal";
import { LegalModal } from "../../components/modals/LegalModal";
import { HAULZ_EMAIL } from "../../constants/brand";
import { PERSONAL_DATA_CONSENT_TEXT, PUBLIC_OFFER_TEXT } from "../../constants/legalTexts";
import { HAULZ_LEGAL } from "../../../lib/haulzLegal";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";
import { GuestLegalDisclosures } from "./GuestLegalDisclosures";

type Props = {
  onAbout: () => void;
  onWarehouses: () => void;
  onFaq: () => void;
  onApp: () => void;
  onCalculator: () => void;
  onLogin: () => void;
};

type LegalDoc = "offer" | "consent" | null;

const NAV_LINKS: Array<{ label: string; onClick: keyof Pick<Props, "onAbout" | "onWarehouses" | "onFaq" | "onApp" | "onCalculator" | "onLogin"> }> = [
  { label: "О компании", onClick: "onAbout" },
  { label: "Склады HAULZ", onClick: "onWarehouses" },
  { label: "FAQ", onClick: "onFaq" },
  { label: "Калькулятор", onClick: "onCalculator" },
  { label: "Приложение", onClick: "onApp" },
  { label: "Войти в кабинет", onClick: "onLogin" },
];

export function GuestFooter({ onAbout, onWarehouses, onFaq, onApp, onCalculator, onLogin }: Props) {
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
    onWarehouses,
    onFaq,
    onApp,
    onCalculator,
    onLogin,
  };

  const year = new Date().getFullYear();

  return (
    <>
      <footer className="guest-footer" aria-label="Подвал сайта">
        <div className="guest-footer__inner mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
          <div className="guest-footer__intro">
            <div>
              <div className="guest-footer__brand-title">HAULZ</div>
              <div className="guest-footer__brand-subtitle">Логистика Москва ↔ Калининград</div>
            </div>
            <p className="guest-footer__lead">
              B2B-логистика между Москвой и Калининградом: перевозки, документы, отслеживание и калькулятор в личном
              кабинете.
            </p>
          </div>

          <div className="guest-footer__grid">
            <div>
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

            <div>
              <h2 className="guest-footer__heading">Связаться с нами</h2>
              <ul className="guest-footer__links">
                <li>
                  <a href={`mailto:${HAULZ_EMAIL}`}>{GUEST_CONTACT_EMAIL_LABEL}</a>
                </li>
                {HAULZ_LEGAL.offices.map((office) => (
                  <li key={office.city}>
                    {office.city}:{" "}
                    <a href={`tel:${office.phone.replace(/[^\d+]/g, "")}`}>{office.phone}</a>
                  </li>
                ))}
              </ul>
            </div>

            <div>
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
            </div>

            <div>
              <h2 className="guest-footer__heading">Реквизиты</h2>
              <div className="guest-footer__text">
                <p>
                  {HAULZ_LEGAL.name}
                  <br />
                  ИНН {HAULZ_LEGAL.inn} · ОГРН {HAULZ_LEGAL.ogrn}
                </p>
                <p>{HAULZ_LEGAL.address}</p>
              </div>
            </div>
          </div>

          <GuestLegalDisclosures />

          <p className="guest-footer__note">
            © {year} {HAULZ_LEGAL.name}. Все права защищены. Предварительный расчёт не является публичной офертой.
          </p>
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
