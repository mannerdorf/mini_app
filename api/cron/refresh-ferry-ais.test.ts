import {afterEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({query:vi.fn(),release:vi.fn(),request:vi.fn(),auth:vi.fn()}));
vi.mock('../_db.js',()=>({getPool:()=>({connect:async()=>({query:mocks.query,release:mocks.release})})}));
vi.mock('../_lib/cronAuth.js',()=>({requireCronAuth:mocks.auth}));
vi.mock('../../lib/ferryAisCache.js',()=>({requestFerryLatest:mocks.request}));
import handler from './refresh-ferry-ais';
const res=()=>{const r={status:vi.fn(),json:vi.fn()};r.status.mockReturnValue(r);return r;};
afterEach(()=>{vi.resetAllMocks();vi.unstubAllEnvs();});
it('rejects an unauthorised cron before touching DB or AIS',async()=>{
 mocks.auth.mockReturnValue({status:401,error:'Unauthorized'});const r=res();
 await handler({method:'GET'} as any,r as any);
 expect(r.status).toHaveBeenCalledWith(401);expect(mocks.query).not.toHaveBeenCalled();expect(mocks.request).not.toHaveBeenCalled();
});
it('deduplicates in-transit ferries in DB and keeps two-hour cadence',async()=>{
 vi.stubEnv('MARINESIA_API_KEY','test-key');
 mocks.query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{mmsi:'273611990'}]}).mockResolvedValue({rows:[]});
 mocks.request.mockResolvedValue(new Response('{}'));const r=res();
 await handler({method:'GET'} as any,r as any);
 expect(mocks.query.mock.calls[1][0]).toContain('SELECT DISTINCT');
 expect(mocks.query.mock.calls[1][0]).toContain('m.first_ready_at IS NULL');
 expect(mocks.request.mock.calls[0][2]).toBe(7200000);
 expect(r.status).toHaveBeenCalledWith(200);expect(mocks.release).toHaveBeenCalledOnce();
});
it('releases the lock and reports source failures without claiming fresh AIS',async()=>{
 vi.stubEnv('MARINESIA_API_KEY','test-key');
 mocks.query.mockResolvedValueOnce({rows:[{locked:true}]}).mockResolvedValueOnce({rows:[{mmsi:'273611990'}]}).mockResolvedValue({rows:[]});
 mocks.request.mockRejectedValue(new Error('offline'));const r=res();
 await handler({method:'GET'} as any,r as any);
 expect(r.status).toHaveBeenCalledWith(502);
 expect(mocks.query.mock.calls.at(-1)?.[0]).toContain('pg_advisory_unlock');expect(mocks.release).toHaveBeenCalledOnce();
});
