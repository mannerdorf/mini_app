import {pilotByPath} from "../../../lib/mediaMarketing/approvedPilotContent";
import React from 'react';

export function GuestCalculatorIntro() {
  return <section className="mx-auto max-w-guest px-4 py-6 sm:px-6 lg:px-8">
    <h1 className="text-2xl font-bold text-[#111827]">{pilotByPath('/kalkulyator')!.title}</h1>
    <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">{pilotByPath('/kalkulyator')!.answer}</p>
    <noscript><p className="mt-4">Для интерактивного расчёта включите JavaScript. Вы также можете <a href="/sklady">связаться со складом HAULZ</a> и уточнить условия доставки.</p></noscript>
  </section>;
}
