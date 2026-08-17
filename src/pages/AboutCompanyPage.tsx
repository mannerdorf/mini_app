import React from "react";
import { ArrowLeft, FileCheck2, Network, Route, ShieldCheck } from "lucide-react";
import { Button } from "../components/shadcn/button";
import { HaulzWarehousePanel } from "../components/haulz/HaulzWarehousePanel";
import { HAULZ_WEBSITE_URL } from "../constants/brand";
import { GUEST_ILLUSTRATIONS } from "../constants/guestIllustrations";
import { GuestPageHero } from "./guest/GuestPageHero";
import { GUEST_WAREHOUSE_ITEMS } from "./guest/guestWarehouseContent";

type Props = {
  onBack: () => void;
  /** Подпись email в UI (без домена в гостевой зоне). */
  emailLabel?: string;
  showWarehouses?: boolean;
};

const ADVANTAGES = [
  {
    icon: Route,
    title: "Специализация на направлении",
    text: "Выстроенная логистика между Москвой и Калининградом для сборных и комплектных грузов.",
  },
  {
    icon: ShieldCheck,
    title: "Контроль на каждом этапе",
    text: "От забора и складской обработки до магистральной перевозки и вручения получателю.",
  },
  {
    icon: FileCheck2,
    title: "Документы без задержек",
    text: "Счета, УПД и закрывающие документы доступны в цифровом виде и собраны в одном месте.",
  },
  {
    icon: Network,
    title: "Интеграция с бизнесом",
    text: "API и электронный документооборот помогают встроить перевозки во внутренние процессы компании.",
  },
] as const;

const APPROACH_STEPS = [
  "Рассчитываем перевозку и согласовываем условия",
  "Организуем забор, обработку и магистральную доставку",
  "Показываем актуальные статусы движения груза",
  "Формируем финансовые и закрывающие документы",
] as const;

export function AboutCompanyPage({ onBack, emailLabel, showWarehouses = true }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <div className="guest-page-back mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="whitespace-nowrap text-sm font-semibold text-[#374151]">О компании</span>
      </div>

      <GuestPageHero
        title="Соединяем бизнес Москвы и Калининграда"
        lead="Берём на себя всю цепочку перевозки — от первого расчёта и забора груза до доставки, контроля статусов и закрывающих документов."
        imageSrc={GUEST_ILLUSTRATIONS.aboutVisual}
        imageAlt="Складской и портовый коридор HAULZ"
      />

      <main className="mx-auto max-w-guest px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        <section className="py-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Что мы делаем</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              Логистика как часть вашего бизнеса
            </h2>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#6b7280] sm:text-base">
              HAULZ объединяет транспорт, складские операции, сопровождение и электронные документы в один управляемый
              процесс — чтобы команда клиента тратила меньше времени на координацию.
            </p>
          </div>

          <div className="guest-advantage-list">
            {ADVANTAGES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="guest-advantage-row">
                <span className="guest-advantage-row__icon">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-[1.75rem] bg-[#dbeafe] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d4ed8]">Наш подход</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
                Один партнёр на всём пути груза
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#4b5563]">
                От расчёта до закрывающих документов — всё в одном контуре HAULZ.
              </p>
            </div>
            <ol className="grid gap-3">
              {APPROACH_STEPS.map((step, index) => (
                <li key={step} className="flex items-start gap-4 rounded-2xl bg-white/80 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="pt-1 text-sm font-medium leading-relaxed text-[#1f2937] sm:text-base">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {showWarehouses ? (
          <section className="mb-6">
            <div className="mb-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Инфраструктура</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">Склады HAULZ</h2>
            </div>
            <div className="flex flex-col gap-6">
              {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
                <HaulzWarehousePanel
                  key={warehouse.city}
                  {...warehouse}
                  emailLabel={emailLabel}
                  websiteUrl={HAULZ_WEBSITE_URL}
                />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
