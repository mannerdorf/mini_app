import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import type {Pool} from 'pg';
const state=vi.hoisted(()=>({pool:null as unknown}));
vi.mock('../../api/_db.js',()=>({getPool:()=>state.pool}));
import sitemapHandler from '../../api/sitemap';
import blogHandler from '../../api/public-blog-page';
import {countSitemapArticles,sitemapArticlePaths,sitemapIndex} from './sitemapDocuments';
import {publicBlogHtml} from './publicBlogHtml';
let db:PGlite;let pool:Pool;
beforeAll(async()=>{
 db=new PGlite();pool={query:(sql:string,params?:unknown[])=>db.query(sql,params)} as Pool;state.pool=pool;
 await db.exec(`create table media_content_plans(id serial,article_slug text,article_title text,title text,meta_description text,published_at timestamptz,planned_date date,channels jsonb,body_markdown text,telegram_teaser text,status text);
 insert into media_content_plans(article_slug,title,body_markdown,status) select 'article-' || lpad(i::text,4,'0'),'Article '||i,'## Heading\nContent','published' from generate_series(1,1005) i;
 insert into media_content_plans(article_slug,title,body_markdown,status) values ('draft','Draft','Private draft','draft'),('empty','Empty','  ','published'),('bad slug','Invalid','Text','published');`);
},30000);
afterAll(async()=>{await db.close();});
function response(){const r={code:200,headers:{} as Record<string,string>,body:'',setHeader(k:string,v:string){this.headers[k]=v;},status(n:number){this.code=n;return this;},send(v:string){this.body=v;return this;},end(){return this;}};return r;}
it('includes published URLs beyond 100 with disjoint bounded pages; excludes drafts and empty bodies',async()=>{expect(await countSitemapArticles(pool)).toBe(1005);const a=await sitemapArticlePaths(pool,1),b=await sitemapArticlePaths(pool,2);expect(a).toHaveLength(1000);expect(b).toHaveLength(5);expect(new Set([...a,...b]).size).toBe(1005);expect(b).toContain('/blog/article-1005');expect(sitemapIndex(1005)).toContain('page=2');});
it('serves complete article HTML without JS and only returns 404 for missing/unpublished content',async()=>{
 for(const slug of ['draft','empty','missing']){const r=response();await blogHandler({method:'GET',query:{slug}} as never,r as never);expect(r.code).toBe(404);}
 const r=response();await blogHandler({method:'GET',query:{slug:'article-1005'}} as never,r as never);expect(r.code).toBe(200);expect(r.body).toContain('<h1>Article 1005</h1>');expect(r.body).toContain('<h2 id="section-1">Heading</h2>');expect(r.body).toContain('rel="canonical" href="https://haulz.space/blog/article-1005"');
});
it('does not turn database failures into 404 or incomplete successful sitemaps',async()=>{state.pool={query:()=>Promise.reject(new Error('offline'))};try{for(const handler of [blogHandler,sitemapHandler]){const r=response();await handler({method:'GET',query:{slug:'article-1005'}} as never,r as never);expect(r.code).toBe(503);expect(r.headers['Cache-Control']).toBe('no-store');}}finally{state.pool=pool;}});
it('validates sitemap page and supports HEAD',async()=>{const invalid=response();await sitemapHandler({method:'GET',query:{page:'-1'}} as never,invalid as never);expect(invalid.code).toBe(400);const r=response();await blogHandler({method:'HEAD',query:{slug:'article-1005'}} as never,r as never);expect(r.code).toBe(200);expect(r.body).toBe('');});
it('escapes metadata and markdown attribute injection',()=>{const html=publicBlogHtml({slug:'safe',title:'<script>alert(1)</script>',meta_description:'" onload="bad',body_markdown:'[link](https://example.com/"onmouseover="alert(1))\n<script>bad</script>'} as never);expect(html).not.toContain('<script>alert');expect(html).not.toContain(' onmouseover="');expect(html).toContain('&lt;script&gt;bad&lt;/script&gt;');});

import indexHandler from '../../api/public-blog-index';
import {readBlogIndex,publicBlogIndexHtml} from './publicBlogIndex';
it('paginates readable blog links beyond the first 50 and excludes unpublished content',async()=>{
 const first=await readBlogIndex(pool,1),last=await readBlogIndex(pool,21);
 expect(first.articles).toHaveLength(50);expect(first.hasNext).toBe(true);
 expect(last.articles).toHaveLength(5);expect(last.hasNext).toBe(false);
 const html=publicBlogIndexHtml(first,1);
 expect(html).toContain('href="/blog/article-0001"');expect(html).toContain('href="/blog?page=2"');
 expect(html).not.toContain('Private draft');expect(html).not.toContain('bad slug');
 expect(publicBlogIndexHtml(last,21)).toContain('rel="canonical" href="https://haulz.space/blog?page=21"');
});
it('distinguishes empty, missing and failing blog index pages',async()=>{
 const missing=response();await indexHandler({method:'GET',query:{page:'22'}} as never,missing as never);expect(missing.code).toBe(404);
 const invalid=response();await indexHandler({method:'GET',query:{page:'0'}} as never,invalid as never);expect(invalid.code).toBe(400);
 const head=response();await indexHandler({method:'HEAD',query:{}} as never,head as never);expect(head.code).toBe(200);expect(head.body).toBe('');
 state.pool={query:()=>Promise.reject(new Error('offline'))};try{const r=response();await indexHandler({method:'GET',query:{}} as never,r as never);expect(r.code).toBe(503);expect(r.headers['Cache-Control']).toBe('no-store');}finally{state.pool=pool;}
});
