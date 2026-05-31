import { lazyWithRetry } from "../lib/lazyWithRetry";

export const DashboardPage = lazyWithRetry(
  () => import("../pages/DashboardPage").then((m) => ({ default: m.DashboardPage })),
  "DashboardPage",
);
export const DocumentsPage = lazyWithRetry(
  () => import("../pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })),
  "DocumentsPage",
);
export const NotFoundPage = lazyWithRetry(
  () => import("../pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })),
  "NotFoundPage",
);
export const CMSStandalonePage = lazyWithRetry(
  () => import("../pages/CMSStandalonePage").then((m) => ({ default: m.CMSStandalonePage })),
  "CMSStandalonePage",
);
export const CargoPage = lazyWithRetry(
  () => import("../pages/CargoPage").then((m) => ({ default: m.CargoPage })),
  "CargoPage",
);
export const ProfilePage = lazyWithRetry(
  () => import("../pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
  "ProfilePage",
);
