import {describe,it,expect,vi,afterEach} from 'vitest';
import {APPROVED_PILOT} from './approvedPilotContent';
import {SERVICE_CONTENT} from './serviceContent';
import {publicServiceHtml} from './publicServiceHtml';
import {serviceSourcesCurrent,verifiedServicePaths} from './servicePublication';
import {collectFacts} from './factorySources';
import handler from '../../api/public-service-page';
import {publicAnalyticsUrl} from '../../src/lib/publicMetrika';
vi.mock('./factorySources',()=>({collectFacts:vi.fn()}));
afterEach(()=>{vi.useRealTimers();vi.resetAllMocks();});
describe('approved pilot publication',()=>{
 it('services use all approved copy, brand and relevant links; full load requests conditions',()=>{
  for(const page of APPROVED_PILOT.filter(p=>p.canonical_path.startsWith('/uslugi/'))){
   const service=SERVICE_CONTENT.find(s=>'/uslugi/'+s.slug===page.canonical_path)!;
   const html=publicServiceHtml(service);
   expect(html.match(/<h1>/g)).toHaveLength(1);
   expect(html).toContain(page.title);expect(html).toContain(page.answer);
   for(const section of page.sections)expect(html).toContain(section.title);
   expect(html).not.toContain('HAULZ ↗');expect(html).not.toContain('#d4fa65');
   expect(html).toContain('href="https://haulz.space'+page.canonical_path+'"');
   expect(publicAnalyticsUrl('https://haulz.space'+page.canonical_path+'?email=private')).toBe('https://haulz.space'+page.canonical_path);
  }
  const full=publicServiceHtml(SERVICE_CONTENT.find(s=>s.slug==='polnaya-zagruzka')!);
  expect(full).toContain('class="action" href="/sklady"');expect(full).not.toContain('class="action" href="/kalkulyator"');
 });
 it('source conflict or outage blocks service and sitemap without returning a false 404',async()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-02T12:00:00Z'));
  vi.mocked(collectFacts).mockResolvedValue({reasons:['source changed']} as never);
  expect(await serviceSourcesCurrent(SERVICE_CONTENT[0])).toBe(false);
  await expect(verifiedServicePaths()).rejects.toThrow();
  const r={code:200,headers:{} as Record<string,string>,setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.code=n;return this;},end(){return this;},send(){throw Error('Must not publish');}};
  await handler({method:'GET',query:{slug:SERVICE_CONTENT[0].slug}} as never,r as never);
  expect(r.code).toBe(503);expect(r.headers['Cache-Control']).toBe('no-store');
 });
 it('verified sitemap contains four services and expires stale content',async()=>{
  vi.mocked(collectFacts).mockResolvedValue({reasons:[]} as never);
  expect(await verifiedServicePaths(new Date('2026-10-02'))).toHaveLength(4);
  expect(await verifiedServicePaths(new Date('2026-11-02'))).toEqual([]);
 });
});
