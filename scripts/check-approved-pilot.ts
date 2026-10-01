import {readFile} from 'node:fs/promises';
import {APPROVED_PILOT} from '../lib/mediaMarketing/approvedPilotContent.js';
import {collectFacts,hash} from '../lib/mediaMarketing/factorySources.js';
const pack=JSON.parse(await readFile('docs/pilot/t09-2026-10-01.json','utf8'));
if(!pack.owner_approved||pack.status!=='owner_approved')throw Error('Pilot needs owner approval');
const registry=JSON.parse(await readFile('docs/facts/haulz-facts-2026-10-01.json','utf8'));
const frontend=Object.fromEntries(await Promise.all([...new Set<string>(registry.facts.flatMap((f:any)=>f.sources.map((s:any)=>s.reference)).filter((p:any)=>p.startsWith('src/')))].map(async path=>[path,hash(await readFile(path,'utf8'))])));
for(const page of APPROVED_PILOT){
 const approved=pack.materials.find((m:any)=>m.id===page.id);
 for(const key of Object.keys(page))if(JSON.stringify(approved[key])!==JSON.stringify(page[key as keyof typeof page]))throw Error(`${page.id}: unapproved content drift in ${key}`);
 const evidence=await collectFacts(page.fact_ids,{frontend:async()=>frontend});
 if(evidence.reasons.length)throw Error(`${page.id}: ${evidence.reasons.join('; ')}`);
}
console.log('8 approved pilot materials: content and source hashes verified');
