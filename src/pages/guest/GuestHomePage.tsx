import React from "react";
import {
  ArrowRight,
  ChevronRight,
  FileText,
  Menu,
  Route,
  ShieldCheck,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";
import { cn } from "../../lib/cn";
import { GUEST_WHY_CHOOSE_ITEMS } from "./guestWhyChooseContent";
import { GUEST_PARTNERS } from "./guestPartnersContent";
import { GuestFooter } from "./GuestFooter";
import { GuestHomeMenuSheet } from "./GuestHomeMenuSheet";
import { GuestRoutesSection } from "./GuestRoutesSection";

type Props = {
  onLogin: () => void;
  onAbout: () => void;
  onWarehouses: () => void;
  onFaq: () => void;
  onApp: () => void;
  onCalculator: () => void;
};

type QuickAction = {
  id: string;
  label: string;
  hint: string;
  image: string;
  action: "calculator" | "faq" | "app" | "about" | "warehouses";
};

const QUICK_ACTIONS_BASE: QuickAction[] = [
  {
    id: "calc",
    label: "Калькулятор",
    hint: "Предварительный расчёт",
    image: GUEST_ILLUSTRATIONS.iconCalculator,
    action: "calculator",
  },
  {
    id: "faq",
    label: "FAQ",
    hint: "Короткие ответы",
    image: GUEST_ILLUSTRATIONS.iconFaq,
    action: "faq",
  },
  {
    id: "about",
    label: "О компании",
    hint: "Кто такой HAULZ",
    image: GUEST_ILLUSTRATIONS.iconAbout,
    action: "about",
  },
  {
    id: "warehouses",
    label: "Склады",
    hint: "Москва и Калининград",
    image: GUEST_ILLUSTRATIONS.iconWarehouse,
    action: "warehouses",
  },
];

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: "ЭДО и документы",
    text: "Счета, УПД и закрывающие — в личном кабинете",
  },
  {
    icon: Route,
    title: "9 этапов отслеживания",
    text: "Статусы перевозки совпадают с карточкой груза",
  },
  {
    icon: FileText,
    title: "API и интеграции",
    text: "Подключение к учётным системам клиента",
  },
] as const;

