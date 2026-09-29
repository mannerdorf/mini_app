import {afterEach,it,expect,vi} from 'vitest';
vi.mock('../../lib/resolveApiOrigin',()=>({resolveApiOrigin:()=> 'https://api.example.test'}));
import {getHaulzReturnsJob} from './haulzReturns';
const auth={login:'fixture',password:'fixture'};
const payload={job:{id:'34',status:'ready',error_message:null},files:[],workbook:{sheets:[],itogControlKeys:[]}};
afterEach(()=>vi.unstubAllGlobals());
it('recovers from an incomplete response with one read-only retry',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response('{"job":')).mockResolvedValueOnce(new Response(JSON.stringify(payload)));
 vi.stubGlobal('fetch',fetcher);
 expect((await getHaulzReturnsJob(auth,'34')).job.id).toBe('34');
 expect(fetcher).toHaveBeenCalledTimes(2);
 expect(fetcher.mock.calls[0][0]).toBe('https://api.example.test/api/haulz-returns/job?jobId=34');
});
it('rejects empty successful responses instead of manufacturing an empty session',async()=>{
 const fetcher=vi.fn(async()=>new Response('{}'));vi.stubGlobal('fetch',fetcher);
 await expect(getHaulzReturnsJob(auth,'34')).rejects.toThrow('Неполный ответ API');
 expect(fetcher).toHaveBeenCalledTimes(2);
});
it('does not retry permission failures',async()=>{
 const fetcher=vi.fn(async()=>new Response('{"error":"Нет доступа"}',{status:403}));vi.stubGlobal('fetch',fetcher);
 await expect(getHaulzReturnsJob(auth,'34')).rejects.toThrow('Нет доступа');
 expect(fetcher).toHaveBeenCalledTimes(1);
});
