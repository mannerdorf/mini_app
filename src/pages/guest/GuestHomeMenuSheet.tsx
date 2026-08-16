import React, { useEffect } from "react";
import { X, ExternalLink, Smartphone, Building2, HelpCircle, MessageCircle, Calculator } from "lucide-react";
import {
  HAULZ_EMAIL,
  HAULZ_MAX_SUPPORT_BOT_URL,
  HAULZ_TG_SUPPORT_BOT_URL,
  HAULZ_WEBSITE_URL,
} from "../../constants/brand";
import { ANDROID_RELEASE_DOWNLOAD_URL } from "../../constants/androidRelease";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";

type Props = {
  open: boolean;
  onClose: () => void;
  onLogin: () => void;
  onAbout: () => void;
  onFaq: () => void;
  onCalculator: () => void;
};

export function GuestHomeMenuSheet({ open, onClose, onLogin, onAbout, onFaq, onCalculator }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const isNativeAndroid = isCapacitorAndroidApp();

  const items: Array<{
    id: string;
    label: string;
    hint?: string;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    {
      id: "login",
      label: "Войти в кабинет",
      hint: "Грузы, документы, калькулятор",
      icon: <Building2 className="guest-menu-sheet__icon" />,
      onClick: () => {
        onClose();
        onLogin();
      },
    },
    {
      id: "calc",
      label: "Рассчитать перевозку",
      hint: "Ориентировочная стоимость",
      icon: <Calculator className="guest-menu-sheet__icon" />,
      onClick: () => {
        onClose();
        onCalculator();
      },
    },
    {
      id: "about",
      label: "О компании",
      icon: <Building2 className="guest-menu-sheet__icon" />,
      onClick: () => {
        onClose();
        onAbout();
      },
    },
    {
      id: "faq",
      label: "Вопросы и ответы",
      icon: <HelpCircle className="guest-menu-sheet__icon" />,
      onClick: () => {
        onClose();
        onFaq();
      },
    },
    {
      id: "site",
      label: "Сайт haulz.pro",
      hint: "Услуги и контакты",
      icon: <ExternalLink className="guest-menu-sheet__icon" />,
      onClick: () => {
        window.open(HAULZ_WEBSITE_URL, "_blank", "noopener,noreferrer");
        onClose();
      },
    },
    {
      id: "support",
      label: "Поддержка",
      hint: HAULZ_EMAIL,
      icon: <MessageCircle className="guest-menu-sheet__icon" />,
      onClick: () => {
        window.open(HAULZ_TG_SUPPORT_BOT_URL, "_blank", "noopener,noreferrer");
        onClose();
      },
    },
  ];

  if (!isNativeAndroid) {
    items.push({
      id: "apk",
      label: "Скачать приложение",
      hint: "Android APK",
      icon: <Smartphone className="guest-menu-sheet__icon" />,
      onClick: () => {
        window.open(ANDROID_RELEASE_DOWNLOAD_URL, "_blank", "noopener,noreferrer");
        onClose();
      },
    });
  }

  return (
    <div className="guest-menu-sheet" role="dialog" aria-modal="true" aria-label="Меню">
      <button type="button" className="guest-menu-sheet__backdrop" aria-label="Закрыть" onClick={onClose} />
      <div className="guest-menu-sheet__panel">
        <div className="guest-menu-sheet__header">
          <span className="guest-menu-sheet__title">Меню</span>
          <button type="button" className="guest-menu-sheet__close" aria-label="Закрыть" onClick={onClose}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="guest-menu-sheet__list">
          {items.map((item) => (
            <button key={item.id} type="button" className="guest-menu-sheet__item" onClick={item.onClick}>
              <span className="guest-menu-sheet__item-icon">{item.icon}</span>
              <span className="guest-menu-sheet__item-text">
                <span className="guest-menu-sheet__item-label">{item.label}</span>
                {item.hint ? <span className="guest-menu-sheet__item-hint">{item.hint}</span> : null}
              </span>
            </button>
          ))}
        </div>
        <div className="guest-menu-sheet__footer">
          <a href={`mailto:${HAULZ_EMAIL}`} className="guest-menu-sheet__footer-link">
            {HAULZ_EMAIL}
          </a>
          <span className="guest-menu-sheet__footer-sep">·</span>
          <a href={HAULZ_MAX_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="guest-menu-sheet__footer-link">
            MAX
          </a>
          <span className="guest-menu-sheet__footer-sep">·</span>
          <a href={HAULZ_TG_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer" className="guest-menu-sheet__footer-link">
            Telegram
          </a>
        </div>
      </div>
    </div>
  );
}
