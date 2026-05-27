import React, { createContext, useContext } from "react";

export type AppRuntimeValue = {
  useServiceRequest: boolean;
  searchText: string;
  activeInn: string;
  /** Наименование заказчика из шапки (для фильтра перевозок без ИНН в строке). */
  activeCustomerName: string;
  /** false — у логина одна компания (как в шапке), столбец «Заказчик» в таблицах скрыт */
  showCustomerColumn: boolean;
};

const DEFAULT_RUNTIME: AppRuntimeValue = {
  useServiceRequest: false,
  searchText: "",
  activeInn: "",
  activeCustomerName: "",
  showCustomerColumn: true,
};

const AppRuntimeContext = createContext<AppRuntimeValue>(DEFAULT_RUNTIME);

export function AppRuntimeProvider({
  value,
  children,
}: {
  value: AppRuntimeValue;
  children: React.ReactNode;
}) {
  return <AppRuntimeContext.Provider value={value}>{children}</AppRuntimeContext.Provider>;
}

export function useAppRuntime() {
  return useContext(AppRuntimeContext);
}

