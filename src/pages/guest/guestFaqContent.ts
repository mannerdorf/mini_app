import {pilotByPath} from '../../../lib/mediaMarketing/approvedPilotContent';
export type GuestFaqItem = {q:string;a:string};
export const GUEST_FAQ_ITEMS: GuestFaqItem[] = pilotByPath('/faq')!.questions.map(q=>({q:q.question,a:q.answer}));
