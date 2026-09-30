import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const routes = ['perevozka-moskva-kaliningrad', 'perevozka-kaliningrad-moskva'];

export function staticRouteAnalytics() {
  let config;
  let entry;
  return {
    name: 'static-route-analytics',
    apply: 'build',
    configResolved(resolved) { config = resolved; },
    buildStart() {
      entry = this.emitFile({
        type: 'chunk',
        id: resolve(config.root, 'src/staticPublicAnalytics.ts'),
        name: 'staticPublicAnalytics',
      });
    },
    writeBundle(output) {
      const script = `${config.base}${this.getFileName(entry)}`;
      for (const route of routes) {
        const file = resolve(output.dir, route, 'index.html');
        const html = readFileSync(file, 'utf8');
        if (!html.includes('</head>')) throw new Error(`Missing head in static landing: ${route}`);
        writeFileSync(file, html.replace('</head>', `<script type="module" src="${script}"></script>\n</head>`));
      }
    },
  };
}
