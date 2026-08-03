import React, { lazy } from "react";
import { clearChunkReloadState, isChunkLoadError, reloadForStaleChunks } from "./chunkLoadRecovery";

export function lazyWithRetry<T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  chunkKey: string,
) {
  return lazy(async () => {
    try {
      const module = await importer();
      clearChunkReloadState();
      return module;
    } catch (error) {
      if (typeof window !== "undefined" && isChunkLoadError(error)) {
        if (reloadForStaleChunks(`lazy:${chunkKey}`)) {
          return await new Promise<never>(() => {
            // keep pending while browser navigates
          });
        }
      }
      throw error;
    }
  });
}
