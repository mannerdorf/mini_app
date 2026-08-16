import React from "react";
import { ArrowLeft } from "lucide-react";
import { HaulzWarehousePanel } from "../../components/haulz/HaulzWarehousePanel";
import { Button } from "../../components/shadcn/button";
import { GUEST_CONTACT_EMAIL_LABEL } from "./guestContactLabels";
import { GUEST_WAREHOUSE_ITEMS } from "./guestWarehouseContent";

type Props = {
  onBack: () => void;
};

export function GuestWarehousesPage({ onBack }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <header className="guest-header">
        <div className="mx-auto flex max-w-guest items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <Button variant="outline" size="icon" aria-label="Назад" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="guest-section-heading">Склады HAULZ</h1>
        </div>
      </header>

      <main className="mx-auto max-w-guest px-4 py-6 sm:px-6 lg:px-8">
        <p className="guest-section-lead mb-6 max-w-3xl sm:text-base">
          Адреса, режим работы и контакты складов в Москве и Калининграде.
        </p>

        <div className="flex flex-col gap-6">
          {GUEST_WAREHOUSE_ITEMS.map((warehouse) => (
            <HaulzWarehousePanel
              key={warehouse.city}
              {...warehouse}
              emailLabel={GUEST_CONTACT_EMAIL_LABEL}
            />
          ))}
        </div>
      </main>
    </div>
  );
}
