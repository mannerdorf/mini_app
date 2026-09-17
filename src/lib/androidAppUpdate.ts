import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { ANDROID_RELEASE_MANIFEST_URL, type AndroidReleaseManifest } from "../constants/androidRelease";
import { getClientPlatform } from "./clientPlatform";

export function isCapacitorAndroidApp(): boolean {
  const info = getClientPlatform();
  return info.source === "capacitor" && info.platform === "android";
}

export async function fetchAndroidReleaseManifest(): Promise<AndroidReleaseManifest | null> {
  const timeoutMs = 10_000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<null>(resolve => {
      timer = setTimeout(() => {
        resolve(null);
        controller.abort();
      }, timeoutMs);
    });
    const request = async (): Promise<AndroidReleaseManifest | null> => {
      if (Capacitor.isNativePlatform()) {
        const res = await CapacitorHttp.get({
          url: ANDROID_RELEASE_MANIFEST_URL,
          headers: { Accept: "application/json" },
          connectTimeout: timeoutMs,
          readTimeout: timeoutMs,
        });
        if (res.status < 200 || res.status >= 300) return null;
        const data = (typeof res.data === "string" ? JSON.parse(res.data) : res.data) as AndroidReleaseManifest;
        if (!data?.versionCode || !data?.apkUrl) return null;
        return data;
      }

      const res = await fetch(ANDROID_RELEASE_MANIFEST_URL, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as AndroidReleaseManifest;
      if (!data?.versionCode || !data?.apkUrl) return null;
      return data;
    };
    // The deadline also bounds native bridge stalls and a stalled response body.
    return await Promise.race([request(), deadline]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function getInstalledAndroidBuildNumber(): Promise<number | null> {
  if (!isCapacitorAndroidApp()) return null;
  try {
    const { App } = await import("@capacitor/app");
    const info = await App.getInfo();
    const build = Number(info.build);
    return Number.isFinite(build) && build > 0 ? build : null;
  } catch {
    return null;
  }
}

export async function checkAndroidAppUpdate(): Promise<{
  installedBuild: number;
  manifest: AndroidReleaseManifest;
} | null> {
  const installedBuild = await getInstalledAndroidBuildNumber();
  if (installedBuild == null) return null;

  const manifest = await fetchAndroidReleaseManifest();
  if (!manifest) return null;
  if (manifest.versionCode <= installedBuild) return null;

  return { installedBuild, manifest };
}
