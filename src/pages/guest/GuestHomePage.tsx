import React from "react";
import {
  ArrowRight,
  Calculator,
  ChevronRight,
  FileText,
  HelpCircle,
  Menu,
  Route,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { Badge } from "../../components/shadcn/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/shadcn/card";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";
import { cn } from "../../lib/cn";
import { GUEST_ROUTE_DIRECTIONS } from "./guestRouteContent";
import { GuestFooter } from "./GuestFooter";
import { GuestHomeMenuSheet } from "./GuestHomeMenuSheet";

type Props = {
  onLogin: () => void;
  onAbout: () => void;
  onFaq: () => void;
  onApp: () => void;
  onCalculator: () => void;
};

type QuickAction = {
  id: string;
  label: string;
  icon: typeof Calculator;
  action: "calculator" | "faq" | "app";
};

const QUICK_ACTIONS: QuickAction[] = [
  { id: "calc", label: "Калькулятор", icon: Calculator, action: "calculator" },
  { id: "faq", label: "FAQ", icon: HelpCircle, action: "faq" },
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

export function GuestHomePage({ onLogin, onAbout, onFaq, onApp, onCalculator }: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isNativeAndroid = isCapacitorAndroidApp();

  const quickActions: QuickAction[] = [
    ...QUICK_ACTIONS,
    ...(!isNativeAndroid
      ? [{ id: "app", label: "Приложение", icon: Smartphone, action: "app" as const }]
      : []),
  ];

  return (
    <div className="guest-shell guest-animate-in">
      <header className="guest-header">
        <div className="mx-auto flex max-w-guest items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <div className="flex items-center gap-3">
            <span className="guest-header__logo">HAULZ</span>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={onLogin}>
              Войти
            </Button>
            <Button variant="outline" size="icon" className="lg:hidden" aria-label="Меню" onClick={() => setMenuOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-guest px-4 pb-28 pt-5 sm:px-6 lg:px-8 lg:pb-16 lg:pt-8">
        <div className="grid gap-4 lg:grid-cols-12 lg:gap-6">
          {/* Hero — CDEK-style primary card */}
          <Card
            className="group relative cursor-pointer overflow-hidden guest-surface--soft lg:col-span-8 lg:min-h-[18rem]"
            role="button"
            tabIndex={0}
            onClick={onLogin}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onLogin();
              }
            }}
          >
            <CardHeader className="relative z-[1] max-w-xl pb-2">
              <Badge variant="secondary" className="mb-2 w-fit border-0 bg-white/90 text-[#374151]">
                B2B-логистика
              </Badge>
              <CardTitle className="text-2xl sm:text-3xl lg:text-4xl">Отправить груз</CardTitle>
              <CardDescription className="text-base sm:text-lg">
                Перевозки между Москвой и Калининградом с документами и статусами онлайн
              </CardDescription>
            </CardHeader>
            <CardContent className="relative z-[1] flex items-end justify-between gap-4 pb-6">
              <Button className="mt-2" onClick={(e) => { e.stopPropagation(); onLogin(); }}>
                Войти и оформить
                <ArrowRight className="h-4 w-4" />
              </Button>
              <img
                src={GUEST_ILLUSTRATIONS.delivery}
                alt=""
                className="pointer-events-none h-28 w-28 shrink-0 object-contain sm:h-36 sm:w-36 lg:h-44 lg:w-44"
                loading="eager"
              />
            </CardContent>
          </Card>

          {/* Secondary cards — about & warehouses */}
          <div className="grid gap-4 lg:col-span-4">
            <Card
              className="guest-surface relative cursor-pointer overflow-hidden transition-colors hover:bg-[#eff6ff]"
              role="button"
              tabIndex={0}
              onClick={onAbout}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAbout();
                }
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">О компании</CardTitle>
                <CardDescription>B2B-логистика Москва ↔ Калининград</CardDescription>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3 pt-0">
                <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onAbout(); }}>
                  Смотреть
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <img
                  src={GUEST_ILLUSTRATIONS.logistics}
                  alt=""
                  className="h-24 w-24 object-contain"
                  loading="lazy"
                />
              </CardContent>
            </Card>

            <Card
              className="guest-surface relative cursor-pointer overflow-hidden transition-colors hover:bg-[#eff6ff]"
              role="button"
              tabIndex={0}
              onClick={onAbout}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAbout();
                }
              }}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-xl">Склады HAULZ</CardTitle>
              </CardHeader>
              <CardContent className="flex items-end justify-between gap-3 pt-0">
                <Button variant="secondary" size="sm" onClick={(e) => { e.stopPropagation(); onAbout(); }}>
                  Смотреть
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <img
                  src={GUEST_ILLUSTRATIONS.location}
                  alt=""
                  className="h-24 w-24 object-contain"
                  loading="lazy"
                />
              </CardContent>
            </Card>
          </div>

          {/* Quick actions */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-12" aria-label="Быстрые действия">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  className="guest-quick-action"
                  onClick={() => {
                    if (action.action === "faq") onFaq();
                    else if (action.action === "app") onApp();
                    else onCalculator();
                  }}
                >
                  <span className="guest-quick-action__icon">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-xs font-semibold text-[#374151] sm:text-sm">{action.label}</span>
                </button>
              );
            })}
          </section>

          {/* Benefits */}
          <section className="lg:col-span-12" aria-label="Преимущества">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <p className="guest-section-title">После входа в кабинет</p>
                <h2 className="guest-section-heading sm:text-2xl">Цифровая логистика HAULZ</h2>
              </div>
              <img src={GUEST_ILLUSTRATIONS.logistics} alt="" className="hidden h-20 w-20 object-contain md:block" loading="lazy" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {BENEFITS.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="guest-surface">
                    <CardContent className="flex gap-3 p-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[0.625rem] bg-[#eff6ff] text-[#2563eb]">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold text-[#111827]">{item.title}</h3>
                        <p className="mt-1 text-sm text-[#6b7280]">{item.text}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Routes */}
          <section className="grid gap-4 md:grid-cols-2 lg:col-span-12" aria-label="Маршруты HAULZ">
            {GUEST_ROUTE_DIRECTIONS.map((route) => (
              <Card key={route.id} className="guest-surface">
                <CardHeader className="pb-3">
                  <p className="guest-section-title">Маршрут</p>
                  <div className="mb-2 flex items-center gap-2 text-base font-bold text-[#111827] sm:text-lg">
                    <span>{route.from}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#2563eb]" />
                    <span>{route.to}</span>
                  </div>
                  <CardDescription className="text-sm leading-relaxed">{route.summary}</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2 text-sm leading-relaxed text-[#6b7280]">
                    {route.features.map((feature) => (
                      <li key={feature} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2563eb]" aria-hidden />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </section>

        </div>
      </main>

      <GuestFooter
        onAbout={onAbout}
        onFaq={onFaq}
        onApp={onApp}
        onCalculator={onCalculator}
        onLogin={onLogin}
      />

      {/* Mobile / tablet sticky login bar — CDEK pattern */}
      <div
        className={cn("guest-mobile-dock lg:hidden")}
        role="region"
        aria-label="Вход в кабинет"
      >
        <div className="mx-auto flex max-w-guest items-center justify-between gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
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
        onFaq={onFaq}
        onApp={onApp}
        onCalculator={onCalculator}
      />
    </div>
  );
}
