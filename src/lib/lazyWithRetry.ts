import React, { lazy } from "react";

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  chunkKey: string,
) {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error ?? "");
      const isChunkLoadError =
        /Failed to fetch dynamically imported module/i.test(message) ||
        /Importing a module script failed/i.test(message) ||
        /Loading chunk [\d]+ failed/i.test(message);
      if (typeof window !== "undefined" && isChunkLoadError) {
        const marker = `haulz.chunk-retry:${chunkKey}`;
        try {
          const alreadyRetried = window.sessionStorage.getItem(marker) === "1";
          if (!alreadyRetried) {
            window.sessionStorage.setItem(marker, "1");
            const url = new URL(window.location.href);
            url.searchParams.set("__chunk_retry", String(Date.now()));
            window.location.replace(url.toString());
            return await new Promise<never>(() => {
              // keep pending while browser navigates
            });
          }
          window.sessionStorage.removeItem(marker);
        } catch {
          // ignore storage access issues and rethrow original error
        }
      }
      throw error;
    }
  });
}
