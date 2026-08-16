import React from "react";
import { ArrowLeft, Clock3, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { yandexMapEmbedUrl, yandexMapsOpenUrl } from "../../lib/yandexMaps";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";
import { GUEST_WAREHOUSE_ITEMS } from "./guestWarehouseContent";

type Props = {
  onBack: () => void;
};

function normalizePhoneToTel(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.startsWith("+") ? digits : `+${digits}`;
}

export function GuestWarehousesPage({ onBack }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <main className="mx-auto max-w-guest px-4 py-4 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="text-sm font-semibold text-[#374151]">Склады HAULZ</span>
        </div>

        <section className="guest-app-hero overflow-hidden rounded-[1.75rem]">
          <div className="grid items-center gap-8 px-6 py-10 sm:px-10 sm:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:px-14">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">Москва и Калининград</p>
              <h1 className="mt-4 max-w-2xl text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-white sm:text-5xl">
                Склады HAULZ рядом с вашим грузом
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-blue-100 sm:text-lg">
                Адреса, режим работы и контакты — всё в одном месте. Позвоните, напишите или постройте маршрут на карте.
              </p>
              <div className="mt-7 flex flex-wrap gap-2">
                {["Приёмка и выдача", "Ежедневно 09:00–18:00", "Два региона"].map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white"
                  >
                    <Clock3 className="h-4 w-4 text-blue-200" />
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="mx-auto w-full max-w-sm rounded-[1.5rem] bg-white p-3">
              <img
                src={GUEST_ILLUSTRATIONS.location}
                alt=""
                className="aspect-square w-full rounded-[1.1rem] object-cover"
              />
            </div>
          </div>
        </section>

        <section className="py-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Контакты складов</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              Где забрать и куда привезти
            </h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
              <article key={warehouse.city} className="rounded-[1.5rem] bg-white p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">
                    <MapPin className="h-6 w-6" />
                  </span>
                  <span className="rounded-full bg-[#eff6ff] px-3 py-1 text-xs font-bold text-[#2563eb]">
                    {warehouse.hours}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-bold text-[#111827]">{warehouse.city}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{warehouse.address}</p>

                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href={`tel:${normalizePhoneToTel(warehouse.phone)}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#f3f4f6] px-3 py-2 text-sm font-semibold text-[#111827]"
                  >
                    <Phone className="h-4 w-4 text-[#2563eb]" />
                    {warehouse.phone}
                  </a>
                  <a
                    href={`mailto:${warehouse.email}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#f3f4f6] px-3 py-2 text-sm font-semibold text-[#111827]"
                  >
                    <Mail className="h-4 w-4 text-[#2563eb]" />
                    {GUEST_CONTACT_EMAIL_LABEL}
                  </a>
                </div>

                <a
                  href={yandexMapsOpenUrl({
                    lat: warehouse.lat,
                    lon: warehouse.lon,
                    address: warehouse.address,
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#2563eb] px-5 py-3 text-sm font-bold text-white hover:bg-[#1d4ed8]"
                >
                  <MapPin className="h-4 w-4" />
                  Открыть на карте
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="mb-6 rounded-[1.75rem] bg-[#dbeafe] p-6 sm:p-10">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#1d4ed8]">На карте</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              Как добраться до склада
            </h2>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
              <div key={`map-${warehouse.city}`} className="overflow-hidden rounded-2xl bg-white">
                <div className="px-4 py-3">
                  <p className="text-sm font-bold text-[#111827]">{warehouse.city}</p>
                  <p className="mt-1 text-xs text-[#6b7280]">{warehouse.address}</p>
                </div>
                <iframe
                  title={`Карта склада HAULZ — ${warehouse.city}`}
                  src={yandexMapEmbedUrl({
                    lat: warehouse.lat,
                    lon: warehouse.lon,
                    address: warehouse.address,
                  })}
                  className="h-64 w-full border-0"
                  loading="lazy"
                  allowFullScreen
                />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
