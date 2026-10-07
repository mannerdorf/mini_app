import {afterEach,expect,it,vi} from 'vitest';
import {createMarinesiaRequester} from './marinesiaRequest';
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('shares concurrent requests and cached responses without consuming another caller body',async()=>{
 const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({data:{status:5}})));vi.stubGlobal('fetch',fetch);
 const request=createMarinesiaRequester();
 const [a,b]=await Promise.all([request('https://fixture.invalid/1'),request('https://fixture.invalid/1')]);
 expect(await a.json()).toEqual(await b.json());expect(fetch).toHaveBeenCalledOnce();
 expect(await (await request('https://fixture.invalid/1')).json()).toEqual({data:{status:5}});expect(fetch).toHaveBeenCalledOnce();
});
it('spaces different vessel calls by 13 seconds and refreshes after five minutes',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);
 const fetch=vi.fn().mockImplementation(async()=>new Response('{}'));vi.stubGlobal('fetch',fetch);
 const request=createMarinesiaRequester();await request('https://fixture.invalid/1');
 const second=request('https://fixture.invalid/2');expect(fetch).toHaveBeenCalledOnce();
 await vi.advanceTimersByTimeAsync(13000);await second;expect(fetch).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(300000);await request('https://fixture.invalid/1');expect(fetch).toHaveBeenCalledTimes(3);
});
it('limits queue length so table requests cannot exceed server timeout',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response('{}')));
 const request=createMarinesiaRequester();
 const calls=Array.from({length:5},(_,i)=>request(`https://fixture.invalid/${i}`));
 expect((await request('https://fixture.invalid/full')).status).toBe(429);
 await vi.advanceTimersByTimeAsync(52000);await Promise.all(calls);
});
it('backs off for a minute on provider rate limit',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{}',{status:429})));
 const request=createMarinesiaRequester();expect((await request('https://fixture.invalid/1')).status).toBe(429);
 expect((await request('https://fixture.invalid/2')).status).toBe(429);
 expect(fetch).toHaveBeenCalledOnce();
});
it('keeps badge responses for two hours separately from map requests',async()=>{
 vi.useFakeTimers();vi.setSystemTime(0);
 const fetch=vi.fn().mockImplementation(async()=>new Response('{}'));vi.stubGlobal('fetch',fetch);
 const request=createMarinesiaRequester();const url='https://fixture.invalid/1';const ttl=2*60*60*1000;
 await request(url,undefined,ttl);
 await vi.advanceTimersByTimeAsync(300000);await request(url,undefined,ttl);expect(fetch).toHaveBeenCalledOnce();
 await request(url);expect(fetch).toHaveBeenCalledTimes(2);
 await vi.advanceTimersByTimeAsync(ttl);await request(url,undefined,ttl);expect(fetch).toHaveBeenCalledTimes(3);
});
