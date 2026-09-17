import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const manifest = JSON.parse(readFileSync(resolve(root, '.vite/manifest.json'), 'utf8'));
const visited = new Set();
function visit(key) {
  if (visited.has(key)) return;
  if (!manifest[key]) throw new Error(`Missing manifest entry: ${key}`);
  visited.add(key);
  for (const dependency of manifest[key].imports || []) visit(dependency);
}
visit('index.html');
const entries = [...visited].map(key => manifest[key]);
const files = entries.map(entry => entry.file).filter(file => file.endsWith('.js'));
const totals = files.reduce((sum, file) => {
  const bytes = readFileSync(resolve(root, file));
  return { raw: sum.raw + bytes.length, gzip: sum.gzip + gzipSync(bytes).length };
}, {raw:0,gzip:0});
console.log(JSON.stringify({entry:'index.html', files, ...totals, budget:{raw:750000,gzip:225000}}, null, 2));
const forbidden = files.filter(file => /(?:recharts|exceljs|pdfjs|pdf-tools|firebase|HaulzReturnsPage)-/.test(file));
if (forbidden.length || totals.raw > 750000 || totals.gzip > 225000) {
  throw new Error(`Initial JS budget exceeded; eager optional modules: ${forbidden.join(', ') || 'none'}`);
}
