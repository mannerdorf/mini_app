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
  const phones = HAULZ_LEGAL.offices.map((o) => `${o.city}: ${o.phone}`).join(" · ");

  return (
    <>
      <footer className="guest-footer" aria-label="Подвал сайта">
        <div className="guest-footer__content mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-12 lg:gap-8">
            <div className="lg:col-span-4">
              <p className="guest-section-lead max-w-sm">
                B2B-логистика между Москвой и Калининградом: перевозки, документы, отслеживание и калькулятор в личном
                кабинете.
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
              </ul>
              <div className="mt-3 space-y-1 text-sm text-[#6b7280]">
                {HAULZ_LEGAL.offices.map((office) => (
                  <p key={office.city}>
                    {office.city}:{" "}
                    <a href={`tel:${office.phone.replace(/[^\d+]/g, "")}`} className="text-[#2563eb] hover:underline">
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
              <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">{HAULZ_LEGAL.address}</p>
            </div>
          </div>

          <GuestLegalDisclosures />
        </div>

        <div className="guest-footer__brand">
          <div className="guest-footer__brand-inner mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
            <div className="guest-footer__brand-title">HAULZ</div>
            <div className="guest-footer__brand-subtitle">Логистика Москва ↔ Калининград</div>
            <div className="guest-footer__brand-text">
              {HAULZ_LEGAL.name} · ИНН {HAULZ_LEGAL.inn} · ОГРН {HAULZ_LEGAL.ogrn}
              <br />
              {HAULZ_LEGAL.address}
            </div>
            <div className="guest-footer__brand-text">
              <a href={`mailto:${HAULZ_EMAIL}`}>{HAULZ_EMAIL}</a>
            </div>
            <div className="guest-footer__brand-text">{phones}</div>
            <div className="guest-footer__brand-text">
              Готовы уточнить детали, согласовать дату забора и закрепить тариф.
            </div>
            <div className="guest-footer__brand-note">
              © {year} {HAULZ_LEGAL.name}. Все права защищены. Предварительный расчёт не является публичной офертой.
            </div>
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
