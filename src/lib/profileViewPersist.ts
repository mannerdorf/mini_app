import type { ProfileView } from "../types";

const PROFILE_VIEW_KEY = "haulz.profile.view";
const PROFILE_HAULZ_BACK_KEY = "haulz.profile.haulzBackView";
const PROFILE_CALC_DRAFT_KEY = "haulz.profile.calcDraftId";

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
  "voiceAssistants",
  "2fa",
  "notifications",
  "accounting",
  "ais",
  "haulzSummary",
  "haulzReturns",
  "haulzCalculator",
  "haulzCalcDrafts",
  "haulzCalcRequests",
  "admin",
  "tinyurl-test",
  "chat",
  "apiKeys",
]);

function isProfileView(value: string | null | undefined): value is ProfileView {
  return Boolean(value && PROFILE_VIEWS.has(value as ProfileView));
}

export function readStoredProfileView(): ProfileView {
  if (typeof window === "undefined") return "main";
  try {
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("profileView");
    if (isProfileView(fromUrl)) return fromUrl;
    const saved = window.localStorage.getItem(PROFILE_VIEW_KEY);
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
