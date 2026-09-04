import type { ProfileView } from "../types";

const PROFILE_VIEW_KEY = "haulz.profile.view";
const PROFILE_HAULZ_BACK_KEY = "haulz.profile.haulzBackView";
const PROFILE_CALC_DRAFT_KEY = "haulz.profile.calcDraftId";
const REQUESTS_TAB_KEY = "haulz.profile.requestsTab";

export type HaulzCalcRequestsTab = "requests" | "saved";

const PROFILE_VIEWS = new Set<ProfileView>([
  "main",
  "companies",
  "haulz",
  "parcelScanner",
  "roles",
  "employees",
  "departmentTimesheet",
  "expenseRequests",
  "addCompanyMethod",
  "addCompanyByINN",
  "addCompanyByLogin",
  "about",
  "faq",
  "version",
  "voiceAssistants",
  "2fa",
  "notifications",
  "push",
  "accounting",
  "ais",
  "haulzSummary",
  "haulzSandbox",
  "haulzReturns",
  "haulzCalculator",
  "haulzCalcRequests",
  "haulzSendingsAnalysis",
  "haulzDeliveredWithoutApp",
  "haulzCargoTimeline",
  "admin",
  "tinyurl-test",
  "apiKeys",
]);

function isProfileView(value: string | null | undefined): value is ProfileView {
  return Boolean(value && PROFILE_VIEWS.has(value as ProfileView));
}

function migrateLegacyDraftsView(view: string | null | undefined): ProfileView | null {
  if (view === "haulzCalcDrafts") {
    persistHaulzCalcRequestsTab("saved");
    return "haulzCalcRequests";
  }
  if (view === "chat") {
    return "main";
  }
  return null;
}

export function readStoredHaulzCalcRequestsTab(): HaulzCalcRequestsTab {
  if (typeof window === "undefined") return "requests";
  try {
    return sessionStorage.getItem(REQUESTS_TAB_KEY) === "saved" ? "saved" : "requests";
  } catch {
    return "requests";
  }
}

export function persistHaulzCalcRequestsTab(tab: HaulzCalcRequestsTab): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(REQUESTS_TAB_KEY, tab);
  } catch {
    /* ignore */
  }
}

export function readStoredProfileView(): ProfileView {
  if (typeof window === "undefined") return "main";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("profileView");
    const migratedUrl = migrateLegacyDraftsView(fromUrl);
    if (migratedUrl) return migratedUrl;
    if (isProfileView(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(PROFILE_VIEW_KEY);
    const migratedSaved = migrateLegacyDraftsView(saved);
    if (migratedSaved) return migratedSaved;
    if (isProfileView(saved)) return saved;
  } catch {
    /* ignore */
  }
  return "main";
}

export function readStoredHaulzCalcBackView(): ProfileView {
  if (typeof window === "undefined") return "haulz";
  try {
    const saved = window.localStorage.getItem(PROFILE_HAULZ_BACK_KEY);
    const migrated = migrateLegacyDraftsView(saved);
    if (migrated) return migrated;
    if (isProfileView(saved)) return saved;
  } catch {
    /* ignore */
  }
  return "haulz";
}

export function readStoredHaulzCalcDraftId(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_CALC_DRAFT_KEY);
    if (!raw) return null;
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function persistProfileNavigation(
  view: ProfileView,
  haulzBackView: ProfileView,
  calcDraftId: number | null,
): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROFILE_VIEW_KEY, view);
    window.localStorage.setItem(PROFILE_HAULZ_BACK_KEY, haulzBackView);
    if (calcDraftId != null) {
      window.localStorage.setItem(PROFILE_CALC_DRAFT_KEY, String(calcDraftId));
    } else {
      window.localStorage.removeItem(PROFILE_CALC_DRAFT_KEY);
    }

    const url = new URL(window.location.href);
    if (view === "main") {
      url.searchParams.delete("profileView");
    } else {
      url.searchParams.set("profileView", view);
    }
    window.history.replaceState(null, "", url.toString());
  } catch {
    /* ignore */
  }
}
