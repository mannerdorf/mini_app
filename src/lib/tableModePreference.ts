/** Табличный вид в служебном режиме: localStorage, если пользователь явно не выбирал — true. */
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
