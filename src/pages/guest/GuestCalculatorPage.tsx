import React, { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";
import { AppRuntimeProvider } from "../../contexts/AppRuntimeContext";

const HaulzCalculatorPage = lazy(() =>
  import("../HaulzCalculatorPage").then((m) => ({ default: m.HaulzCalculatorPage })),
);

type Props = {
  onBack: () => void;
  onLogin: () => void;
};

export function GuestCalculatorPage({ onBack, onLogin }: Props) {
  return (
    <div className="guest-shell min-h-[100dvh]">
      <AppRuntimeProvider
        value={{
          useServiceRequest: false,
          searchText: "",
          activeInn: "",
          activeCustomerName: "",
          showCustomerColumn: false,
        }}
      >
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-haulz-brand" />
            </div>
          }
        >
          <HaulzCalculatorPage
            auth={null}
            guestMode
            onBack={onBack}
            onRequireAuth={onLogin}
          />
        </Suspense>
      </AppRuntimeProvider>
    </div>
  );
}
