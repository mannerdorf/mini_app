/** Версия web-сборки (из package.json через Vite define). */
export const WEB_APP_VERSION = String(import.meta.env.VITE_APP_VERSION || "1.0.0");
export const WEB_BUILD_INFO: { id: string; commit: string; builtAt: string } = import.meta.env.VITE_BUILD_INFO || { id: "dev", commit: "unknown", builtAt: "" };
