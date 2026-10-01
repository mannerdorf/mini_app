import React from 'react';
import {APPROVED_PILOT, pilotByPath} from '../../../lib/mediaMarketing/approvedPilotContent';
export function GuestPilotBody({path,questions=true}: {path:string;questions?:boolean}) {
 const page=pilotByPath(path); if(!page)return null;
 return <div className="space-y-8 py-8">
 {page.sections.map(s=><section key={s.id} id={s.id}><h2 className="text-xl font-bold text-[#1f2937]">{s.title}</h2>{s.text.split('\n\n').map((text,i)=><p key={i} className="mt-3 leading-relaxed text-[#4b5563]">{text}</p>)}</section>)}
 {questions && <section><h2 className="text-xl font-bold">Вопросы перед отправкой</h2>{page.questions.map(q=><details key={q.question} className="border-b border-[#e5e7eb] py-4"><summary className="cursor-pointer font-semibold">{q.question}</summary><p className="mt-3 leading-relaxed text-[#4b5563]">{q.answer}</p></details>)}</section>}
 <nav aria-label="Полезные страницы" className="flex flex-wrap gap-4">{page.related_materials.map(id=>{const other=APPROVED_PILOT.find(p=>p.id===id)!;return <a key={id} href={other.canonical_path} className="text-[#2563eb] underline">{other.title}</a>;})}</nav>
 <p className="text-sm text-[#6b7280]">Редакция HAULZ · Проверено 1 октября 2026</p>
 </div>;
}
