import { AsyncLocalStorage } from 'node:async_hooks';
const requestSignals = new AsyncLocalStorage<AbortSignal>();
export function withRequestSignal<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  return requestSignals.run(signal, run);
}
/** Propagate the HTTP deadline without replacing a provider's shorter timeout. */
export function requestFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): ReturnType<typeof fetch> {
  const parent = requestSignals.getStore();
  const own = init?.signal || (input instanceof Request ? input.signal : undefined);
  const signal = parent && own ? AbortSignal.any([parent,own]) : parent || own;
  return fetch(input, {...init, ...(signal ? {signal} : {})});
}
