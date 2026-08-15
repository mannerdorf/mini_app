import { WEB_APP_VERSION } from "../constants/appVersion";
import {
  ANDROID_RELEASE_MANIFEST_URL,
  ANDROID_RELEASE_ORIGIN,
  type AndroidReleaseManifest,
} from "../constants/androidRelease";
import { getClientPlatform, type ClientPlatformInfo } from "./clientPlatform";
import { resolveApiOrigin } from "./resolveApiOrigin";
import {
  fetchAndroidReleaseManifest,
  getInstalledAndroidBuildNumber,
  isCapacitorAndroidApp,
} from "./androidAppUpdate";

export type AppInstallInfo = {
  versionName: string;
  buildNumber: number | null;
  appId: string | null;
};

export type AppVersionSnapshot = {
  install: AppInstallInfo;
  platform: ClientPlatformInfo;
  platformLabel: string;
  apiOrigin: string;
  releaseOrigin: string;
  releaseManifestUrl: string;
  isNativeAndroid: boolean;
};

export type AppUpdateCheckResult = {
  snapshot: AppVersionSnapshot;
  remote: AndroidReleaseManifest | null;
  updateAvailable: boolean;
  checkedAt: string;
};

export function formatClientPlatformLabel(info: ClientPlatformInfo): string {
  const platformLabels: Record<ClientPlatformInfo["platform"], string> = {
    ios: "iOS",
    android: "Android",
    desktop: "Компьютер",
    unknown: "Не определено",
  };
  const sourceLabels: Record<ClientPlatformInfo["source"], string> = {
    telegram: "Telegram",
    max: "MAX",
    capacitor: "Приложение HAULZ",
    "user-agent": "Браузер",
    unknown: "",
  };
  const platform = platformLabels[info.platform] ?? platformLabels.unknown;
  const source = sourceLabels[info.source];
  return source ? `${platform} · ${source}` : platform;
}

export async function getInstalledAppInfo(): Promise<AppInstallInfo> {
  if (isCapacitorAndroidApp()) {
    try {
      const { App } = await import("@capacitor/app");
      const info = await App.getInfo();
      const build = Number(info.build);
      return {
        versionName: String(info.version || WEB_APP_VERSION),
        buildNumber: Number.isFinite(build) && build > 0 ? build : null,
        appId: String(info.id || "ru.haulz.miniapp"),
      };
    } catch {
      return {
        versionName: WEB_APP_VERSION,
        buildNumber: null,
        appId: "ru.haulz.miniapp",
      };
    }
  }

  return {
    versionName: WEB_APP_VERSION,
    buildNumber: null,
    appId: null,
  };
}

export async function getAppVersionSnapshot(): Promise<AppVersionSnapshot> {
  const platform = getClientPlatform();
  const install = await getInstalledAppInfo();
  return {
    install,
    platform,
    platformLabel: formatClientPlatformLabel(platform),
    apiOrigin: resolveApiOrigin(),
    releaseOrigin: ANDROID_RELEASE_ORIGIN,
    releaseManifestUrl: ANDROID_RELEASE_MANIFEST_URL,
    isNativeAndroid: isCapacitorAndroidApp(),
  };
}

export async function checkAppReleaseUpdate(forceRemote = true): Promise<AppUpdateCheckResult> {
  const snapshot = await getAppVersionSnapshot();
  const remote = forceRemote ? await fetchAndroidReleaseManifest() : null;
  const installedBuild = snapshot.install.buildNumber;
  const updateAvailable = Boolean(
    snapshot.isNativeAndroid &&
      remote &&
      installedBuild != null &&
      remote.versionCode > installedBuild,
  );

  return {
    snapshot,
    remote,
    updateAvailable,
    checkedAt: new Date().toISOString(),
  };
}

export function openAndroidReleaseDownload(apkUrl: string): void {
  if (typeof window === "undefined") return;
  const link = document.createElement("a");
  link.href = apkUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function reloadWebApp(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("_refresh", String(Date.now()));
  window.location.replace(url.toString());
}
