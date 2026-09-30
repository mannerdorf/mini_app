import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
export const publicShells = {home:'/',kalkulyator:'/kalkulyator',faq:'/faq',sklady:'/sklady','o-kompanii':'/o-kompanii',app:'/app',blog:'/blog'};
export function publicCanonicalShells() {
 return {name:'public-canonical-shells',apply:'build',writeBundle(output){
  const html=readFileSync(resolve(output.dir,'index.html'),'utf8');
  mkdirSync(resolve(output.dir,'seo-shells'),{recursive:true});
  for(const [name,path] of Object.entries(publicShells)) {
   const clean=html.replace(/<link\b[^>]*rel=["']canonical["'][^>]*>/gi,'');
   writeFileSync(resolve(output.dir,'seo-shells',name+'.html'),clean.replace('</head>',`<link rel="canonical" href="https://haulz.space${path}" />\n</head>`));
  }
 }};
}
