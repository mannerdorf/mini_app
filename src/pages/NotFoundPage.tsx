import React, { useEffect } from "react";
import { notFoundStyles } from "./notFoundStyles";

type NotFoundPageProps = { onGoHome?: () => void; onSearch?: (query: string) => void };

/** Also rendered at build time as the nginx error document. */
export function NotFoundView({ onGoHome }: NotFoundPageProps) {
  return <div className="hz404">
    <style>{notFoundStyles}</style>
    <header className="hz404-header">
      <a className="hz404-logo" href="/" aria-label="HAULZ — главная">HAULZ<span>↗</span></a>
      <span className="hz404-header-label">ЛОГИСТИКА. В НУЖНОМ НАПРАВЛЕНИИ.</span>
      <a className="hz404-contact" href="/faq">Нужна помощь? <span aria-hidden="true">↗</span></a>
    </header>
    <main className="hz404-main">
      <section className="hz404-copy" aria-labelledby="hz404-title">
        <p className="hz404-eyebrow"><span aria-hidden="true" /> ОШИБКА 404 · СТРАНИЦА НЕ НАЙДЕНА</p>
        <h1 id="hz404-title">Кажется, этот<br />маршрут ещё<br /><em>не проложен.</em></h1>
        <p className="hz404-description">Страница переехала или адрес оказался неточным. Вернёмся туда, где всё на своём месте.</p>
        <div className="hz404-actions">
          <a className="hz404-primary" href="/" onClick={onGoHome ? (event) => { event.preventDefault(); onGoHome(); } : undefined}>На главную <span aria-hidden="true">↗</span></a>
          <a className="hz404-secondary" href="/kalkulyator">Рассчитать перевозку <span aria-hidden="true">→</span></a>
        </div>
        <p className="hz404-note">Адрес потерялся. Ваш груз — нет.</p>
      </section>
      <div className="hz404-map" aria-hidden="true">
        <div className="hz404-map-top"><span>HAULZ / ROUTE MAP</span><span className="hz404-live">В ПОИСКЕ ПУТИ</span></div>
        <div className="hz404-number">4<span>0</span>4</div>
        <svg className="hz404-route" viewBox="0 0 600 500" fill="none">
          <path className="hz404-track" d="M75 380 H160 Q200 380 200 340 V270 Q200 230 240 230 H380 Q420 230 420 190 V130 Q420 90 460 90 H525" />
          <path className="hz404-travel" d="M75 380 H160 Q200 380 200 340 V270 Q200 230 240 230 H380 Q420 230 420 190 V130 Q420 90 460 90 H525" />
          <circle cx="75" cy="380" r="10" fill="#d4fa65" /><circle cx="75" cy="380" r="20" stroke="#d4fa65" strokeOpacity=".35" />
          <circle cx="525" cy="90" r="10" fill="#d4fa65" /><circle cx="525" cy="90" r="20" stroke="#d4fa65" strokeOpacity=".35" />
          <g transform="translate(278 208) rotate(-10 23 22)"><rect width="46" height="44" rx="10" fill="#d4fa65"/><path d="m12 16 11-6 11 6v13l-11 6-11-6V16Zm0 0 11 6 11-6M23 22v13M18 13l11 6" stroke="#172c3c" strokeWidth="2" strokeLinejoin="round"/></g>
        </svg>
        <span className="hz404-city hz404-city-west">КАЛИНИНГРАД <small>54.71° N / 20.51° E</small></span>
        <span className="hz404-city hz404-city-east">МОСКВА <small>55.75° N / 37.62° E</small></span>
        <div className="hz404-map-bottom"><span>НЕ КАЖДЫЙ ПОВОРОТ — ТУПИК</span><span>↗</span></div>
      </div>
    </main>
    <footer className="hz404-footer"><span>Продолжим по знакомому маршруту</span><nav aria-label="Полезные страницы"><a href="/sklady">Склады <span aria-hidden="true">↗</span></a><a href="/faq">Вопросы и ответы <span aria-hidden="true">↗</span></a><a href="/blog">Блог <span aria-hidden="true">↗</span></a></nav><span className="hz404-footer-code">HAULZ / 404</span></footer>
  </div>;
}

export function NotFoundPage(props: NotFoundPageProps) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Страница не найдена — HAULZ";
    const previousRobots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    const previousContent = previousRobots?.content;
    const robots = previousRobots ?? document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex, follow";
    if (!previousRobots) document.head.appendChild(robots);
    return () => { document.title = previousTitle; if (previousRobots) robots.content = previousContent ?? ""; else robots.remove(); };
  }, []);
  return <NotFoundView {...props} />;
}
