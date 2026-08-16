import React from "react";
import { ArrowLeft } from "lucide-react";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";

type Props = {
  onBack: () => void;
};

export function GuestFaqPage({ onBack }: Props) {
  return (
    <div className="guest-subpage">
      <header className="guest-subpage__header">
        <button type="button" className="guest-subpage__back" aria-label="Назад" onClick={onBack}>
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="guest-subpage__title">Вопросы и ответы</h1>
      </header>
      <div className="guest-subpage__body">
        <p className="guest-subpage__lead">
          Ответы о перевозках HAULZ, входе в кабинет и поддержке. Подробнее — на{" "}
          <a href="https://haulz.pro" target="_blank" rel="noopener noreferrer">
            haulz.pro
          </a>
          .
        </p>
        <div className="guest-faq-list">
          {GUEST_FAQ_ITEMS.map((item) => (
            <article key={item.q} className="guest-faq-card">
              <h2 className="guest-faq-card__q">{item.q}</h2>
              <p className="guest-faq-card__a">{item.a}</p>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
