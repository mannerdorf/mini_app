import {htmlEscape, jsonLdScript, displayDate} from './contentHtml.js';
import {publicBlogStyles} from "./publicBlogStyles.js";
import type { PublicBlogArticle } from './editorPublicArticles.js';
import { markdownToSafeHtml } from './safePublicMarkdown.js';
const escape = htmlEscape;
export function publicBlogHtml(article: PublicBlogArticle, preview = false): string {
 const title = escape(article.title); const description = escape(article.meta_description || '');
 const canonical = `https://haulz.space/blog/${encodeURIComponent(article.slug.toLowerCase())}`;
 const date = displayDate(article.published_at);
 const toc: {id: string; title: string}[] = [];
 const body = markdownToSafeHtml(article.body_markdown).replace(/<h2>(.*?)<\/h2>/g, (_, title: string) => {
   const id = `section-${toc.length + 1}`;
   toc.push({id, title}); return `<h2 id="${id}">${title}</h2>`;
 });
 const schema = { '@context':'https://schema.org', '@type':'Article', headline:article.title,
   description:article.meta_description || undefined, mainEntityOfPage:canonical,
   publisher:{'@type':'Organization', name:'HAULZ', url:'https://haulz.space/'},
   ...(date ? {datePublished:new Date(article.published_at).toISOString()} : {}) };
 const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — HAULZ</title><meta name="description" content="${description}">${preview ? '<meta name="robots" content="noindex, nofollow">' : `<link rel="canonical" href="${canonical}">${jsonLdScript(schema)}`}<meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="article">${preview ? '' : '<script type="module" src="/public-analytics.js"></script>'}<style>${publicBlogStyles}</style></head><body>${preview ? '<div style="padding:14px;text-align:center;background:#fff2c7">Черновик для согласования · на сайте не опубликован</div>' : ''}<header><a class="logo" href="/">HAULZ ↗</a><a href="/blog">← Все статьи</a></header><main><article><p class="eyebrow">HAULZ · БЛОГ</p><h1>${title}</h1>${article.author_name ? `<p>Автор: ${escape(article.author_name)}</p>` : ''}${date && !preview ? `<p class="eyebrow">Опубликовано ${escape(date)}</p>` : ''}${description ? `<p class="intro">${description}</p>` : ''}${toc.length > 1 ? `<nav aria-label="Содержание статьи"><h2>В этом материале</h2><ul>${toc.map(s => `<li><a href="#${s.id}">${s.title.replace(/<[^>]*>/g, '')}</a></li>`).join('')}</ul></nav>` : ''}<div class="body">${body}</div></article><aside class="cta"><p>Москва ↔ Калининград</p><p>Рассчитайте стоимость перевозки вашего груза.</p><a href="/kalkulyator">Рассчитать перевозку ↗</a></aside></main><footer><a href="/">Главная</a><a href="/sklady">Склады</a><a href="/faq">Вопросы и ответы</a></footer></body></html>`;
 return preview ? html.replace(/href="\/(?!\/)/g, 'href="https://haulz.space/') : html;
}
