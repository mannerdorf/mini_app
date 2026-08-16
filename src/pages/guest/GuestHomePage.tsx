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
  Zap,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { Badge } from "../../components/shadcn/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/shadcn/card";
import {
  HAULZ_EMAIL,
  HAULZ_MAX_SUPPORT_BOT_URL,
  HAULZ_OFFICES,
  HAULZ_TG_SUPPORT_BOT_URL,
} from "../../constants/brand";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { ANDROID_RELEASE_DOWNLOAD_URL } from "../../constants/androidRelease";
import { isCapacitorAndroidApp } from "../../lib/androidAppUpdate";
import { cn } from "../../lib/cn";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";
import { GuestHomeMenuSheet } from "./GuestHomeMenuSheet";

type Props = {
  onLogin: () => void;
  onAbout: () => void;
  onFaq: () => void;
  onCalculator: () => void;
};

const QUICK_ACTIONS: Array<
  | { id: string; label: string; icon: typeof Calculator; href: string }
  | { id: string; label: string; icon: typeof Calculator; action: "calculator" | "faq" }
> = [
  { id: "calc", label: "Калькулятор", icon: Calculator, action: "calculator" },
  { id: "faq", label: "FAQ", icon: HelpCircle, action: "faq" },
  { id: "support", label: "Поддержка", icon: Zap, href: HAULZ_TG_SUPPORT_BOT_URL },
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

export function GuestHomePage({ onLogin, onAbout, onFaq, onCalculator }: Props) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const isNativeAndroid = isCapacitorAndroidApp();
  const previewFaq = GUEST_FAQ_ITEMS.slice(0, 3);

  const quickActions = [
    ...QUICK_ACTIONS,
    ...(!isNativeAndroid
      ? [{ id: "app", label: "Приложение", icon: Smartphone, href: ANDROID_RELEASE_DOWNLOAD_URL }]
      : []),
  ];

  return (
    <div className="guest-shell guest-animate-in">
      <header className="sticky top-0 z-30 border-b border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-background)/0.85)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-guest items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8 lg:py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex min-w-[4.75rem] items-center justify-center rounded-xl bg-haulz-brand px-3 py-1.5 text-sm font-bold tracking-[0.12em] text-white">
              HAULZ
            </span>
            <span className="hidden text-sm text-[hsl(var(--guest-muted-foreground))] md:inline">
              Москва ↔ Калининград
            </span>
          </div>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Навигация">
            <Button variant="ghost" size="sm" onClick={onAbout}>
              Офисы
            </Button>
            <Button variant="ghost" size="sm" onClick={onFaq}>
              FAQ
            </Button>
          </nav>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={onLogin}>
              Войти
            </Button>
            <Button size="sm" className="hidden lg:inline-flex" onClick={onLogin}>
              Личный кабинет
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
            className="group relative cursor-pointer overflow-hidden border-0 bg-gradient-to-br from-white to-haulz-brand-soft lg:col-span-8 lg:min-h-[18rem]"
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
              <Badge variant="secondary" className="mb-2 w-fit bg-white/80">
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

          {/* Secondary card — offices */}
          <div className="grid gap-4 lg:col-span-4 lg:grid-rows-[1fr_auto]">
            <Card
              className="relative cursor-pointer overflow-hidden border-0 bg-white transition hover:shadow-guest-lg"
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
                <CardTitle className="text-xl">Офисы HAULZ</CardTitle>
                <CardDescription>
                  {HAULZ_OFFICES.length} города · адреса, телефоны и карта
                </CardDescription>
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

            <Card className="hidden border-haulz-brand/15 bg-haulz-brand-soft/40 lg:block">
              <CardContent className="flex flex-col gap-3 p-5">
                <p className="text-sm font-semibold">Уже есть аккаунт?</p>
                <p className="text-sm text-[hsl(var(--guest-muted-foreground))]">
                  Войдите, чтобы отслеживать перевозки, документы и push-уведомления.
                </p>
                <Button onClick={onLogin}>Войти в кабинет</Button>
              </CardContent>
            </Card>
          </div>

          {/* Quick actions */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-12" aria-label="Быстрые действия">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const content = (
                <>
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-haulz-brand text-white">
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-center text-xs font-semibold sm:text-sm">{action.label}</span>
                </>
              );
              if ("href" in action && action.href) {
                return (
                  <a
                    key={action.id}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex flex-col items-center gap-2 rounded-guest border border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-card))] p-4 shadow-guest transition hover:-translate-y-0.5 hover:shadow-guest-lg"
                  >
                    {content}
                  </a>
                );
              }
              return (
                <button
                  key={action.id}
                  type="button"
                  className="flex flex-col items-center gap-2 rounded-guest border border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-card))] p-4 shadow-guest transition hover:-translate-y-0.5 hover:shadow-guest-lg"
                  onClick={action.action === "faq" ? onFaq : onCalculator}
                >
                  {content}
                </button>
              );
            })}
          </section>

          {/* Benefits */}
          <section className="lg:col-span-12" aria-label="Преимущества">
            <div className="mb-4 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Цифровая логистика HAULZ</h2>
                <p className="mt-1 text-sm text-[hsl(var(--guest-muted-foreground))]">
                  То, что клиенты получают после входа в кабинет
                </p>
              </div>
              <img src={GUEST_ILLUSTRATIONS.logistics} alt="" className="hidden h-20 w-20 object-contain md:block" loading="lazy" />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {BENEFITS.map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="border-[hsl(var(--guest-border))] shadow-none">
                    <CardContent className="flex gap-3 p-5">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-haulz-brand-soft text-haulz-brand">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-semibold">{item.title}</h3>
                        <p className="mt-1 text-sm text-[hsl(var(--guest-muted-foreground))]">{item.text}</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          {/* Route + FAQ */}
          <Card className="lg:col-span-5">
            <CardHeader>
              <CardTitle>Маршрут Москва ↔ Калининград</CardTitle>
              <CardDescription>
                Экспедирование, консолидация и сопровождение грузов между материком и регионом.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-2 text-lg font-bold">
                <span>Москва</span>
                <ArrowRight className="h-4 w-4 text-[hsl(var(--guest-muted-foreground))]" />
                <span>Калининград</span>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle>Частые вопросы</CardTitle>
                <CardDescription>Коротко о перевозках, входе и поддержке</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={onFaq}>
                Все
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {previewFaq.map((item) => (
                <button
                  key={item.q}
                  type="button"
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-[hsl(var(--guest-muted))] px-4 py-3 text-left text-sm font-medium transition hover:bg-haulz-brand-soft"
                  onClick={onFaq}
                >
                  <span>{item.q}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[hsl(var(--guest-muted-foreground))]" />
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Contacts */}
          <section className="rounded-guest border border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-card))] p-5 lg:col-span-12">
            <h2 className="text-lg font-bold">Связаться с нами</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" asChild>
                <a href={`mailto:${HAULZ_EMAIL}`}>{HAULZ_EMAIL}</a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={HAULZ_TG_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer">
                  Telegram
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={HAULZ_MAX_SUPPORT_BOT_URL} target="_blank" rel="noopener noreferrer">
                  MAX
                </a>
              </Button>
            </div>
          </section>
        </div>
      </main>

      {/* Mobile / tablet sticky login bar — CDEK pattern */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--guest-border))] bg-[hsl(var(--guest-card)/0.92)] backdrop-blur-xl lg:hidden",
        )}
        role="region"
        aria-label="Вход в кабинет"
      >
        <div className="mx-auto flex max-w-guest items-center justify-between gap-3 px-4 py-3 sm:px-6" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Войдите, чтобы смотреть перевозки</p>
            <p className="truncate text-xs text-[hsl(var(--guest-muted-foreground))]">Грузы, документы и уведомления</p>
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
        onCalculator={onCalculator}
      />
    </div>
  );
}
