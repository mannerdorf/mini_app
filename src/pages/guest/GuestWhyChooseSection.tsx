import React from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/cn";
import { GUEST_WHY_CHOOSE_ITEMS } from "./guestWhyChooseContent";

type Props = {
  onCalculator?: () => void;
};

export function GuestWhyChooseSection({ onCalculator }: Props) {
  const [activeId, setActiveId] = React.useState(GUEST_WHY_CHOOSE_ITEMS[0].id);
  const active =
    GUEST_WHY_CHOOSE_ITEMS.find((item) => item.id === activeId) ?? GUEST_WHY_CHOOSE_ITEMS[0];
  const activeIndex = GUEST_WHY_CHOOSE_ITEMS.findIndex((item) => item.id === active.id);

  return (
    <section className="guest-home-why" aria-label="Почему стоит выбрать HAULZ">
      <div className="guest-why">
        <div className="guest-why__intro">
          <p className="guest-section-title">Почему HAULZ</p>
          <h2 className="guest-section-heading sm:text-3xl">Логистика без лишней суеты</h2>
          <p className="guest-section-lead guest-why__lead">
            Прозрачные статусы, аккуратные документы и маршрут, в котором груз не теряется между складами и перепиской.
          </p>
        </div>

        <div className="guest-why__board">
          <div className="guest-why__rail" aria-hidden>
            <div className="guest-why__rail-line" />
            {GUEST_WHY_CHOOSE_ITEMS.map((item, index) => (
              <button
                key={`dot-${item.id}`}
                type="button"
                className={cn("guest-why__dot", index === activeIndex && "is-active")}
                aria-label={item.title}
                onClick={() => setActiveId(item.id)}
              >
                <span>{index + 1}</span>
              </button>
            ))}
            <span
              className="guest-why__pulse"
              style={{ ["--why-pulse-step" as string]: String(activeIndex) }}
            />
          </div>

          <div className="guest-why__body">
            <div className="guest-why__list" role="tablist" aria-label="Преимущества HAULZ">
              {GUEST_WHY_CHOOSE_ITEMS.map((item, index) => {
                const selected = item.id === active.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    className={cn("guest-why__item", selected && "is-active")}
                    onClick={() => setActiveId(item.id)}
                  >
                    <span className="guest-why__item-index">{String(index + 1).padStart(2, "0")}</span>
                    <span className="guest-why__item-copy">
                      <span className="guest-why__item-title">{item.title}</span>
                      <span className="guest-why__item-accent">{item.accent}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div key={active.id} className="guest-why__panel guest-why__panel--anim" role="tabpanel">
              <div className="guest-why__panel-head">
                <span className="guest-why__panel-icon" aria-hidden>
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div>
                  <p className="guest-why__panel-eyebrow">{active.accent}</p>
                  <h3 className="guest-why__panel-title">{active.title}</h3>
                </div>
              </div>
              <p className="guest-why__panel-text">{active.detail}</p>
              <p className="guest-why__panel-summary">{active.text}</p>
              {onCalculator ? (
                <button type="button" className="guest-why__cta" onClick={onCalculator}>
                  Рассчитать перевозку
                  <ArrowRight className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
