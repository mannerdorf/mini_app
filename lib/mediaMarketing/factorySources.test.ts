import {it,expect} from 'vitest';
import {collectFacts,hash,resultIssues,type Fact} from './factorySources';
const now=new Date('2026-10-01T08:00:00Z');
const fact:Fact={id:'route',claim:'Доступно направление',value:null,status:'owner_confirmed',valid_until:'2026-10-31',limits:'Без числовых обещаний',sources:[{reference:'lib/example.ts',sha256:hash('source')}]};
const opts={now,load:async()=>({facts:[fact]}),read:async()=>'source'};
it('collects immutable source evidence with a checksum',async()=>{const p=await collectFacts(['route'],opts);expect(p.reasons).toEqual([]);expect(p.sources[0].actual).toBe(hash('source'));expect(p.registry_hash).toHaveLength(64);});
it('holds missing, conflicting, changed and expired sources',async()=>{
 expect((await collectFacts(['route'],{...opts,read:async()=>{throw Error('offline');}})).reasons.join()).toContain('недоступен');
 expect((await collectFacts(['route'],{...opts,read:async()=>'changed'})).reasons.join()).toContain('изменился');
 expect((await collectFacts(['route'],{...opts,load:async()=>({facts:[fact,fact]})})).reasons.join()).toContain('конфликт');
 expect((await collectFacts(['route'],{...opts,now:new Date('2026-11-01')})).reasons.join()).toContain('истёк');
 expect((await collectFacts(['missing'],opts)).reasons).not.toEqual([]);
});
it('never reads arbitrary URLs, traversal or unconfirmed facts as trusted',async()=>{
 for(const reference of ['https://127.0.0.1/private','../../.env']){let read=false;const p=await collectFacts(['route'],{...opts,load:async()=>({facts:[{...fact,sources:[{reference,sha256:hash('source')}]}]}),read:async()=>{read=true;return 'source';}});expect(read).toBe(false);expect(p.reasons.length).toBeGreaterThan(0);}
 const p=await collectFacts(['route'],{...opts,load:async()=>({facts:[{...fact,status:'not_approved'}]})});expect(p.reasons.join()).toContain('нет подтверждения');
});
it('holds promises in all channel texts, not only article body',async()=>{const p=await collectFacts(['route'],opts);expect(resultIssues({body_markdown:'## Ответ\nДоступное направление',telegram_teaser:'Гарантированно за 2 дня и 1000 рублей'},p).length).toBeGreaterThan(0);expect(resultIssues({body_markdown:'## Ответ\nУкажите груз и направление.'},p)).toEqual([]);});
it('current approved production route facts are readable and match recorded hashes',async()=>{expect((await collectFacts(['service.route','service.door'],{now})).reasons).toEqual([]);});
it('uses the actual deployed frontend manifest rather than an outdated API checkout',async()=>{
 const f={...fact,sources:[{reference:'src/pages/example.tsx',sha256:hash('frontend')}]};const load=async()=>({facts:[f]});
 expect((await collectFacts(['route'],{now,load,frontend:async()=>({'src/pages/example.tsx':hash('frontend')})})).reasons).toEqual([]);
 expect((await collectFacts(['route'],{now,load,frontend:async()=>({'src/pages/example.tsx':hash('changed')})})).reasons.join()).toContain('изменился');
 expect((await collectFacts(['route'],{now,load,frontend:async()=>{throw Error('offline');}})).reasons.join()).toContain('недоступен');
});
