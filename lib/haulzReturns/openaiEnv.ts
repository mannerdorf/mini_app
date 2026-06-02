/** OPENAI_API_KEY на сервере (Vercel / VPS), не во фронтенд-сборке. */
export function resolveOpenaiApiKey(): string {
  const raw =
    process.env.OPENAI_API_KEY ??
    process.env.OPENAI_KEY ??
    process.env.CHATGPT_API_KEY ??
    "";
  return String(raw).trim().replace(/^["']|["']$/g, "");
}

export function requireOpenaiApiKey(): string {
  const key = resolveOpenaiApiKey();
  if (!key) {
    throw new Error("OPENAI_API_KEY не настроен на сервере API (Vercel → Settings → Environment Variables)");
  }
  return key;
}
