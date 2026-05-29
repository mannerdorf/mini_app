/** Таймаут исходящего запроса (1С и др.), чтобы Vercel не отдавал 504 без тела. */
export async function fetchWithTimeout(
  input: string | URL,
  init?: RequestInit,
  timeoutMs = 50_000,
): Promise<Response> {
  if (init?.signal) {
    return fetch(input, init);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function upstreamTimeoutMessage(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") {
    return "Превышено время ожидания ответа от 1С. Повторите позже.";
  }
  return err instanceof Error ? err.message : "Ошибка запроса к 1С";
}
