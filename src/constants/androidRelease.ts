import { DEFAULT_ANDROID_RELEASE_ORIGIN } from "../../lib/haulzDomains";

/** Базовый URL репозитория APK (app.haulz.space). */
export const ANDROID_RELEASE_ORIGIN = String(
  import.meta.env.VITE_ANDROID_RELEASE_ORIGIN || DEFAULT_ANDROID_RELEASE_ORIGIN,
).replace(/\/+$/, "");

export type AndroidReleaseManifest = {
  versionName: string;
  versionCode: number;
  apkUrl: string;
  apkFile?: string;
  releasesPath?: string;
  sha256?: string;
  publishedAt?: string;
  releaseNotes?: string;
  appId?: string;
};

export const ANDROID_RELEASE_MANIFEST_URL = `${ANDROID_RELEASE_ORIGIN}/version.json`;
export const ANDROID_RELEASE_DOWNLOAD_URL = `${ANDROID_RELEASE_ORIGIN}/latest.apk`;
