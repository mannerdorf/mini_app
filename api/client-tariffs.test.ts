import {beforeEach,expect,it,vi} from 'vitest';
const state = vi.hoisted(()=>({fetch:vi.fn(),verify:vi.fn(),permissions:vi.fn()}));
vi.mock('./_db.js',()=>({getPool:()=>({})}));
vi.mock('../lib/cacheHistoryDays.js',()=>({getPerevozkiServiceCredentials:()=>({login:'service-test',password:'fixture'})}));
vi.mock('../lib/verifyRegisteredUser.js',()=>({verifyRegisteredUser:state.verify}));
vi.mock('../lib/legalDocuments.js',()=>({getRegisteredUserPermissions:state.permissions,hasServiceModePermission:(p:any)=>p?.service_mode===true}));
vi.mock('../lib/clientTariffs1c.js',()=>({fetchClientTariffsFrom1c:state.fetch}));
import handler from './client-tariffs';
const inn='7701234567';
async function request(overrides={},method='POST') {
  const result={status:200,body:null as any,headers:{} as Record<string,string>};
  const res:any={setHeader:(key:string,v:string)=>{result.headers[key]=v;},status:(code:number)=>{result.status=code;return res;},json:(body:any)=>{result.body=body;return res;}};
  await handler({method,headers:{},body:{login:'staff',password:'fixture',isRegisteredUser:true,serviceMode:true,inn,...overrides}} as any,res);
  return result;
}
beforeEach(()=>{
  vi.clearAllMocks();state.verify.mockResolvedValue({accessAllInns:false});state.permissions.mockResolvedValue({service_mode:true});
  state.fetch.mockResolvedValue({Success:true,ИНН:inn,Тарифы:[{Тариф:100,ВесОт:0,ОГ:false,SLA:2}]});
});
it('requires service mode even from the service account and never queries 1C otherwise',async()=>{
  for (const serviceMode of [false,undefined,'true']) {
    expect((await request({login:'service-test',serviceMode})).status).toBe(403);
  }
  expect(state.fetch).not.toHaveBeenCalled();
});
it('rejects an authenticated customer with a forged service mode flag',async()=>{
  state.permissions.mockResolvedValue({service_mode:false});
  expect((await request()).status).toBe(403);expect(state.fetch).not.toHaveBeenCalled();
});
it('rejects invalid credentials before requesting tariffs',async()=>{
  state.verify.mockResolvedValue(null);
  expect((await request()).status).toBe(401);expect(state.fetch).not.toHaveBeenCalled();
});
it('uses the HAULZ tariff transport and selected client INN and preserves all returned fields',async()=>{
  const result=await request();
  expect(result.status).toBe(200);expect(result.body.tariffs).toEqual([{Тариф:100,ВесОт:0,ОГ:false,SLA:2}]);
  expect(state.fetch).toHaveBeenCalledWith(expect.stringContaining(`/GetClientTariffs/?INN=${inn}`),expect.any(Function));
  expect(result.headers['Cache-Control']).toBe('no-store');
});
it('treats an empty slice as success',async()=>{
  state.fetch.mockResolvedValue({Success:true,ИНН:inn,Тарифы:[]});
  expect((await request()).body.tariffs).toEqual([]);
});
it('rejects a mismatched client or malformed upstream result',async()=>{
  for(const data of [{Success:true,ИНН:'7801234567',Тарифы:[]},{Success:true,ИНН:inn,Тарифы:null},{Success:true,ИНН:inn,Тарифы:[null]}]) {
    state.fetch.mockResolvedValue(data);expect((await request()).status).toBe(502);
  }
});
it('does not disclose upstream error bodies',async()=>{
  state.fetch.mockRejectedValue(new Error('private upstream body'));
  const result=await request();expect(result.status).toBe(502);expect(JSON.stringify(result.body)).not.toContain('private');
});
it('explains that the new method is unavailable rather than displaying an empty slice',async()=>{
  state.fetch.mockImplementation(async (_url,onResponse)=>{await onResponse(404);throw new Error('upstream body');});
  const result=await request();expect(result.status).toBe(502);expect(result.body.error).toContain('GetClientTariffs');
  expect(result.body).not.toHaveProperty('tariffs');
});
it('requires a valid INN and POST',async()=>{
  expect((await request({inn:''})).status).toBe(400);expect(state.fetch).not.toHaveBeenCalled();
  expect((await request({},'GET')).status).toBe(405);
});
