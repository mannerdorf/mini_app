import React, { useState } from "react";
import {
  ArrowRight,
  Calculator,
  ChevronRight,
  MapPin,
  Menu,
  Package,
  Route,
  ShieldCheck,
  Smartphone,
  Zap,
} from "lucide-react";
import {
  HAULZ_EMAIL,
  HAULZ_MAX_SUPPORT_BOT_URL,
  HAULZ_OFFICES,
  HAULZ_TG_SUPPORT_BOT_URL,
  HAULZ_WEBSITE_URL,
} from "../../constants/brand";
import { ANDROID_RELEASE_DOWNLOAD_URL } from "../../constants/androidRelease";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";
import { GuestHomeMenuSheet } from "./GuestHomeMenuSheet";

type Props = {
  onLogin: () => void;
  onAbout: () => void;
  onFaq: () => void;
  onCalculator: () => void;
};

export function GuestHomePage({ onLogin, onAbout, onFaq, onCalculator }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isNativeAndroid = isCapacitorAndroidApp();
  const previewFaq = GUEST_FAQ_ITEMS.slice(0, 2);

  return (
    <div className="guest-home">
      <header className="guest-home__header">
        <div className="guest-home__brand" aria-label="HAULZ">
          <span className="guest-home__brand-mark">HAULZ</span>
        </div>
        <div className="guest-home__header-actions">
          <button type="button" className="guest-home__login-pill" onClick={onLogin}>
            Войти
          </button>
          <button
            type="button"
            className="guest-home__menu-btn"
            aria-label="Меню"
            onClick={() => setMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="guest-home__main">
        <section className="guest-home__hero-grid" aria-label="Основные действия">
          <button type="button" className="guest-hero-card guest-hero-card--primary" onClick={onLogin}>
            <div className="guest-hero-card__content">
              <span className="guest-hero-card__eyebrow">Москва ↔ Калининград</span>
              <span className="guest-hero-card__title">Отправить груз</span>
              <span className="guest-hero-card__subtitle">B2B-перевозки с документами онлайн</span>
            </div>
            <div className="guest-hero-card__visual guest-hero-card__visual--cargo" aria-hidden="true">
              <Package className="guest-hero-card__visual-icon" strokeWidth={1.5} />
            </div>
          </button>

          <button type="button" className="guest-hero-card guest-hero-card--secondary" onClick={onAbout}>
            <div className="guest-hero-card__content">
              <span className="guest-hero-card__title guest-hero-card__title--sm">Офисы HAULZ</span>
              <span className="guest-hero-card__subtitle">{HAULZ_OFFICES.length} города · карта и телефоны</span>
            </div>
            <div className="guest-hero-card__visual guest-hero-card__visual--map" aria-hidden="true">
              <MapPin className="guest-hero-card__visual-icon" strokeWidth={1.5} />
            </div>
          </button>
        </section>

        <section className="guest-home__quick" aria-label="Быстрые действия">
          <button type="button" className="guest-quick-card" onClick={onCalculator}>
            <span className="guest-quick-card__icon guest-quick-card__icon--blue">
              <Calculator className="w-5 h-5" />
            </span>
            <span className="guest-quick-card__label">Калькулятор</span>
          </button>
          <a
            className="guest-quick-card"
            href={HAULZ_WEBSITE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="guest-quick-card__icon guest-quick-card__icon--indigo">
              <Route className="w-5 h-5" />
            </span>
            <span className="guest-quick-card__label">haulz.pro</span>
          </a>
          <a
            className="guest-quick-card"
            href={HAULZ_TG_SUPPORT_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="guest-quick-card__icon guest-quick-card__icon--green">
              <Zap className="w-5 h-5" />
            </span>
            <span className="guest-quick-card__label">Поддержка</span>
          </a>
          {!isNativeAndroid ? (
            <a
              className="guest-quick-card"
              href={ANDROID_RELEASE_DOWNLOAD_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="guest-quick-card__icon guest-quick-card__icon--dark">
                <Smartphone className="w-5 h-5" />
              </span>
              <span className="guest-quick-card__label">Приложение</span>
            </a>
          ) : null}
        </section>

        <section className="guest-home__panel" aria-label="Преимущества HAULZ">
          <h2 className="guest-home__section-title">Цифровая логистика HAULZ</h2>
          <div className="guest-benefits">
            <div className="guest-benefit">
              <ShieldCheck className="guest-benefit__icon" />
              <div>
                <div className="guest-benefit__title">ЭДО и документы</div>
                <div className="guest-benefit__text">Счета, УПД и закрывающие — в личном кабинете</div>
              </div>
            </div>
            <div className="guest-benefit">
              <Route className="guest-benefit__icon" />
              <div>
                <div className="guest-benefit__title">Отслеживание по этапам</div>
                <div className="guest-benefit__text">9 статусов перевозки, как в карточке груза</div>
              </div>
            </div>
            <div className="guest-benefit">
              <Zap className="guest-benefit__icon" />
              <div>
                <div className="guest-benefit__title">API и интеграции</div>
                <div className="guest-benefit__text">Подключение к учётным системам клиента</div>
              </div>
            </div>
          </div>
        </section>

        <section className="guest-home__panel guest-home__panel--route" aria-label="Маршрут">
          <div className="guest-route-card">
            <div className="guest-route-card__cities">
              <span>Москва</span>
              <ArrowRight className="w-4 h-4 guest-route-card__arrow" />
              <span>Калининград</span>
            </div>
            <p className="guest-route-card__text">
              Экспедирование, консолидация и сопровождение грузов между материком и регионом. Подробности на сайте компании.
            </p>
            <a className="guest-route-card__link" href={HAULZ_WEBSITE_URL} target="_blank" rel="noopener noreferrer">
              Перейти на haulz.pro
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
        </section>

        <section className="guest-home__panel" aria-label="Частые вопросы">
          <div className="guest-home__section-head">
            <h2 className="guest-home__section-title">Частые вопросы</h2>
            <button type="button" className="guest-home__section-link" onClick={onFaq}>
              Все
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="guest-faq-preview">
            {previewFaq.map((item) => (
              <button key={item.q} type="button" className="guest-faq-preview__item" onClick={onFaq}>
                <span>{item.q}</span>
                <ChevronRight className="w-4 h-4 guest-faq-preview__chev" />
              </button>
            ))}
          </div>
        </section>

        <section className="guest-home__panel guest-home__panel--contact" aria-label="Контакты">
          <h2 className="guest-home__section-title">Связаться с нами</h2>
          <div className="guest-contact-row">
            <a href={`mailto:${HAULZ_EMAIL}`} className="guest-contact-chip">
              {HAULZ_EMAIL}
            </a>
            <a href={HAULZ_TG_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="guest-contact-chip">
              Telegram
            </a>
            <a href={HAULZ_MAX_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="guest-contact-chip">
              MAX
            </a>
          </div>
        </section>
      </main>

      <div className="guest-home__login-bar" role="region" aria-label="Вход в кабинет">
        <div className="guest-home__login-bar-text">
          <span className="guest-home__login-bar-title">Войдите, чтобы смотреть перевозки</span>
          <span className="guest-home__login-bar-sub">Грузы, документы и уведомления</span>
        </div>
        <button type="button" className="guest-home__login-bar-btn" onClick={onLogin}>
          Войти
        </button>
      </div>

      <GuestHomeMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogin={onLogin}
        onAbout={onAbout}
        onFaq={onFaq}
        onCalculator={onCalculator}
      />
    </div>
  );
}
