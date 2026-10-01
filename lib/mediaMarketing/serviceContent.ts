import { APPROVED_PILOT } from "./approvedPilotContent.js";
/** Reviewed service content is separate from editorial articles and CMS news. */
export type ServiceContent = {
  seoTitle?: string; related?: {path:string;title:string}[]; cta?: {path:string;label:string};
  slug: string; title: string; description: string; answer: string;
  status: 'draft' | 'approved'; approvedAt?: string; reviewedAt: string; validUntil: string;
  factIds: string[];
  sections: { id: string; title: string; text: string }[];
  questions: { question: string; answer: string }[];
};
export const SERVICE_CONTENT: ServiceContent[] = APPROVED_PILOT.filter(p => p.canonical_path.startsWith('/uslugi/')).map(p => ({
 slug: p.canonical_path.split('/').pop()!, title: p.title, seoTitle: p.seo_title,
 description: p.description, answer: p.answer, status: 'approved', approvedAt: '2026-10-01',
 reviewedAt: p.reviewed_at, validUntil: p.valid_until, factIds: p.fact_ids,
 sections: p.sections, questions: p.questions,
 related: p.related_materials.map(id => APPROVED_PILOT.find(other => other.id === id)!).map(other => ({path: other.canonical_path,title: other.title})),
 cta: p.id === 'P06' ? {path:'/sklady',label:'Обсудить условия полной загрузки'} : {path:'/kalkulyator',label:'Рассчитать перевозку'},
}));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
function validDate(value: string): boolean {
  const date = new Date(value);
  return datePattern.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isPublishedService(service: ServiceContent, now = new Date()): boolean {
  const today = now.toLocaleDateString('sv-SE', {timeZone: 'Europe/Moscow'});
  return service.status === 'approved' && !!service.approvedAt &&
    [service.approvedAt, service.reviewedAt, service.validUntil].every(validDate) &&
    service.approvedAt <= today && service.reviewedAt <= today && today <= service.validUntil &&
    service.reviewedAt <= service.validUntil;
}
export function publishedServicePaths(now = new Date()): string[] {
  return SERVICE_CONTENT.filter(s => isPublishedService(s, now)).map(s => `/uslugi/${s.slug}`);
}
