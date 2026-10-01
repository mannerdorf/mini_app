import type {Pool} from 'pg';
import {publicBlogStyles} from './publicBlogStyles.js';
export const BLOG_PAGE_SIZE=50;
export async function readBlogIndex(pool:Pool,page:number){
 const {rows}=await pool.query(`select distinct on (lower(article_slug)) lower(article_slug) as slug,
 coalesce(nullif(article_title,''),title) as title, meta_description
 from media_published_site_content where status='published'
 and article_slug ~* '^[a-z0-9][a-z0-9_-]{0,120}$'
 and nullif(trim(coalesce(body_markdown,'')),'') is not null
 order by lower(article_slug), id desc limit $1 offset $2`,[BLOG_PAGE_SIZE+1,(page-1)*BLOG_PAGE_SIZE]);
 return {articles:rows.slice(0,BLOG_PAGE_SIZE) as Array<{slug:string;title:string;meta_description:string|null}>,hasNext:rows.length>BLOG_PAGE_SIZE};
}
const escape=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const blogPagePath=(page:number)=>page===1?'/blog':`/blog?page=${page}`;
export function publicBlogIndexHtml(data:Awaited<ReturnType<typeof readBlogIndex>>,page:number){
 const title='Блог HAULZ — логистика Москва ↔ Калининград'+(page>1?` — страница ${page}`:'');
 const description='Статьи о перевозках, тарифах и B2B-логистике между Москвой и Калининградом.';
 const canonical='https://haulz.space'+blogPagePath(page);
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:url" content="${canonical}"><meta property="og:description" content="${description}"><script type="module" src="/public-analytics.js"></script><style>${publicBlogStyles}.articles{display:grid;gap:20px}.articles article{border-bottom:1px solid #d8ddd7;padding-bottom:24px}.pagination{display:flex;gap:24px;flex-wrap:wrap;margin-top:36px}</style></head><body><header><a class="logo" href="/">HAULZ ↗</a><a href="/kalkulyator">Рассчитать доставку</a></header><main><p class="eyebrow">HAULZ · БЛОГ</p><h1>Логистика Москва ↔ Калининград</h1><p class="intro">${description}</p>${page>1?`<p>Страница ${page}</p>`:''}<section class="articles" aria-label="Статьи">${data.articles.length?data.articles.map(a=>`<article><h2><a href="/blog/${a.slug}">${escape(a.title)}</a></h2>${a.meta_description?`<p>${escape(a.meta_description)}</p>`:''}</article>`).join(''):'<p>Пока нет опубликованных материалов. Скоро появятся статьи из медиаплана HAULZ.</p>'}</section><nav class="pagination" aria-label="Страницы блога">${page>1?`<a rel="prev" href="${blogPagePath(page-1)}">← Предыдущая страница</a>`:''}${data.hasNext?`<a rel="next" href="${blogPagePath(page+1)}">Следующая страница →</a>`:''}</nav></main><footer><a href="/">Главная</a><a href="/sklady">Склады</a><a href="/faq">Вопросы и ответы</a></footer></body></html>`;
}
