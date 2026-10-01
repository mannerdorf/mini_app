import {publicBlogStyles} from "./publicBlogStyles.js";
import type { PublicBlogArticle } from './blogArticles.js';
import { markdownToSafeHtml } from './safePublicMarkdown.js';
const escape = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
export function publicBlogHtml(article: PublicBlogArticle): string {
 const title = escape(article.title); const description = escape(article.meta_description || '');
 const canonical = `https://haulz.space/blog/${encodeURIComponent(article.slug.toLowerCase())}`;
 return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — HAULZ</title><meta name="description" content="${description}"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="article"><script type="module" src="/public-analytics.js"></script><style>${publicBlogStyles}</style></head><body><header><a class="logo" href="/">HAULZ ↗</a><a href="/blog">← Все статьи</a></header><main><article><p class="eyebrow">HAULZ · БЛОГ</p><h1>${title}</h1>${description ? `<p class="intro">${description}</p>` : ''}<div class="body">${markdownToSafeHtml(article.body_markdown)}</div></article><aside class="cta"><p>Москва ↔ Калининград</p><p>Рассчитайте стоимость перевозки вашего груза.</p><a href="/kalkulyator">Рассчитать перевозку ↗</a></aside></main><footer><a href="/">Главная</a><a href="/sklady">Склады</a><a href="/faq">Вопросы и ответы</a></footer></body></html>`;
}
