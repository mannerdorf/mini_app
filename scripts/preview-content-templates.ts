import {mkdirSync, writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {SERVICE_CONTENT} from '../lib/mediaMarketing/serviceContent.js';
import {publicServiceHtml} from '../lib/mediaMarketing/publicServiceHtml.js';
import {publicBlogHtml} from '../lib/mediaMarketing/publicBlogHtml.js';
const dir = resolve(process.argv[2] || '/tmp/haulz-t06-preview');
mkdirSync(dir, {recursive:true});
writeFileSync(resolve(dir, 'service.html'), publicServiceHtml(SERVICE_CONTENT[0], true));
writeFileSync(resolve(dir, 'article.html'), publicBlogHtml({
 slug:'kak-podgotovit-dannye-dlya-rascheta', title:'Что подготовить для расчёта перевозки',
 meta_description:'Для предварительного расчёта нужны направление, вес и размеры груза, а также условия забора и доставки.',
 published_at:'', planned_date:null, channels:null, telegram_teaser:null,
 body_markdown:'## Выберите направление\nHAULZ перевозит грузы между Москвой и Калининградом в обе стороны.\n\n## Укажите параметры груза\nПодготовьте вес и размеры грузовых мест. Они понадобятся для расчёта.\n\n## Определите условия передачи\nМожно выбрать склад или указать адрес забора и доставки. Проверьте эти параметры до оформления.\n\n## Что означает результат\nКалькулятор показывает предварительный расчёт. Условия конкретного груза уточняются при оформлении.'
}, true));
console.log(dir);
