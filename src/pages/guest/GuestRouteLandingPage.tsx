import React from "react";
import { ArrowRight, ChevronLeft } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import type { PublicRouteInfo } from "../../../lib/haulzCalculator/publicRouteCatalog";
import { publicRouteCalculatorUrl } from "../../../lib/haulzCalculator/publicRouteCatalog";
import { GuestFooter } from "./GuestFooter";

type Props = {
  footerNavigation: React.ComponentProps<typeof GuestFooter>;
  route: PublicRouteInfo;
  onBack: () => void;
  onCalculator: (direction: PublicRouteInfo["direction"]) => void;
  onOtherRoute: (path: string) => void;
  otherRouteLabel: string;
  otherRoutePath: string;
};

export function GuestRouteLandingPage({
  route,
  footerNavigation,
  onBack,
  onCalculator,
  onOtherRoute,
  otherRouteLabel,
  otherRoutePath,
}: Props) {
  return (
    <div className="guest-shell light-mode min-h-[100dvh]">
      <header className="guest-header border-b border-[#e5e7eb] bg-white">
        <div className="mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <button type="button" className="guest-header__back" onClick={onBack} aria-label="Назад">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-sm font-semibold text-[#111827]">HAULZ</span>
        </div>
      </header>

      <main className="mx-auto max-w-guest px-4 py-8 sm:px-6 lg:px-8">
        <p className="text-sm font-medium text-[#2563eb]">{route.corridorLabel}</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#111827] sm:text-4xl">{route.h1}</h1>
        <p className="mt-4 text-base leading-relaxed text-[#4b5563]">{route.summary}</p>
        <p className="mt-3 text-base leading-relaxed text-[#374151]">{route.focus}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          {route.modes.map((mode) => (
            <span key={mode} className="rounded-full bg-[#eff6ff] px-3 py-1 text-sm font-medium text-[#1d4ed8]">
              {mode}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={() => onCalculator(route.direction)}>
            Рассчитать перевозку
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button size="lg" variant="outline" onClick={() => onOtherRoute(otherRoutePath)}>
            {otherRouteLabel}
          </Button>
        </div>

        <section className="mt-10" aria-labelledby="route-stages-title">
          <h2 id="route-stages-title" className="text-xl font-semibold text-[#111827]">
            Этапы перевозки {route.from} — {route.to}
          </h2>
          <ol className="mt-4 space-y-4">
            {route.stages.map((stage, index) => (
              <li key={stage.id} className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#6b7280]">
                  {String(index + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-1 text-lg font-semibold text-[#111827]">{stage.title}</h3>
                <p className="mt-1 text-sm text-[#4b5563]">{stage.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="route-features-title">
          <h2 id="route-features-title" className="text-xl font-semibold text-[#111827]">
            Что входит в сервис
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 text-[#374151]">
            {route.features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="route-faq-title">
          <h2 id="route-faq-title" className="text-xl font-semibold text-[#111827]">
            Частые вопросы
          </h2>
          <dl className="mt-4 space-y-4">
            {route.faq.map((item) => (
              <div key={item.q} className="rounded-2xl border border-[#e5e7eb] bg-[#f9fafb] p-4">
                <dt className="font-semibold text-[#111827]">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-[#4b5563]">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        <p className="mt-8 text-sm text-[#6b7280]">
          Точный расчёт с адресами забора и доставки — в{" "}
          <a href={publicRouteCalculatorUrl(route.direction)} className="font-medium text-[#2563eb] underline">
            калькуляторе HAULZ
          </a>
          .
        </p>
      </main>

      <GuestFooter {...footerNavigation} />
    </div>
  );
}
