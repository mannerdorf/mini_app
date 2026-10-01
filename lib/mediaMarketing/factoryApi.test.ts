import {it,expect,vi} from 'vitest';
vi.mock('../../api/_db.js',()=>({getPool:()=>({query:vi.fn()})}));
vi.mock('../adminAuth.js',()=>({getAdminTokenFromRequest:(r:any)=>r.headers?.authorization,verifyAdminToken:(s:string)=>s==='test',getAdminTokenPayload:()=>({login:'test'})}));
import editor from '../../api/admin-factory-editor';
import queue from '../../api/admin-content-factory';
import setup from '../../api/admin-factory-setup';
function response(){const r:any={statusCode:0,payload:null,setHeader:vi.fn(),status(n:number){r.statusCode=n;return r;},json(d:unknown){r.payload=d;return r;},end(){return r;}};return r;}
it('all factory APIs reject unauthenticated requests',async()=>{for(const h of [editor,queue,setup]){const r=response();await h({method:'POST',headers:{},query:{},body:{action:'run'}} as any,r);expect(r.statusCode).toBe(401);}});
it('legacy synchronous generation and generated-body bypass are rejected',async()=>{for(const action of ['generate','generated']){const r=response();await editor({method:'PATCH',headers:{authorization:'test'},query:{},body:{action}} as any,r);expect(r.statusCode).toBe(422);}});
it('queue accepts no arbitrary operation',async()=>{const r=response();await queue({method:'POST',headers:{authorization:'test'},query:{},body:{action:'enable_paid_generation'}} as any,r);expect(r.statusCode).toBe(400);});
