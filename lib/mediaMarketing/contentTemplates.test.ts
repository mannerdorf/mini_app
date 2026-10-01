import {describe,it,expect,vi,afterEach,beforeEach} from 'vitest';
import {SERVICE_CONTENT,isPublishedService,publishedServicePaths} from './serviceContent';
import {publicServiceHtml} from './publicServiceHtml';
import {publicBlogHtml} from './publicBlogHtml';
import handler from '../../api/public-service-page';
import {staticSitemapPaths} from './sitemapDocuments';
const date = new Date('2026-10-02T12:00:00Z');
function response(){return {code:200,headers:{} as Record<string,string>,body:'',setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.code=n;return this;},send(v:string){this.body=v;return this;},end(){return this;}};}
const originalService = SERVICE_CONTENT[0];
beforeEach(()=>{SERVICE_CONTENT[0]={...originalService,status:'draft',approvedAt:undefined};});
afterEach(()=>{SERVICE_CONTENT[0]=originalService;vi.useRealTimers();});
describe('service publication boundary',()=>{
 it('drafts are absent from route and sitemap even with preview query',()=>{
  expect(publishedServicePaths(date)).toEqual([]);expect(staticSitemapPaths(date)).not.toContain('/uslugi/sbornye-gruzy');
  for(const slug of ['sbornye-gruzy','missing','../sbornye-gruzy',['sbornye-gruzy']]){const r=response();handler({method:'GET',query:{slug,preview:'true'}} as never,r as never);expect(r.code).toBe(404);expect(r.body).toBe('');expect(r.headers['X-Robots-Tag']).toBe('noindex');}
 });
 it('requires approval, valid dates and a current fact review',()=>{
  const approved={...SERVICE_CONTENT[0],status:'approved' as const,approvedAt:'2026-10-01'};
  expect(isPublishedService(approved,date)).toBe(true);
  expect(isPublishedService(approved,new Date('2026-11-01'))).toBe(false);
  expect(isPublishedService({...approved,approvedAt:'2026-10-03'},date)).toBe(false);
  expect(isPublishedService({...approved,approvedAt:undefined},date)).toBe(false);
  expect(isPublishedService({...approved,validUntil:'2026-02-31'},date)).toBe(false);
 });
 it('serves approved content without JS and supports HEAD, but never POST',()=>{
  vi.useFakeTimers();vi.setSystemTime(date); const original=SERVICE_CONTENT[0];
  SERVICE_CONTENT[0]={...original,status:'approved',approvedAt:'2026-10-01'};
  try {for(const method of ['GET','HEAD','POST']){const r=response();handler({method,query:{slug:original.slug}} as never,r as never);expect(r.code).toBe(method==='POST'?405:200);if(method==='GET'){expect(r.body).toContain('<h1>');expect(r.body).toContain('application/ld+json');expect(r.body).toContain('href="/kalkulyator"');}else expect(r.body).toBe('');}expect(staticSitemapPaths(date)).toContain('/uslugi/sbornye-gruzy');}finally{SERVICE_CONTENT[0]=original;}
 });
});
it('draft preview is labelled, noindex, without analytics or structured publication signals',()=>{
 const html=publicServiceHtml(SERVICE_CONTENT[0],true);expect(html).toContain('Черновик для согласования');expect(html).toContain('noindex, nofollow');expect(html).not.toContain('public-analytics');expect(html).not.toContain('application/ld+json');expect(html).not.toContain('rel="canonical"');
});
it('escapes service content and JSON-LD script terminators',()=>{
 const html=publicServiceHtml({...SERVICE_CONTENT[0],title:'</script><script>alert(1)</script>'});expect(html).not.toContain('<script>alert(1)');expect(html).toContain('\\u003c/script>');expect(html).toContain('&lt;/script&gt;');
});
it('article template renders accessible contents and a valid date, omits invented bylines',()=>{
 const html=publicBlogHtml({slug:'test',title:'Заголовок',meta_description:'Ответ',body_markdown:'## Первое\nТекст\n\n## Второе\nТекст',published_at:'2026-10-01T12:00:00Z'} as never);
 expect(html).toContain('href="#section-1"');expect(html).toContain('<h2 id="section-1">Первое</h2>');expect(html).toContain('datePublished');expect(html).not.toContain('"author"');expect(html).toContain('href="/kalkulyator"');
 const draft=publicBlogHtml({slug:'draft',title:'Черновик',meta_description:'Ответ',body_markdown:'Текст',published_at:''} as never,true);expect(draft).not.toContain('Invalid Date');expect(draft).not.toContain('application/ld+json');
});