export function GuestHomePage({ onLogin, onAbout, onWarehouses, onFaq, onApp, onCalculator }: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isNativeAndroid = isCapacitorAndroidApp();

  const quickActions: QuickAction[] = [
    ...QUICK_ACTIONS_BASE,
    ...(!isNativeAndroid
      ? [
          {
            id: "app",
            label: "Приложение",
            hint: "Android и iPhone",
            image: GUEST_ILLUSTRATIONS.iconApp,
            action: "app" as const,
          },
        ]
      : []),
  ];

  const runQuickAction = (action: QuickAction["action"]) => {
    if (action === "faq") onFaq();
    else if (action === "app") onApp();
    else if (action === "about") onAbout();
    else if (action === "warehouses") onWarehouses();
    else onCalculator();
  };

  return (
    <div className="guest-shell">
      <header className="guest-header guest-header--overlay">
        <div className="mx-auto flex max-w-guest items-center justify-end gap-4 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="hidden border-white/30 bg-white/10 text-white hover:bg-white/20 sm:inline-flex"
              onClick={onLogin}
            >
              Войти
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="border-white/30 bg-white/10 text-white hover:bg-white/20 lg:hidden"
              aria-label="Меню"
              onClick={() => setMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <section className="guest-home-hero" aria-label="HAULZ">
        <img
          src={GUEST_ILLUSTRATIONS.hero}
          alt=""
          className="guest-home-hero__media"
          loading="eager"
        />
        <div className="guest-home-hero__veil" aria-hidden />
        <div className="guest-home-hero__content mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
          <h1 className="guest-home-hero__title guest-reveal guest-reveal--1">
            Отправить груз между Москвой и Калининградом
          </h1>
          <p className="guest-home-hero__lead guest-reveal guest-reveal--2">
            B2B-логистика с расчётом, статусами и документами онлайн.
          </p>
          <div className="guest-home-hero__actions guest-reveal guest-reveal--3">
            <Button size="lg" onClick={onLogin}>
              Войти и оформить
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-white/40 bg-white/10 text-white hover:bg-white/20"
              onClick={onCalculator}
            >
              Рассчитать доставку
            </Button>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-guest px-4 pb-28 pt-8 sm:px-6 lg:px-8 lg:pb-16">
        <section className="guest-home-actions" aria-label="Быстрые действия">
          {quickActions.map((action, index) => (
            <button
              key={action.id}
              type="button"
              className={cn("guest-home-action guest-reveal", `guest-reveal--${Math.min(index + 1, 5)}`)}
              onClick={() => runQuickAction(action.action)}
            >
              <span className="guest-home-action__visual">
                <img src={action.image} alt="" loading="lazy" />
              </span>
              <span className="guest-home-action__copy">
                <span className="guest-home-action__label">{action.label}</span>
                <span className="guest-home-action__hint">{action.hint}</span>
              </span>
              <ChevronRight className="guest-home-action__chevron h-4 w-4" />
            </button>
          ))}
        </section>

        <section className="guest-home-why" aria-label="Почему стоит выбрать HAULZ">
          <div className="guest-home-why__intro">
            <p className="guest-section-title">Почему HAULZ</p>
            <h2 className="guest-section-heading sm:text-3xl">Логистика без лишней суеты</h2>
            <p className="guest-section-lead max-w-2xl">
              Прозрачные статусы, аккуратные документы и маршрут, в котором груз не теряется между складами и перепиской.
            </p>
          </div>
          <div className="guest-why-choose__grid">
            {GUEST_WHY_CHOOSE_ITEMS.map((item, index) => (
              <article key={item.title} className="guest-why-choose__item guest-lift">
                <span className="guest-why-choose__num" aria-hidden>
                  {index + 1}
                </span>
                <div>
                  <h3 className="guest-why-choose__item-title">{item.title}</h3>
                  <p className="guest-why-choose__item-text">{item.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="guest-home-partners" aria-label="Наши партнеры">
          <h2 className="guest-home-partners__title">Наши партнеры</h2>
          <div className="guest-home-partners__grid">
            {GUEST_PARTNERS.map((partner) => (
              <div key={partner.id} className="guest-home-partners__item guest-lift">
                <img src={partner.logo} alt={partner.name} loading="lazy" />
              </div>
            ))}
          </div>
        </section>

        <section className="guest-home-benefits" aria-label="Для партнеров доступно">
          <div
            className="guest-home-benefits__panel"
            style={{ backgroundImage: `url(${GUEST_ILLUSTRATIONS.atmosphere})` }}
          >
            <div className="guest-home-benefits__veil" aria-hidden />
            <div className="guest-home-benefits__content">
              <p className="guest-home-benefits__eyebrow">Для партнеров доступно</p>
              <h2 className="guest-home-benefits__title">Цифровая логистика HAULZ</h2>
              <p className="guest-home-benefits__lead">
                Кабинет собирает перевозки, документы и уведомления в одном спокойном рабочем пространстве.
              </p>
              <div className="guest-home-benefits__grid">
                {BENEFITS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <article key={item.title} className="guest-home-benefits__card">
                      <span className="guest-home-benefits__icon">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        <GuestRoutesSection onCalculator={onCalculator} />
      </main>

      <GuestFooter
        onAbout={onAbout}
        onWarehouses={onWarehouses}
        onFaq={onFaq}
        onApp={onApp}
        onCalculator={onCalculator}
        onLogin={onLogin}
      />

      <div className={cn("guest-mobile-dock lg:hidden")} role="region" aria-label="Вход в кабинет">
        <div
          className="mx-auto flex max-w-guest items-center justify-between gap-3 px-4 py-3 sm:px-6"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#111827]">Войдите, чтобы смотреть перевозки</p>
            <p className="truncate text-xs text-[#6b7280]">Грузы, документы и уведомления</p>
          </div>
          <Button variant="dark" size="sm" onClick={onLogin}>
            Войти
          </Button>
        </div>
      </div>

      <GuestHomeMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onLogin={onLogin}
        onAbout={onAbout}
        onWarehouses={onWarehouses}
        onFaq={onFaq}
        onApp={onApp}
        onCalculator={onCalculator}
      />
    </div>
  );
}
