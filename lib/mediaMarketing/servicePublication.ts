import {collectFacts} from './factorySources.js';
import {SERVICE_CONTENT,isPublishedService,type ServiceContent} from './serviceContent.js';
/** Every request uses current source evidence; a temporary source outage is not a deletion. */
export async function serviceSourcesCurrent(service:ServiceContent):Promise<boolean>{
 try{return (await collectFacts(service.factIds)).reasons.length===0;}catch{return false;}
}
export async function verifiedServicePaths(now=new Date()):Promise<string[]>{
 const services=SERVICE_CONTENT.filter(s=>isPublishedService(s,now));
 if(!services.length)return [];
 const pack=await collectFacts([...new Set(services.flatMap(s=>s.factIds))],{now});
 if(pack.reasons.length)throw Error('Service source verification unavailable');
 return services.map(s=>`/uslugi/${s.slug}`);
}
