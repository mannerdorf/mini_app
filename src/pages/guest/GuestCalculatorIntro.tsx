import React from 'react';

export function GuestCalculatorIntro() {
  return <section className="mx-auto max-w-guest px-4 py-6 sm:px-6 lg:px-8">
    <h1 className="text-2xl font-bold text-[#111827]">Калькулятор перевозки Москва ↔ Калининград</h1>
    <p className="mt-3 text-sm leading-relaxed text-[#6b7280]">Выберите направление, укажите вес, размеры и количество мест. Сравните стоимость и сроки доставки авто, паромом и авиа. Можно указать адрес забора и доставки или выбрать перевозку между складами.</p>
    <p className="mt-2 text-sm text-[#6b7280]">Расчёт предварительный. Итоговые условия перевозки согласовываются при оформлении заявки.</p>
    <noscript><p className="mt-4">Для интерактивного расчёта включите JavaScript. Вы также можете <a href="/sklady">связаться со складом HAULZ</a> и уточнить условия доставки.</p></noscript>
  </section>;
}
