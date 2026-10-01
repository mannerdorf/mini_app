import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const registry=JSON.parse(readFileSync('docs/facts/haulz-facts-2026-10-01.json','utf8'));
const references=[...new Set(registry.facts.flatMap(f=>f.sources.map(s=>s.reference)).filter(p=>p.startsWith('src/')))];
const sources=Object.fromEntries(references.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
writeFileSync('public/content-source-manifest.json',JSON.stringify({version:1,built_at:new Date().toISOString(),sources},null,2)+'\n');
