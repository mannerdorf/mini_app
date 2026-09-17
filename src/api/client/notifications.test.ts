import {afterEach,expect,it,vi} from 'vitest';
import {fetchPushHistory} from './notifications';
afterEach(()=>vi.unstubAllGlobals());
it('returns the server error when push history is unavailable',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'Сервис временно недоступен'}),{status:503})));
  await expect(fetchPushHistory('test')).resolves.toEqual({items:[],error:'Сервис временно недоступен'});
});
