import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({query:vi.fn(),verify:vi.fn(),read:vi.fn()}));
vi.mock('./_db.js',()=>({getPool:()=>({query:state.query})}));
vi.mock('../lib/verifyRegisteredUser.js',()=>({verifyRegisteredUser:state.verify}));
vi.mock('../lib/documentCacheRead.js',()=>({readPerevozkiByNumbersFromCache:state.read}));
import handler from './cargo-ferry';
const cargo={Number:'000142978',INN:'7710431565'};
const ferry={id:1,name:'FESCO NOVIK',mmsi:'273329660',own:false};
let matches:any[]=[];
async function call(extra={}) {
 const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
 await handler({method:'POST',headers:{},body:{login:'user',password:'fixture',number:cargo.Number,customerInn:cargo.INN,...extra}} as any,res);
 return res;
}
beforeEach(()=>{
 vi.clearAllMocks();matches=[ferry];state.verify.mockResolvedValue({inn:cargo.INN,accessAllInns:false});state.read.mockResolvedValue([cargo]);
 state.query.mockImplementation(async(sql:string)=>({rows:sql.includes('registered_users')?[{login:'user'}]:sql.includes('sendings_metrics')?matches:[]}));
});
it('resolves the selected vessel from server cargo links and customer scope',async()=>{
 const res=await call({ferryId:99});expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith({ferry:{id:1,name:ferry.name,mmsi:ferry.mmsi}});
 expect(state.query.mock.calls.find(([sql])=>sql.includes('sendings_metrics'))?.[1]).toEqual([cargo.Number,'user']);
});
it('rejects forged service mode and foreign cargo before reading ferry assignments',async()=>{
 state.verify.mockResolvedValue({inn:'999',accessAllInns:false});expect((await call({serviceMode:true})).status).toHaveBeenCalledWith(404);
 expect(state.query.mock.calls.some(([sql])=>sql.includes('sendings_metrics'))).toBe(false);
});
it('rejects bad credentials and ambiguous cargo',async()=>{
 state.verify.mockResolvedValue(null);expect((await call()).status).toHaveBeenCalledWith(401);expect(state.read).not.toHaveBeenCalled();
 state.verify.mockResolvedValue({inn:cargo.INN,accessAllInns:false});state.read.mockResolvedValue([cargo,cargo]);expect((await call()).status).toHaveBeenCalledWith(404);
});
it('does not guess between conflicting vessel assignments',async()=>{
 matches=[ferry,{...ferry,id:2}];expect((await call()).status).toHaveBeenCalledWith(409);
 matches=[ferry,{...ferry,id:2,own:true}];expect((await call()).json).toHaveBeenCalledWith({ferry:{id:2,name:ferry.name,mmsi:ferry.mmsi}});
});
it('returns no vessel when the cargo has no ferry assignment',async()=>{
 matches=[];expect((await call()).json).toHaveBeenCalledWith({ferry:null});
});
