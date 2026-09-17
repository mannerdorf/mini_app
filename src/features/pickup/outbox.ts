export type Pending = { id: string; body: Record<string, unknown>; title: string; error?: string; status?: number; context?: { address: string; date: string; city: string } };

/** Preserve command IDs and payloads after ambiguous failures; block only dependent commands. */
export async function sendOutbox(items: Pending[], call: (body: Record<string, unknown>) => Promise<unknown>, save: (items: Pending[]) => Promise<void>) {
  let remaining = [...items];
  const blocked = new Set<unknown>();
  for (const item of items) {
    if (blocked.has(item.body.id)) continue;
    try {
      await call(item.body);
    } catch (error) {
      const status = Number((error as { status?: number }).status);
      if (!status || status >= 500 || status === 401 || status === 403 || status === 429) throw error;
      blocked.add(item.body.id);
      remaining = remaining.map(p => p.id === item.id ? { ...p, error: (error as Error).message, status } : p);
      await save(remaining);
      continue;
    }
    const next = remaining.filter(p => p.id !== item.id);
    await save(next);
    remaining = next;
  }
  return remaining;
}
