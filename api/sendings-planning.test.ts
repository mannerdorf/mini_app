import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({verify:vi.fn(),query:vi.fn(),read:vi.fn(),save:vi.fn(),remove:vi.fn(),reconcile:vi.fn(),superAdmin:false}));
vi.mock('./_db.js',()=>({getPool:()=>({query:state.query})}));
vi.mock('../lib/verifyRegisteredUser.js',()=>({verifyRegisteredUser:state.verify}));
vi.mock('../lib/adminDocumentCacheAccess.js',()=>({getSuperAdminRequestContext:()=>({}),isVerifiedSuperAdmin:()=>state.superAdmin}));
vi.mock('../lib/sendingPlanning.js',async original=>({...await original<typeof import('../lib/sendingPlanning')>(),readSendingPlans:state.read,saveSendingPlan:state.save,deleteSendingPlan:state.remove}));
vi.mock('../lib/sendingPlanningReconciliation.js',()=>({chooseSendingPlanFact:state.reconcile,reconcileSendingPlans:vi.fn()}));
import handler from './sendings-planning';
async function call(body:any,method='POST'){
 const result={status:200,body:null as any};const res:any={setHeader:vi.fn(),status(code:number){result.status=code;return res;},json(body:any){result.body=body;return res;}};
 await handler({headers:{},method,body} as any,res);return result;
}
beforeEach(()=>{vi.clearAllMocks();state.superAdmin=false;state.verify.mockResolvedValue({});state.query.mockResolvedValue({rows:[{permissions:{haulz:true}}]});state.read.mockResolvedValue({plans:[],available:[],ferries:[]});state.save.mockResolvedValue('fixture-id');state.remove.mockResolvedValue(undefined);});
it('checks authenticated server permissions for every action',async()=>{
 for(const action of ['list','save','delete','reconcile']){
  state.verify.mockResolvedValue(null);expect((await call({action})).status).toBe(401);
  state.verify.mockResolvedValue({});state.query.mockResolvedValue({rows:[{permissions:{haulz:'true',eor:false}}]});
  expect((await call({action,permissions:{haulz:true},serviceMode:true,isSuperAdmin:true})).status).toBe(403);
 }
 expect(state.read).not.toHaveBeenCalled();expect(state.save).not.toHaveBeenCalled();expect(state.remove).not.toHaveBeenCalled();expect(state.reconcile).not.toHaveBeenCalled();
});
it('allows employees with planning rights and dispatches only the requested operation',async()=>{
 expect((await call({action:'list',from:'2026-10-01',to:'2026-11-01'})).status).toBe(200);
 const plan={comment:'Без передачи в 1С'};expect((await call({action:'save',plan,login:' STAFF '})).body).toEqual({id:'fixture-id'});
 expect(state.save).toHaveBeenCalledWith(expect.anything(),plan,'staff');
 await call({action:'delete',id:'id',revision:2});expect(state.remove).toHaveBeenCalledWith(expect.anything(),'id',2);
 await call({action:'reconcile',id:'id',revision:2,sendingKey:'source-key',cargoNumbers:['forged'],login:' STAFF '});expect(state.reconcile).toHaveBeenCalledWith(expect.anything(),'id',2,'source-key','staff');
});
it('validates requests and reports missing deployment without disclosing private errors',async()=>{
 expect((await call('{')).status).toBe(400);expect((await call([], 'POST')).status).toBe(400);expect((await call({},'GET')).status).toBe(405);
 state.read.mockRejectedValue({code:'42P01'});expect((await call({action:'list'})).status).toBe(503);
 state.read.mockRejectedValue(new Error('private credentials'));const result=await call({action:'list'});expect(result.status).toBe(500);expect(JSON.stringify(result.body)).not.toContain('private credentials');
});
