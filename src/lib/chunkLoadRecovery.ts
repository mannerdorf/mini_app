const RETRY_STATE_KEY = "haulz.chunk-reload";
const MAX_RETRIES = 3;
const RETRY_WINDOW_MS = 60_000;

type RetryState = {
  count: number;
  firstAt: number;
};

export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(message) ||
    /Importing a module script failed/i.test(message) ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /error loading dynamically imported module/i.test(message)
  );
}

/** Hard reload with cache-bust when a stale Vite chunk is requested after deploy. */
export function reloadForStaleChunks(_source: string): boolean {
  if (typeof window === "undefined") return false;

  try {
    const now = Date.now();
    const raw = window.sessionStorage.getItem(RETRY_STATE_KEY);
    let state: RetryState = raw ? (JSON.parse(raw) as RetryState) : { count: 0, firstAt: now };

    if (now - state.firstAt > RETRY_WINDOW_MS) {
      state = { count: 0, firstAt: now };
    }

    if (state.count >= MAX_RETRIES) {
      window.sessionStorage.removeItem(RETRY_STATE_KEY);
      return false;
    }

    state.count += 1;
    window.sessionStorage.setItem(RETRY_STATE_KEY, JSON.stringify(state));

    const url = new URL(window.location.href);
    url.searchParams.set("__chunk_reload", String(now));
    url.searchParams.delete("__chunk_retry");
    window.location.replace(url.toString());
    return true;
  } catch {
    window.location.reload();
    return true;
  }
}

export function clearChunkReloadState(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RETRY_STATE_KEY);
    const staleKeys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const key = window.sessionStorage.key(i);
      if (key?.startsWith("haulz.chunk-retry:")) staleKeys.push(key);
    }
    staleKeys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // ignore storage access issues
  }
}
