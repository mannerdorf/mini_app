import React from "react";
import { AppRuntimeProvider } from "../../contexts/AppRuntimeContext";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { HaulzCalculatorPage } from "../HaulzCalculatorPage";

type Props = {
  onBack: () => void;
  onLogin: () => void;
};

function GuestCalculatorErrorFallback() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-base font-semibold text-[#111827]">Не удалось открыть калькулятор</p>
      <p className="max-w-sm text-sm text-[#6b7280]">
        Обновите страницу. Если ошибка повторяется — очистите кэш браузера.
      </p>
      <button
        type="button"
        className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white"
        onClick={() => window.location.reload()}
      >
        Обновить
      </button>
    </div>
  );
}

export function GuestCalculatorPage({ onBack, onLogin }: Props) {
  return (
    <div className="guest-shell guest-shell--calc light-mode min-h-[100dvh]">
      <AppRuntimeProvider
        value={{
          useServiceRequest: false,
          searchText: "",
          activeInn: "",
          activeCustomerName: "",
          showCustomerColumn: false,
        }}
      >
        <ErrorBoundary fallback={<GuestCalculatorErrorFallback />}>
          <HaulzCalculatorPage
            auth={null}
            guestMode
            onBack={onBack}
            onRequireAuth={onLogin}
          />
        </ErrorBoundary>
      </AppRuntimeProvider>
    </div>
  );
}
