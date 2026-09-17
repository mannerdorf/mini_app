import { WEB_BUILD_INFO } from "../constants/appVersion";

export async function checkWebBuild(): Promise<"current" | "available" | "unavailable"> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`/build-info.json?t=${Date.now()}`, { cache: "no-store", signal: controller.signal });
    if (!response.ok) return "unavailable";
    const info = await response.json();
    if (typeof info?.id !== "string" || !info.id) return "unavailable";
    return info.id === WEB_BUILD_INFO.id ? "current" : "available";
  } catch { return "unavailable"; }
  finally { clearTimeout(timer); }
}
