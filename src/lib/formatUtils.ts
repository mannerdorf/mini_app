/** Форматирование валюты */
export const formatCurrency = (value: number | string | undefined, integers?: boolean): string => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === "")) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    if (isNaN(num)) return String(value);
    const rounded = integers ? Math.round(num) : num;
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: integers ? 0 : 2,
        maximumFractionDigits: integers ? 0 : 2,
    }).format(rounded);
};

/** Все города Калининградской области → KGD; все города Московской области → MSK */
export const cityToCode = (city: string | number | undefined | null): string => {
    if (city === undefined || city === null) return '';
    const s = String(city).trim().toLowerCase();
    if (/калининградская\s*область|калининград|кгд/.test(s)) return 'KGD';
    if (/советск|черняховск|балтийск|гусев|светлый|гурьевск|зеленоградск|светлогорск|пионерский|багратионовск|нестеров|озёрск|правдинск|полесск|лаврово|мамоново|янтарный/.test(s)) return 'KGD';
    if (/московская\s*область|москва|мск|msk/.test(s)) return 'MSK';
    if (/подольск|балашиха|химки|королёв|мытищи|люберцы|электросталь|коломна|одинцово|серпухов|орехово-зуево|раменское|жуковский|пушкино|сергиев\s*посад|воскресенск|лобня|клин|дубна|егорьевск|чехов|дмитров|ступино|ногинск|долгопрудный|реутов|андреевск|фрязино|троицк|ивантеевка|дзержинский|видное|красногорск|домодедово|железнодорожный|котельники/.test(s)) return 'MSK';
    return String(city).trim();
};

/** Извлекает номера перевозок из текста (5–9 цифр или 0000-XXXX) */
export const parseCargoNumbersFromText = (text: string): Array<{ type: 'text' | 'cargo'; value: string }> => {
    if (!text || typeof text !== 'string') return [{ type: 'text', value: text || '' }];
    const parts: Array<{ type: 'text' | 'cargo'; value: string }> = [];
    const re = /(0000-\d{4,8}|\d{5,9})/g;
    let lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
        if (m.index > lastIndex) parts.push({ type: 'text', value: text.slice(lastIndex, m.index) });
        const raw = m[1];
        const normalized = raw.replace(/^0000-/, '');
        parts.push({ type: 'cargo', value: normalized });
        lastIndex = m.index + m[0].length;
    }
    if (lastIndex < text.length) parts.push({ type: 'text', value: text.slice(lastIndex) });
    return parts.length ? parts : [{ type: 'text', value: text }];
};

/** Убирает префикс «0000-» из номера счёта */
export const formatInvoiceNumber = (s: string | undefined | null): string => {
    const str = String(s ?? '').trim();
    if (!str) return '—';
    return str.replace(/^0000-/, '') || '—';
};

/** Убирает «ООО», «ИП», «(ИП)» из названия компании */
export const stripOoo = (name: string | undefined | null): string => {
    if (!name || typeof name !== 'string') return name ?? '';
    return name
        .replace(/\s*ООО\s*«?/gi, ' ')
        .replace(/»?\s*ООО\s*/gi, ' ')
        .replace(/\s*\(\s*ИП\s*\)\s*/gi, ' ')
        .replace(/(^|\s)ИП(\s|$)/gi, '$1$2')
        .replace(/\s+/g, ' ')
        .trim() || name;
};

const TRANSLIT_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh', 'з': 'z',
    'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
    'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
};

export const transliterateFilename = (fileName: string): string => {
    if (!fileName || typeof fileName !== 'string') return fileName || '';
    let out = '';
    for (let i = 0; i < fileName.length; i++) {
        const c = fileName[i];
        const lower = c.toLowerCase();
        if (TRANSLIT_MAP[lower] !== undefined) {
            out += c === c.toUpperCase() && c !== c.toLowerCase() ? TRANSLIT_MAP[lower].charAt(0).toUpperCase() + TRANSLIT_MAP[lower].slice(1) : TRANSLIT_MAP[lower];
        } else {
            out += c;
        }
    }
    return out;
};

/** Нормализация статуса счёта для отображения */
export const normalizeInvoiceStatus = (s: string | undefined): string => {
    if (!s) return '';
    const lower = s.toLowerCase().trim();
    if (lower.includes('оплачен') && !lower.includes('не') && !lower.includes('частично')) return 'Оплачен';
    if (lower.includes('частично')) return 'Оплачен частично';
    if (lower.includes('не') || lower.includes('неоплачен')) return 'Не оплачен';
    return s;
};
