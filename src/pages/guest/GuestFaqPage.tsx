import React from "react";
import { ArrowLeft, Building2, Calculator, ChevronDown, PackagePlus, Route } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GUEST_FAQ_ITEMS } from "./guestFaqContent";

type Props = {
  onBack: () => void;
};

export function GuestFaqPage({ onBack }: Props) {
  const icons = [PackagePlus, Route, Building2, Calculator] as const;

  return (
    <div className="guest-shell min-h-[100dvh]">
      <main className="mx-auto max-w-guest px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-[#374151]">Вопросы и ответы</span>
        </div>

        <section className="overflow-hidden rounded-[1.75rem] bg-[#dbeafe]">
          <div className="grid items-center gap-7 px-6 py-9 sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:px-14">
            <div>
              <h1 className="mt-0 max-w-3xl text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-[#111827] sm:text-5xl">
                Всё, что вы хотели спросить о перевозке
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-[#4b5563] sm:text-lg">
                Коротко отвечаем на частые вопросы. Потому что груз может быть сложным, а объяснение — нет.
              </p>
            </div>
            <img
              src="/faq-support.svg"
              alt=""
              className="hidden h-32 w-32 rotate-[-3deg] rounded-3xl sm:block lg:h-40 lg:w-40"
            />
          </div>
        </section>

        <section className="py-6">
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

        <section className="mb-6 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[#1e3a8a] px-6 py-6 text-white sm:flex-row sm:items-center sm:px-8">
          <div>
            <p className="text-base font-bold">Не нашли свой вопрос?</p>
            <p className="mt-1 text-sm text-blue-100">
              Ничего страшного — логистика любит индивидуальный подход. Напишите в чате поддержки.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-[#1e3a8a]"
          >
            Вернуться на главную
          </button>
        </section>
      </main>
    </div>
  );
}
