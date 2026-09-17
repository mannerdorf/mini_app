import {afterEach,expect,it,vi} from 'vitest';
import {fetchTwoFaSettings,sendTelegramTwoFaCode} from './twoFa';
afterEach(()=>vi.unstubAllGlobals());
it('does not interpret unavailable or malformed settings as disabled MFA',async()=>{
  const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
  for(const response of [new Response('{"error":"offline"}',{status:503}),new Response('{"ok":true}'),new Response('{"ok":true,"settings":{"enabled":"false"}}')]){
    fetch.mockResolvedValueOnce(response);await expect(fetchTwoFaSettings('alice','test')).rejects.toThrow();
  }
});
it('authenticates settings reads with POST and preserves confirmed enabled state',async()=>{
  const settings={enabled:true,method:'google',telegramLinked:false,googleSecretSet:true};
  const fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,settings})));vi.stubGlobal('fetch',fetch);
  await expect(fetchTwoFaSettings('alice','test')).resolves.toEqual({ok:true,settings});
  expect(fetch.mock.calls[0][0]).toBe('/api/2fa');
  expect(fetch.mock.calls[0][1]).toMatchObject({method:'POST',body:JSON.stringify({action:'read',login:'alice',password:'test'})});
});
it('surfaces Telegram delivery errors rather than starting a false confirmation step',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"error":"Не доставлено"}',{status:502})));
  await expect(sendTelegramTwoFaCode('alice','test')).rejects.toThrow('Не доставлено');
});
