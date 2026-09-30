import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { NotFoundView } from '../src/pages/NotFoundPage';

writeFileSync(new URL('../public/404.html', import.meta.url), `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена — HAULZ</title><meta name="robots" content="noindex, follow"><style>html,body{margin:0;padding:0}</style></head><body>${renderToStaticMarkup(<NotFoundView />)}</body></html>\n`);
console.log('wrote /404.html');
