import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';


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
      writeFileSync(resolve(output.dir, "public-analytics.js"), `import ${JSON.stringify(script)};\n`);

    },
  };
}
