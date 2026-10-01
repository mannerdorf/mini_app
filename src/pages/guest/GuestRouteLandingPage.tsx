import { GuestLink } from "./GuestLink";
import { GuestPilotBody } from "./GuestPilotBody";
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
          <Button size="lg" asChild><GuestLink href={publicRouteCalculatorUrl(route.direction)} onNavigate={() => onCalculator(route.direction)}>
            Рассчитать перевозку
            <ArrowRight className="h-4 w-4" />
          </GuestLink></Button>
          <Button size="lg" variant="outline" asChild><GuestLink href={otherRoutePath} onNavigate={() => onOtherRoute(otherRoutePath)}>
            {otherRouteLabel}
          </GuestLink></Button>
        </div>

        <GuestPilotBody path={route.path} />

        <p className="mt-8 text-sm text-[#6b7280]">
          Предварительный расчёт с адресами забора и доставки — в{" "}
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
