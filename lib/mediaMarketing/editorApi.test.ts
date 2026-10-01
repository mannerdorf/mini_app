import {it,expect,vi} from 'vitest';
vi.mock('../../api/_db.js',()=>({getPool:()=>({query:vi.fn().mockResolvedValue({rows:[]})})}));
vi.mock('../adminAuth.js',()=>({getAdminTokenFromRequest:(r:{headers?:{authorization?:string}})=>r.headers?.authorization,verifyAdminToken:(t:string)=>t==='test-editor',getAdminTokenPayload:()=>({login:'test'})}));
import handler from '../../api/admin-content-editor';
import setup from '../../api/admin-content-setup';
function response(){return {code:200,data:{} as any,setHeader(){},status(c:number){this.code=c;return this;},json(d:unknown){this.data=d;return this;},end(){return this;}};}
it('blocks unauthenticated editor and schema installer',async()=>{for(const h of [handler,setup]){const r=response();await h({method:'POST',headers:{},body:{}} as never,r as never);expect(r.code).toBe(401);}});
it('rejects unsupported mutation methods and invalid request fields',async()=>{for(const [method,body,status] of [['DELETE',{},405],['POST',{title:'T',planned_date:'bad'},400],['PATCH',{id:1,expected_revision:0},400]] as const){const r=response();await handler({method,body,headers:{authorization:'test-editor'},query:{}} as never,r as never);expect(r.code).toBe(status);}});
