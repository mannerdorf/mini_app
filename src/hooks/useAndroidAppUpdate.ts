import { useEffect, useState } from "react";
import { checkAndroidAppUpdate } from "../lib/androidAppUpdate";
import type { AndroidReleaseManifest } from "../constants/androidRelease";

export function useAndroidAppUpdate(enabled: boolean) {
  const [update, setUpdate] = useState<AndroidReleaseManifest | null>(null);

  useEffect(() => {
    if (!enabled) {
      setUpdate(null);
      return;
    }
    let cancelled = false;
    checkAndroidAppUpdate()
      .then((result) => {
        if (!cancelled) setUpdate(result?.manifest ?? null);
      })
      .catch(() => {
        if (!cancelled) setUpdate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return update;
}
