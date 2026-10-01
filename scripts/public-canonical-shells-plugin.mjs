import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
export const publicShells={home:'/',kalkulyator:'/kalkulyator',faq:'/faq',sklady:'/sklady','o-kompanii':'/o-kompanii',app:'/app',blog:'/blog'};
const escape=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export function publicCanonicalShells(){
 return {name:'public-canonical-shells',apply:'build',async writeBundle(output){
  const bundle=resolve('node_modules/.cache/haulz-public-render.mjs');
  await build({entryPoints:['scripts/render-public-pages.tsx'],outfile:bundle,bundle:true,platform:'node',format:'esm',packages:'external',define:{'import.meta.env':'{}'},logLevel:'silent'});
  let pages;
  try{pages=(await import(pathToFileURL(bundle).href+'?t='+Date.now())).renderPublicPages();}finally{rmSync(bundle,{force:true});}
  const html=readFileSync(resolve(output.dir,'index.html'),'utf8');
  mkdirSync(resolve(output.dir,'seo-shells'),{recursive:true});
  for(const {meta,body} of pages){
   const name=Object.keys(publicShells).find(k=>publicShells[k]===meta.path);
   const canonical='https://haulz.space'+meta.path;
   const clean=html.replace(/<title>[^]*?<\/title>/gi,'').replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'').replace(/<meta\b[^>]*(?:name=["'](?:description|robots|googlebot|yandex)["']|property=["']og:[^"']+["'])[^>]*>/gi,'');
   const structured=meta.jsonLd ? `<script id="haulz-guest-jsonld" type="application/ld+json">${JSON.stringify(meta.jsonLd).replace(/</g,'\\u003c')}</script>` : '';
   const head=`${structured}<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><meta name="robots" content="index, follow"><link rel="canonical" href="${canonical}"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${canonical}"><meta property="og:type" content="website">`;
   if(!clean.includes('<div id="root"></div>'))throw Error('Public prerender: root placeholder missing');
   const destination=name ? resolve(output.dir,'seo-shells',name+'.html') : resolve(output.dir,meta.path.slice(1),'index.html');
   mkdirSync(resolve(destination,'..'),{recursive:true});
   writeFileSync(destination,clean.replace('</head>',head+'\n</head>').replace('<div id="root"></div>',`<div id="root">${body}</div>`).replace('<html lang="ru">','<html lang="ru" class="guest-mode light-mode" data-public-prerender="true">'));
  }
 }};
}
