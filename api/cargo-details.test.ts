import {beforeEach,expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({query:vi.fn(),verify:vi.fn(),read:vi.fn(),service:vi.fn()}));
vi.mock('./_db.js',()=>({getPool:()=>({query:state.query})}));
vi.mock('../lib/verifyRegisteredUser.js',()=>({verifyRegisteredUser:state.verify}));
vi.mock('../lib/documentCacheRead.js',()=>({readPerevozkiByNumbersFromCache:state.read}));
vi.mock('../lib/serviceRefreshFrom1c.js',()=>({authorizeServiceRefreshFrom1c:state.service}));
vi.mock('../lib/pickup/cargoPhotoIndicator.js',()=>({annotateCargoPickupPhotos:async(_:unknown,items:unknown[])=>items}));
vi.mock('../lib/pickup/cargoLastMile.js',()=>({annotateCargoLastMile:async(_:unknown,items:unknown[])=>items}));
import handler from './cargo-details';
const owned={Number:'000141598',INN:'7820046291',DatePrih:'2026-08-11',State:'В пути',Sum:'30891',Customer:'АВТОПИТЕР ООО'};
const foreign={Number:'000141960',INN:'390523053764'};
async function call(extra={}) {
 const res:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};res.status.mockReturnValue(res);
 await handler({method:'POST',headers:{},body:{login:'user',password:'fixture',numbers:['141598','141960'],...extra}} as any,res);
 return res;
}
beforeEach(()=>{
 vi.clearAllMocks();state.verify.mockResolvedValue({inn:owned.INN,accessAllInns:false});state.read.mockResolvedValue([owned,foreign]);
 state.service.mockResolvedValue({ok:false,status:403,error:'Нет права служебного режима'});
 state.query.mockImplementation(async(sql:string)=>({rows:sql.includes('registered_users')?[{login:'user'}]:[]}));
});
it('returns authorized cargo outside the selected period with all cached fields',async()=>{
 const res=await call({dateFrom:'2026-10-01',dateTo:'2026-10-31'});
 expect(res.status).toHaveBeenCalledWith(200);expect(res.json).toHaveBeenCalledWith({items:[owned]});
});
it('allows sender or receiver access and rejects unrelated cargo',async()=>{
 state.read.mockResolvedValue([{...foreign,ReceiverINN:owned.INN},foreign]);
 expect((await call()).json).toHaveBeenCalledWith({items:[{...foreign,ReceiverINN:owned.INN}]});
});
it('does not trust the service flag or browser INN',async()=>{
 expect((await call({serviceMode:true,inn:foreign.INN})).status).toHaveBeenCalledWith(403);
 expect(state.read).not.toHaveBeenCalled();
});
it('returns cross-customer details to an authorized service user',async()=>{
 state.service.mockResolvedValue({ok:true});
 expect((await call({serviceMode:true})).json).toHaveBeenCalledWith({items:[owned,foreign]});
});
it('rejects bad credentials and oversized or malformed batches',async()=>{
 state.verify.mockResolvedValue(null);expect((await call()).status).toHaveBeenCalledWith(401);expect(state.read).not.toHaveBeenCalled();
 expect((await call({numbers:Array(201).fill('1')})).status).toHaveBeenCalledWith(400);
 expect((await call({numbers:['tracking-invalid']})).status).toHaveBeenCalledWith(400);
});
