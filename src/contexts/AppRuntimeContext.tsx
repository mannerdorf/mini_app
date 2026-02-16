import React, { createContext, useContext } from "react";

export type AppRuntimeValue = {
  useServiceRequest: boolean;
  searchText: string;
  activeInn: string;
};

const DEFAULT_RUNTIME: AppRuntimeValue = {
  useServiceRequest: false,
  searchText: "",
  activeInn: "",
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

