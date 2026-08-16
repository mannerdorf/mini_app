import React from "react";
import {
  ArrowLeft,
  Check,
  Clock3,
  Download,
  ExternalLink,
  Share2,
  ShieldCheck,
  Smartphone,
  Store,
} from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { ANDROID_RELEASE_DOWNLOAD_URL, ANDROID_RELEASE_ORIGIN } from "../../constants/androidRelease";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { DEFAULT_APP_URL } from "../../../lib/haulzDomains";

type Props = {
  onBack: () => void;
};

const IOS_STEPS = [
  "Откройте сайт HAULZ в браузере Safari (не во встроенном браузере мессенджеров).",
  "Нажмите кнопку «Поделиться» — квадрат со стрелкой вверх внизу экрана.",
  "Выберите пункт «На экран «Домой»».",
  "Подтвердите добавление — иконка HAULZ появится на рабочем столе iPhone или iPad.",
] as const;

export function GuestAppDownloadPage({ onBack }: Props) {
  const appUrl = DEFAULT_APP_URL;

  return (
    <div className="guest-shell min-h-[100dvh]">
      <main className="mx-auto max-w-guest px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-[#374151]">Приложение HAULZ</span>
        </div>

        <section className="guest-app-hero overflow-hidden rounded-[1.75rem]">
          <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">HAULZ всегда рядом</p>
              <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl">
                Управляйте логистикой прямо со смартфона
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">
                Рассчитывайте доставку, оформляйте заявки, следите за грузом и получайте документы — где бы вы ни находились.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Расчёт доставки", "Статусы груза", "Документы"].map((item) => (
                  <span key={item} className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white">
                    <Check className="h-4 w-4 text-blue-200" />
                    {item}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative mx-auto flex w-full max-w-sm justify-center">
              <div className="relative w-[15rem] rounded-[2.25rem] bg-[#111827] p-2.5">
                <div className="overflow-hidden rounded-[1.75rem] bg-white">
                  <div className="flex justify-center py-2">
                    <span className="h-1.5 w-16 rounded-full bg-[#d1d5db]" />
                  </div>
                  <div className="px-5 pb-5 pt-3 text-center">
                    <img src="/haulz-icon.svg" alt="HAULZ" className="mx-auto h-20 w-20 rounded-2xl" />
                    <p className="mt-4 text-lg font-bold text-[#111827]">HAULZ</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">Логистика в вашем телефоне</p>
                    <img src={GUEST_ILLUSTRATIONS.delivery} alt="" className="mt-4 w-full rounded-xl" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Выберите способ установки</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              HAULZ на вашем устройстве
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-[1.5rem] bg-white p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#dcfce7] text-[#15803d]">
                  <Download className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-[#dcfce7] px-3 py-1 text-xs font-bold text-[#15803d]">Доступно</span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-[#111827]">Android · APK</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                Официальная версия HAULZ для Android. Скачайте APK напрямую из нашего защищённого репозитория.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f3f4f6] p-4">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#2563eb]" />
                <div>
                  <p className="text-sm font-semibold text-[#111827]">Официальная сборка</p>
                  <p className="mt-1 break-all text-xs text-[#6b7280]">{ANDROID_RELEASE_ORIGIN}</p>
                </div>
              </div>
              <a
                href={ANDROID_RELEASE_DOWNLOAD_URL}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white hover:bg-[#1d4ed8]"
              >
                <Download className="h-4 w-4" />
                Скачать APK
              </a>
            </article>

            <article className="rounded-[1.5rem] bg-white p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                  <Store className="h-6 w-6" />
                </span>
                <span className="rounded-full bg-[#f3f4f6] px-3 py-1 text-xs font-bold text-[#6b7280]">Скоро</span>
              </div>
              <h3 className="mt-6 text-xl font-bold text-[#111827]">RuStore</h3>
              <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">
                Установка и автоматические обновления через российский магазин приложений.
              </p>
              <div className="mt-5 flex items-start gap-3 rounded-2xl bg-[#f3f4f6] p-4">
                <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-[#2563eb]" />
                <div>
                  <p className="text-sm font-semibold text-[#111827]">Готовим публикацию</p>
                  <p className="mt-1 text-xs leading-relaxed text-[#6b7280]">
                    Кнопка установки появится здесь после публикации HAULZ в RuStore.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled
                className="mt-5 inline-flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-[#e5e7eb] px-5 py-3 text-sm font-bold text-[#9ca3af]"
              >
                Скоро будет доступно
              </button>
            </article>
          </div>
        </section>

        <section className="mb-6 rounded-[1.75rem] bg-[#dbeafe] p-6 sm:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#2563eb] text-white">
                <Smartphone className="h-6 w-6" />
              </span>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-[#1d4ed8]">iPhone и iPad</p>
              <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
                Добавьте HAULZ на экран «Домой»
              </h2>
              <p className="mt-4 text-sm leading-relaxed text-[#4b5563]">
                Откройте{" "}
                <a href={appUrl} className="font-bold text-[#1d4ed8] underline underline-offset-2">
                  haulz.space
                </a>{" "}
                в Safari — приложение будет запускаться с рабочего стола как обычное мобильное приложение.
              </p>
              <a
                href={appUrl}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-[#1d4ed8]"
              >
                Открыть haulz.space
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            <ol className="grid gap-3">
              {IOS_STEPS.map((step) => (
                <li key={step} className="flex items-start gap-4 rounded-2xl bg-white/80 p-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2563eb] text-sm font-bold text-white">
                    {IOS_STEPS.indexOf(step) + 1}
                  </span>
                  <span className="pt-1 text-sm font-medium leading-relaxed text-[#1f2937]">{step}</span>
                  {IOS_STEPS.indexOf(step) === 1 ? <Share2 className="ml-auto mt-1 h-4 w-4 shrink-0 text-[#2563eb]" /> : null}
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
    </div>
  );
}
