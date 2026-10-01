import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {GuestHomePage} from '../src/pages/guest/GuestHomePage';
import {GuestFaqPage} from '../src/pages/guest/GuestFaqPage';
import {GuestWarehousesPage} from '../src/pages/guest/GuestWarehousesPage';
import {GuestAppDownloadPage} from '../src/pages/guest/GuestAppDownloadPage';
import {AboutCompanyPage} from '../src/pages/AboutCompanyPage';
import {GuestCalculatorIntro} from '../src/pages/guest/GuestCalculatorIntro';
import {GUEST_PUBLIC_META} from '../src/pages/guest/guestPublicMeta';
const noop=()=>{};
const pages = {
 home:<GuestHomePage onLogin={noop} onAbout={noop} onWarehouses={noop} onFaq={noop} onApp={noop} onCalculator={noop} onBlog={noop} onRouteLanding={noop}/>,
 faq:<GuestFaqPage onBack={noop}/>,
 warehouses:<GuestWarehousesPage onBack={noop}/>,
 about:<AboutCompanyPage onBack={noop} showWarehouses={false}/>,
 app:<GuestAppDownloadPage onBack={noop}/>,
 calculator:<main className="guest-shell min-h-[100dvh]"><GuestCalculatorIntro/></main>,
};
const nav=<nav aria-label="Разделы сайта" className="mx-auto flex max-w-guest flex-wrap gap-4 px-4 py-6"><a href="/">Главная</a><a href="/kalkulyator">Калькулятор</a><a href="/faq">FAQ</a><a href="/sklady">Склады</a><a href="/o-kompanii">О компании</a><a href="/blog">Блог</a><a href="/perevozka-moskva-kaliningrad">Москва → Калининград</a><a href="/perevozka-kaliningrad-moskva">Калининград → Москва</a></nav>;
export function renderPublicPages(){
 return Object.entries(pages).map(([key,page])=>({meta:GUEST_PUBLIC_META[key],body:renderToStaticMarkup(<>{page}{nav}</>)}));
}
