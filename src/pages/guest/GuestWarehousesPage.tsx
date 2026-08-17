import React from "react";
import { ArrowLeft, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "../../components/shadcn/button";
import { GUEST_ILLUSTRATIONS } from "../../constants/guestIllustrations";
import { yandexMapEmbedUrl, yandexMapsOpenUrl } from "../../lib/yandexMaps";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";
import { GuestPageHero } from "./GuestPageHero";
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
      <div className="guest-page-back mx-auto max-w-guest px-4 sm:px-6 lg:px-8">
        <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack} className="bg-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold text-[#374151]">Склады HAULZ</span>
      </div>

      <GuestPageHero
        title="Склады рядом с вашим грузом"
        lead="Адреса, режим работы и контакты — всё в одном месте. Позвоните, напишите или постройте маршрут на карте."
        imageSrc={GUEST_ILLUSTRATIONS.warehousesVisual}
        imageAlt="Склад HAULZ"
      />

      <main className="mx-auto max-w-guest px-4 pb-8 pt-2 sm:px-6 lg:px-8">
        <section className="py-6">
          <div className="mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2563eb]">Контакты складов</p>
            <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em] text-[#111827] sm:text-3xl">
              Где забрать и куда привезти
            </h2>
            <p className="mt-2 text-sm text-[#6b7280]">Москва и Калининград · ежедневно 09:00–18:00</p>
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
