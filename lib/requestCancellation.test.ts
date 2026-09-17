import { it, expect, vi, afterEach } from 'vitest';
import { requestFetch, withRequestSignal } from './requestCancellation';
afterEach(()=>vi.unstubAllGlobals());
it('propagates deadlines and keeps concurrent request signals isolated',async()=>{
  const signals:AbortSignal[]=[];
  vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{signals.push(init.signal);return new Response('ok');}));
  const a=new AbortController(),b=new AbortController();
  await Promise.all([withRequestSignal(a.signal,()=>requestFetch('https://example.test/a')),withRequestSignal(b.signal,()=>requestFetch('https://example.test/b'))]);
  a.abort(); expect(signals[0].aborted).toBe(true); expect(signals[1].aborted).toBe(false);
});
it('preserves a provider-specific shorter timeout',async()=>{
  let signal!:AbortSignal;
  vi.stubGlobal('fetch',vi.fn(async (_url,init)=>{signal=init.signal;return new Response('ok');}));
  const parent=new AbortController(),provider=new AbortController();
  await withRequestSignal(parent.signal,()=>requestFetch('https://example.test',{signal:provider.signal}));
  provider.abort();expect(signal.aborted).toBe(true);expect(parent.signal.aborted).toBe(false);
});
