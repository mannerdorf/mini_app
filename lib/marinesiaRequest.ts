/** Share cached AIS responses and the Premium request budget within the API process. */
export function createMarinesiaRequester() {
  let nextStart = 0;
  const cache = new Map<string,{expires:number;response:Response}>();
  const pending = new Map<string,Promise<Response>>();
  return async function request(url:string, init?:RequestInit, cacheMs=300000):Promise<Response> {
    const key = `${url}|${cacheMs}`;
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.response.clone();
    const existing = pending.get(key);
    if (existing) return (await existing).clone();
    const wait = Math.max(0,nextStart-Date.now());
    if (wait > 52000) return new Response(JSON.stringify({error:true,message:'Marinesia: обновление ожидает свободного запроса. Повторите позже.'}),{status:429});
    nextStart = Date.now()+wait+13000;
    const task = (async()=>{
      if (wait) await new Promise(resolve=>setTimeout(resolve,wait));
      const response = await fetch(url,{...init,signal:AbortSignal.timeout(15000)});
      if (response.status === 429) nextStart = Math.max(nextStart,Date.now()+60000);
      // Short error caching prevents a table with repeated ferries retrying at once.
      const expires = Date.now() + (response.ok ? cacheMs : 15000);
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(key,{expires,response:response.clone()});
      return response;
    })();
    pending.set(key,task);
    try { return (await task).clone(); } finally { pending.delete(key); }
  };
}
export const requestMarinesia = createMarinesiaRequester();
