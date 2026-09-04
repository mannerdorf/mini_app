const SELECTABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], .allow-text-select, .allow-text-select *';

function isSelectableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return !!target.closest(SELECTABLE_SELECTOR);
}

/** Capacitor / Ionic WebView (Android APK, iOS shell). */
export function isCapacitorNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cap = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }
  const protocol = String(window.location.protocol || "").toLowerCase();
  return protocol === "capacitor:" || protocol === "ionic:";
}

/** Блокирует системное меню «Копировать» при long-press в нативной оболочке. */
export function setupNativeTextSelectionBlock(): void {
  if (typeof document === "undefined" || !isCapacitorNativeApp()) return;

  document.documentElement.classList.add("haulz-native-shell");

  const block = (event: Event) => {
    if (isSelectableTarget(event.target)) return;
    event.preventDefault();
  };

  document.addEventListener("contextmenu", block, { capture: true });
  document.addEventListener("selectstart", block, { capture: true });
}
