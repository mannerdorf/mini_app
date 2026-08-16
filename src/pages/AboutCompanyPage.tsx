import React from "react";
import { ArrowLeft, Check, FileCheck2, Network, Route, ShieldCheck } from "lucide-react";
import { Button } from "../components/shadcn/button";
import { HaulzWarehousePanel } from "../components/haulz/HaulzWarehousePanel";
import { HAULZ_WEBSITE_URL } from "../constants/brand";
import { GUEST_ILLUSTRATIONS } from "../constants/guestIllustrations";
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
      <main className="mx-auto max-w-guest px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="whitespace-nowrap text-sm font-semibold text-[#374151]">О компании</span>
        </div>

        <section className="guest-app-hero overflow-hidden rounded-[1.75rem]">
          <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">HAULZ · B2B-логистика</p>
              <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl">
                Соединяем бизнес Москвы и Калининграда
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">
                Берём на себя всю цепочку перевозки — от первого расчёта и забора груза до доставки, контроля статусов и
                закрывающих документов.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Сборные и комплектные грузы", "Цифровые документы", "Прозрачные статусы"].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Check className="h-4 w-4 text-blue-200" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="guest-about-visual mx-auto w-full max-w-md">
              <img
                src={GUEST_ILLUSTRATIONS.aboutVisual}
                alt="Складской и портовый коридор HAULZ"
                className="guest-about-visual__img aspect-[4/5] w-full object-cover sm:aspect-square"
                loading="eager"
              />
            </div>
          </div>
        </section>

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

          <div className="grid gap-4 md:grid-cols-2">
            {ADVANTAGES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-[1.5rem] bg-white p-6 sm:p-8">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                  <Icon className="h-6 w-6" />
                </span>
                <h3 className="mt-6 text-xl font-bold text-[#111827]">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{text}</p>
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
