import React from "react";
import {
  ArrowLeft,
  Building2,
  Calculator,
  ChevronDown,
  MessageCircle,
  PackagePlus,
  Route,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";
import { GuestPageHero } from "./GuestPageHero";

type Props = {
  onBack: () => void;
};

export function GuestFaqPage({ onBack }: Props) {
  const icons = [PackagePlus, Route, Building2, Calculator] as const;

  return (
    <div className="guest-shell min-h-[100dvh]">
      <div className="guest-page-back mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-[#374151]">Вопросы и ответы</span>
      </div>

      <GuestPageHero
        title="Всё, что вы хотели спросить о перевозке"
        lead="Коротко отвечаем на частые вопросы. Потому что груз может быть сложным, а объяснение — нет."
        imageSrc={GUEST_ILLUSTRATIONS.faqVisual}
        imageAlt="Поддержка и ответы HAULZ"
      />

      <main className="mx-auto max-w-guest px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        <section className="py-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Частые вопросы</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              Ответы без лишних слов
            </h2>
          </div>

          <div className="grid gap-3">
            {GUEST_FAQ_ITEMS.map((item, index) => {
              const Icon = icons[index] ?? PackagePlus;
              return (
                <details
                  key={item.q}
                  className="guest-faq-item group rounded-2xl bg-white"
                  open={index === 0}
                >
                  <summary className="flex cursor-pointer list-none items-center gap-4 px-5 py-5 sm:px-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="flex-1 text-base font-bold leading-snug text-[#111827] sm:text-lg">{item.q}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 text-[#9ca3af] transition-transform duration-200 group-open:rotate-180" />
                  </summary>
                  <div className="px-5 pb-5 pl-[5.25rem] sm:px-6 sm:pb-6 sm:pl-[5.75rem]">
                    <p className="max-w-3xl text-sm leading-relaxed text-[#6b7280] sm:text-base">{item.a}</p>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        <section className="mb-6 rounded-[1.75rem] bg-[#dbeafe] p-6 sm:p-10">
          <div className="grid gap-6 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white">
              <MessageCircle className="h-6 w-6" />
            </span>
            <div>
              <p className="text-lg font-bold text-[#111827]">Не нашли свой вопрос?</p>
              <p className="mt-1 text-sm leading-relaxed text-[#4b5563]">
                Ничего страшного — логистика любит индивидуальный подход. Напишите в чате поддержки.
              </p>
            </div>
            <button
              type="button"
              onClick={onBack}
              className="rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white hover:bg-[#1d4ed8] sm:justify-self-end"
            >
              Вернуться на главную
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
