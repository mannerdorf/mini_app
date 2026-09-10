export type TableModeFlags = {
  tableModeGroupedByCustomer: boolean;
  tableModeFlatDirect: boolean;
  tableModeEffective: boolean;
  canShowTableModeToggle: boolean;
};

/** Табличный режим: служебный режим (все экраны) или десктоп без служебного. */
export function computeTableModeFlags(params: {
  tableModeByCustomer: boolean;
  showCustomerColumn: boolean;
  effectiveServiceMode: boolean;
  isDesktopLayout: boolean;
}): TableModeFlags {
  const { tableModeByCustomer, showCustomerColumn, effectiveServiceMode, isDesktopLayout } = params;
  const tableModeAllowed = effectiveServiceMode || isDesktopLayout;
  const tableModeGroupedByCustomer =
    tableModeByCustomer && showCustomerColumn && effectiveServiceMode;
  const tableModeFlatDirect =
    tableModeByCustomer && tableModeAllowed && !tableModeGroupedByCustomer;
  const tableModeEffective = tableModeByCustomer && tableModeAllowed;
  const canShowTableModeToggle = tableModeAllowed;
  return {
    tableModeGroupedByCustomer,
    tableModeFlatDirect,
    tableModeEffective,
    canShowTableModeToggle,
  };
}

/** Табличный вид: localStorage, если пользователь явно не выбирал — defaultWhenUnset. */
export function readTableModePreference(storageKey: string, defaultWhenUnset = false): boolean {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === null) return defaultWhenUnset;
    return v === "true";
  } catch {
    return defaultWhenUnset;
  }
}

export function hasTableModePreference(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}
