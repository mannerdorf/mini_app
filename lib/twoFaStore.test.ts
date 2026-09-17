import {afterEach,expect,it,vi} from 'vitest';
import {twoFaStore,twoFaRedisCommand,TWO_FA_CAS} from './twoFaStore';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
function configured(){vi.stubEnv('UPSTASH_REDIS_REST_URL','https://redis.example.test');vi.stubEnv('UPSTASH_REDIS_REST_TOKEN','test');}
it('fails closed for missing config, unavailable storage, command errors and invalid data',async()=>{
  vi.stubEnv('UPSTASH_REDIS_REST_URL','');await expect(twoFaStore.get('key')).rejects.toThrow();
  configured();const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const response of [new Response('',{status:503}),new Response('[{"error":"no"}]'),new Response('{}'),new Response('[{"result":123}]')]){
    fetch.mockResolvedValueOnce(response);await expect(twoFaStore.get('key')).rejects.toThrow();
  }
  fetch.mockRejectedValueOnce(new Error('offline'));await expect(twoFaStore.get('key')).rejects.toThrow();
  fetch.mockResolvedValueOnce(new Response('[{"result":null}]'));await expect(twoFaStore.get('key')).resolves.toBeNull();
});
it('uses an expiring SET and a single checked transaction, without a GET/DEL race',async()=>{
  configured();const fetch=vi.fn().mockResolvedValueOnce(new Response('[{"result":"OK"}]')).mockResolvedValueOnce(new Response('[{"result":1}]'));
  vi.stubGlobal('fetch',fetch);await twoFaStore.set('pending','secret',300);
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([['SET','pending','secret','EX',300]]);
  await expect(twoFaStore.compareAndSet({grant:'token',pending:null},[{key:'grant',value:null}])).resolves.toBe(true);
  const command=JSON.parse(fetch.mock.calls[1][1].body)[0];
  expect(command).toEqual(['EVAL',TWO_FA_CAS,0,JSON.stringify({grant:'token',pending:null}),JSON.stringify([{key:'grant',value:null}])]);
  expect(fetch.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
});
