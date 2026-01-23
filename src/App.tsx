import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Truck, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Scale, RussianRuble, List, Download, Maximize,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart
    // Все остальные импорты сохранены на случай использования в Cargo/Details
} from 'lucide-react';
import React from "react";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import "./styles.css";
// --- TELEGRAM MINI APP SUPPORT ---
const getWebApp = () => {
    if (typeof window === "undefined") return undefined;
    // MAX Bridge использует window.WebApp (после подключения max-web-app.js)
    // Telegram использует window.Telegram.WebApp
    return (
        window.Telegram?.WebApp ||
        (window as any).WebApp // MAX Bridge
    );
};

const isMaxWebApp = () => {
    if (typeof window === "undefined") return false;
    // MAX Bridge создаёт window.WebApp после подключения библиотеки
    // Также проверяем userAgent для дополнительной надёжности
    const ua = window.navigator?.userAgent || "";
    return Boolean(
        (window as any).WebApp && !window.Telegram?.WebApp || // MAX Bridge (но не Telegram)
        /max[^a-z0-9]?app/i.test(ua) ||
        /\bmax\b/i.test(ua)
    );
};

const isMaxDocsEnabled = () => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).has("maxdocs");
};

import { DOCUMENT_METHODS } from "./documentMethods";


// --- CONFIGURATION ---
const PROXY_API_BASE_URL = '/api/perevozki'; 
const PROXY_API_DOWNLOAD_URL = '/api/download'; 
const PROXY_API_SEND_DOC_URL = '/api/send-document'; 

// --- TYPES ---
type ApiError = { error?: string; [key: string]: unknown; };
type AuthData = { login: string; password: string; };
// УДАЛЕНО: type Tab = "home" | "cargo" | "docs" | "support" | "profile";
type Tab = "home" | "cargo" | "docs" | "support" | "profile" | "dashboard"; // Все разделы + секретный dashboard
type DateFilter = "все" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "in_transit" | "ready" | "delivering" | "delivered" | "favorites";
type HomePeriodFilter = "today" | "week" | "month" | "year" | "custom"; // Оставлено, так как это может использоваться в Home, который пока остается в коде ниже

// --- ИСПОЛЬЗУЕМ ТОЛЬКО ПЕРЕМЕННЫЕ ИЗ API ---
type CargoItem = {
    Number?: string; DatePrih?: string; DateVr?: string; State?: string; Mest?: number | string; 
    PW?: number | string; W?: number | string; Value?: number | string; Sum?: number | string; 
    StateBill?: string; Sender?: string; [key: string]: any; // Для всех остальных полей
};

type CargoStat = {
    key: string; label: string; icon: React.ElementType; value: number | string; unit: string; bgColor: string;
};

// --- CONSTANTS ---
const getTodayDate = () => new Date().toISOString().split('T')[0];
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};
const DEFAULT_DATE_FROM = getSixMonthsAgoDate();
const DEFAULT_DATE_TO = getTodayDate();

// Статистика (заглушка) - оставлено, так как компонент HomePage остается, но не используется
const STATS_LEVEL_1: CargoStat[] = [
    { key: 'total', label: 'Всего перевозок', icon: LayoutGrid, value: 125, unit: 'шт', bgColor: 'bg-indigo-500' },
    { key: 'payments', label: 'Счета', icon: RussianRuble, value: '1,250,000', unit: '₽', bgColor: 'bg-green-500' },
    { key: 'weight', label: 'Вес', icon: TrendingUp, value: 5400, unit: 'кг', bgColor: 'bg-yellow-500' },
    { key: 'volume', label: 'Объем', icon: Maximize, value: 125, unit: 'м³', bgColor: 'bg-pink-500' },
];

const STATS_LEVEL_2: { [key: string]: CargoStat[] } = {
    total: [
        { key: 'total_new', label: 'В работе', icon: Truck, value: 35, unit: 'шт', bgColor: 'bg-blue-400' },
        { key: 'total_in_transit', label: 'В пути', icon: TrendingUp, value: 50, unit: 'шт', bgColor: 'bg-indigo-400' },
        { key: 'total_completed', label: 'Завершено', icon: Check, value: 40, unit: 'шт', bgColor: 'bg-green-400' },
        { key: 'total_cancelled', label: 'Отменено', icon: X, value: 0, unit: 'шт', bgColor: 'bg-red-400' },
    ],
    payments: [
        { key: 'pay_paid', label: 'Оплачено', icon: ClipboardCheck, value: 750000, unit: '₽', bgColor: 'bg-green-400' },
        { key: 'pay_due', label: 'К оплате', icon: CreditCard, value: 500000, unit: '₽', bgColor: 'bg-yellow-400' },
        { key: 'pay_none', label: 'Нет счета', icon: Minus, value: 0, unit: 'шт', bgColor: 'bg-gray-400' },
    ],
    weight: [
        { key: 'weight_current', label: 'Общий вес', icon: Weight, value: 5400, unit: 'кг', bgColor: 'bg-red-400' },
        { key: 'weight_paid', label: 'Платный вес', icon: Scale, value: 4500, unit: 'кг', bgColor: 'bg-orange-400' },
        { key: 'weight_free', label: 'Бесплатный вес', icon: Layers, value: 900, unit: 'кг', bgColor: 'bg-purple-400' },
    ],
    volume: [
        { key: 'vol_current', label: 'Объем всего', icon: Maximize, value: 125, unit: 'м³', bgColor: 'bg-pink-400' },
        { key: 'vol_boxes', label: 'Кол-во мест', icon: Layers, value: 125, unit: 'шт', bgColor: 'bg-teal-400' },
    ],
};


// --- HELPERS ---
const getDateRange = (filter: DateFilter) => {
    const today = new Date();
    const dateTo = getTodayDate();
    let dateFrom = getTodayDate();
    switch (filter) {
        case 'все': dateFrom = getSixMonthsAgoDate(); break; // ИСПРАВЛЕНО: 'all' на 'все'
        case 'сегодня': dateFrom = getTodayDate(); break;
        case 'неделя': today.setDate(today.getDate() - 7); dateFrom = today.toISOString().split('T')[0]; break;
        case 'месяц': today.setMonth(today.getMonth() - 1); dateFrom = today.toISOString().split('T')[0]; break;
        default: break;
    }
    return { dateFrom, dateTo };
}

const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        // Убеждаемся, что строка - это только дата (без времени) для корректного парсинга
        const cleanDateString = dateString.split('T')[0]; 
        const date = new Date(cleanDateString);
        if (!isNaN(date.getTime())) return date.toLocaleDateString('ru-RU');
    } catch { }
    return dateString;
};

const formatCurrency = (value: number | string | undefined): string => {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === "")) return '-';
    const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
    return isNaN(num) ? String(value) : new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits: 2 }).format(num);
};

// Функция для нормализации статуса
const normalizeStatus = (status: string | undefined): string => {
    if (!status) return '-';
    const lower = status.toLowerCase();
    // Заменяем "поставлена на доставку в месте прибытия" на "На доставке"
    if (lower.includes('поставлена на доставку в месте прибытия') || 
        lower.includes('поставлена на доставку')) {
        return 'На доставке';
    }
    return status;
};

const getStatusClass = (status: string | undefined) => {
    const normalized = normalizeStatus(status);
    const lower = (normalized || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'status-value success';
    if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('доставке')) return 'status-value transit';
    if (lower.includes('принят') || lower.includes('оформлен')) return 'status-value accepted';
    if (lower.includes('готов')) return 'status-value ready';
    return 'status-value';
};

// Компонент бейджа статуса с использованием MAX UI
const StatusBadge = ({ status }: { status: string | undefined }) => {
    const normalizedStatus = normalizeStatus(status);
    const lower = (normalizedStatus || '').toLowerCase();
    let badgeClass = 'max-badge';
    
    if (lower.includes('доставлен') || lower.includes('заверш')) {
        badgeClass += ' max-badge-success';
    } else if (lower.includes('доставке')) {
        badgeClass += ' max-badge-purple';
    } else if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('готов')) {
        badgeClass += ' max-badge-warning';
    } else if (lower.includes('отменен') || lower.includes('аннулирован')) {
        badgeClass += ' max-badge-danger';
    } else {
        badgeClass += ' max-badge-default';
    }
    
    return (
        <span className={badgeClass}>
            {normalizedStatus || '-'}
        </span>
    );
};

// Компонент бейджа статуса счета с использованием MAX UI
const StatusBillBadge = ({ status }: { status: string | undefined }) => {
    const lower = (status || '').toLowerCase().trim();
    let badgeClass = 'max-badge';
    
    // Логика для статусов счета - сначала проверяем "не оплачен", чтобы не перехватить его другими условиями
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || 
        lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') ||
        lower === 'не оплачен' || lower === 'неоплачен') {
        badgeClass += ' max-badge-danger'; // Красный для не оплачен
    } else if (lower.includes('отменен') || lower.includes('аннулирован') || lower.includes('отменён') ||
               lower.includes('cancelled') || lower.includes('canceled')) {
        badgeClass += ' max-badge-danger'; // Красный для отменен
    } else if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) {
        badgeClass += ' max-badge-success'; // Зеленый для оплачен
    } else if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) {
        badgeClass += ' max-badge-warning'; // Желтый для частично оплачен
    } else {
        badgeClass += ' max-badge-default'; // Серый для остальных
    }
    
    return (
        <span className={badgeClass}>
            {status || '-'}
        </span>
    );
};

// Функция для определения цвета суммы в зависимости от статуса оплаты
const getSumColorByPaymentStatus = (stateBill: string | undefined): string => {
    if (!stateBill) return 'var(--color-text-primary)';
    const lower = stateBill.toLowerCase().trim();
    
    // Сначала проверяем "не оплачен", чтобы не перехватить его другими условиями
    if (lower.includes('не оплачен') || lower.includes('неоплачен') || 
        lower.includes('не оплачён') || lower.includes('неоплачён') ||
        lower.includes('unpaid') || lower.includes('ожидает') || lower.includes('pending') ||
        lower === 'не оплачен' || lower === 'неоплачен') {
        return '#ef4444'; // Красный для не оплачен
    } else if (lower.includes('оплачен') || lower.includes('paid') || lower.includes('оплачён')) {
        return 'var(--color-success-status)'; // Зеленый для оплачен
    } else if (lower.includes('частично') || lower.includes('partial') || lower.includes('частичн')) {
        return 'var(--color-pending-status)'; // Желтый для частично оплачен
    }
    
    return 'var(--color-text-primary)'; // По умолчанию
};

const getFilterKeyByStatus = (s: string | undefined): StatusFilter => { 
    if (!s) return 'all'; 
    const normalized = normalizeStatus(s);
    const l = normalized.toLowerCase(); 
    if (l.includes('доставлен') || l.includes('заверш')) return 'delivered'; 
    if (l.includes('пути') || l.includes('отправлен')) return 'in_transit';
    if (l.includes('готов')) return 'ready';
    if (l.includes('доставке')) return 'delivering';
    return 'all'; 
}

const STATUS_MAP: Record<StatusFilter, string> = { "all": "Все", "in_transit": "В пути", "ready": "Готов к выдаче", "delivering": "На доставке", "delivered": "Доставлено", "favorites": "Избранные" };

const resolveChecked = (value: unknown): boolean => {
    if (typeof value === "boolean") return value;
    if (value && typeof value === "object") {
        const target = (value as { target?: { checked?: boolean } }).target;
        if (typeof target?.checked === "boolean") return target.checked;
    }
    return false;
};

const getFileNameFromDisposition = (header: string | null, fallback: string) => {
    if (!header) return fallback;
    const utf8Match = header.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);
    const quotedMatch = header.match(/filename="([^"]+)"/i);
    if (quotedMatch?.[1]) return quotedMatch[1];
    const plainMatch = header.match(/filename=([^;]+)/i);
    if (plainMatch?.[1]) return plainMatch[1].trim();
    return fallback;
};

const PUBLIC_OFFER_TEXT = `Общество с ограниченной ответственностью «Холз», ОГРН 1237700687180, ИНН 9706037094, в лице Генерального директора, действующего на основании Устава, именуемое в дальнейшем «Исполнитель», настоящим предлагает любому юридическому лицу или индивидуальному предпринимателю, именуемому в дальнейшем «Заказчик», заключить договор на оказание логистических услуг на условиях настоящей публичной оферты.

1. Общие положения

1.1. Настоящая оферта является публичным предложением в соответствии со статьей 437 Гражданского кодекса Российской Федерации.
1.2. Акцептом настоящей оферты является оформление заявки через сайт, мини-приложение, API, подтверждение счета или оплата услуг Исполнителя.
1.3. Акцепт оферты означает полное и безоговорочное согласие Заказчика со всеми условиями настоящего договора.

2. Предмет договора

2.1. Исполнитель оказывает Заказчику логистические и транспортно-экспедиционные услуги по маршрутам Москва – Калининград и Калининград – Москва.
2.2. Услуги включают организацию перевозки грузов, экспедирование, консолидацию и деконсолидацию грузов, сопровождение и контроль доставки, оформление сопроводительных документов, а также иные логистические операции по заявке Заказчика.
2.3. Конкретные условия оказания услуг, включая маршрут, сроки, стоимость и характеристики груза, определяются в заявке Заказчика и являются неотъемлемой частью настоящего договора.

3. Порядок оформления и оказания услуг

3.1. Заказчик оформляет заявку путем заполнения электронной формы в мини-приложении Исполнителя или иным согласованным способом.
3.2. Заявка должна содержать сведения о грузе, включая наименование, вес, объем, тип упаковки, маршрут перевозки, сроки доставки, стоимость груза и контактные данные Заказчика.
3.3. Договор считается заключенным с момента подтверждения заявки Исполнителем и (или) выставления счета.
3.4. Электронные данные, сформированные в информационных системах Исполнителя, признаются сторонами юридически значимыми.

4. Стоимость услуг и порядок расчетов

4.1. Стоимость услуг определяется индивидуально и указывается в счете, заявке или коммерческом предложении Исполнителя.
4.2. Расчеты осуществляются в рублях Российской Федерации путем безналичного перевода.
4.3. Исполнитель вправе требовать предварительную оплату в размере до 100 процентов стоимости услуг.
4.4. Обязательства Заказчика по оплате считаются исполненными с момента зачисления денежных средств на расчетный счет Исполнителя.

5. Ответственность за груз

5.1. Ответственность Исполнителя за сохранность груза возникает с момента принятия груза к перевозке и прекращается в момент передачи груза грузополучателю.
5.2. Исполнитель несет ответственность исключительно за реальный ущерб, причиненный по его вине.
5.3. Размер ответственности Исполнителя ограничивается заявленной стоимостью груза, указанной Заказчиком в заявке, но не может превышать стоимость оплаченных услуг, если иное не согласовано сторонами отдельно.
5.4. Исполнитель не несет ответственности за утрату, повреждение или задержку груза в случаях предоставления Заказчиком недостоверной информации о грузе, ненадлежащей упаковки, скрытых дефектов груза, действия третьих лиц, решений государственных органов, а также при наступлении обстоятельств непреодолимой силы.
5.5. Грузы, требующие специальных условий перевозки, принимаются Исполнителем только при наличии предварительного письменного согласования.
5.6. Претензии по утрате или повреждению груза принимаются Исполнителем в течение трех рабочих дней с момента получения груза Заказчиком или грузополучателем.

6. Обязанности Заказчика

6.1. Заказчик обязуется предоставлять достоверную и полную информацию о грузе, обеспечивать надлежащую упаковку, своевременно оплачивать услуги Исполнителя и соблюдать требования законодательства Российской Федерации.

7. Форс-мажор

7.1. Стороны освобождаются от ответственности за полное или частичное неисполнение обязательств по договору при наступлении обстоятельств непреодолимой силы.
7.2. Сторона, для которой наступили такие обстоятельства, обязана уведомить другую сторону в разумный срок.

8. Срок действия и изменение условий

8.1. Договор вступает в силу с момента акцепта оферты и действует бессрочно.
8.2. Исполнитель вправе в одностороннем порядке изменять условия настоящей оферты путем публикации новой редакции.
8.3. Новая редакция оферты применяется к заявкам, оформленным после даты ее публикации.

9. Разрешение споров

9.1. Все споры и разногласия разрешаются путем переговоров.
9.2. При недостижении соглашения спор подлежит рассмотрению в арбитражном суде по месту нахождения Исполнителя.

10. Реквизиты Исполнителя

Общество с ограниченной ответственностью «Холз»
ОГРН: 1237700687180
ИНН: 9706037094
Юридический адрес: г. Москва, ул. Мытная, д. 28, стр. 3, пом. 1/1`;

const PERSONAL_DATA_CONSENT_TEXT = `Настоящим я, действуя свободно, своей волей и в своем интересе, подтверждаю согласие Обществу с ограниченной ответственностью «Холз» (ОГРН 1237700687180, ИНН 9706037094, юридический адрес: г. Москва, ул. Мытная, д. 28, стр. 3, пом. 1/1) (далее — Оператор) на обработку моих персональных данных в соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных».

1. Персональные данные, на обработку которых дается согласие
К персональным данным относятся, включая, но не ограничиваясь:
— фамилия, имя, отчество;
— номер телефона;
— адрес электронной почты;
— реквизиты организации, которую я представляю;
— иные данные, предоставленные мной при использовании сайта, мини-приложения (мини-аппа), API, сервисов или при оформлении заявки на логистические услуги.

2. Цели обработки персональных данных
Обработка персональных данных осуществляется в целях:
— заключения и исполнения договоров на оказание логистических услуг;
— обработки заявок, оформленных через мини-приложение;
— идентификации пользователя мини-приложения;
— связи со мной по вопросам оказания услуг;
— выполнения требований законодательства Российской Федерации;
— улучшения качества сервисов и пользовательского опыта.

3. Перечень действий с персональными данными
Я даю согласие на совершение с моими персональными данными следующих действий: сбор, запись, систематизация, накопление, хранение, уточнение, использование, передача (в случаях, предусмотренных законодательством РФ), обезличивание, блокирование и уничтожение персональных данных с использованием средств автоматизации и без их использования.

4. Использование мини-приложения как форма согласия
Я подтверждаю и соглашаюсь с тем, что факт использования мини-приложения (мини-аппа) Оператора, включая вход, заполнение форм, отправку заявок, а также передачу данных через интерфейс мини-приложения, признается моим осознанным и однозначным согласием на обработку персональных данных на условиях настоящего документа.

5. Передача персональных данных третьим лицам
Оператор вправе передавать персональные данные третьим лицам исключительно в объеме, необходимом для оказания логистических услуг и исполнения обязательств по договору, а также в случаях, предусмотренных законодательством Российской Федерации.

6. Срок действия согласия
Настоящее согласие действует с момента начала использования мини-приложения, сайта или иных сервисов Оператора и до момента его отзыва субъектом персональных данных либо до достижения целей обработки.

7. Отзыв согласия
Согласие может быть отозвано путем направления письменного уведомления Оператору по адресу его местонахождения либо по электронным каналам связи, используемым Оператором.

8. Подтверждение
Я подтверждаю, что ознакомлен(а) с условиями обработки персональных данных, мои права и обязанности как субъекта персональных данных мне разъяснены и понятны.

Настоящее согласие считается предоставленным в электронной форме и не требует подписания на бумажном носителе.`;

// ================== COMPONENTS ==================

// --- HOME PAGE (STATISTICS) - ОСТАВЛЕН, но не используется ---

function HomePage({ auth }: { auth: AuthData }) {
    const [periodFilter, setPeriodFilter] = useState<HomePeriodFilter>("month");
    const [customFrom, setCustomFrom] = useState(DEFAULT_DATE_FROM);
    const [customTo, setCustomTo] = useState(DEFAULT_DATE_TO);
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isPeriodModalOpen, setIsPeriodModalOpen] = useState(false);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);

    const apiDateRange = useMemo(() => {
        if (periodFilter === "custom") {
            return { dateFrom: customFrom, dateTo: customTo };
        }
        const today = new Date();
        const dateTo = getTodayDate();
        let dateFrom = dateTo;

        switch (periodFilter) {
            case "today":
                dateFrom = getTodayDate();
                break;
            case "week":
                today.setDate(today.getDate() - 7);
                dateFrom = today.toISOString().split("T")[0];
                break;
            case "month":
                today.setMonth(today.getMonth() - 1);
                dateFrom = today.toISOString().split("T")[0];
                break;
            case "year":
                today.setFullYear(today.getFullYear() - 1);
                dateFrom = today.toISOString().split("T")[0];
                break;
            default:
                break;
        }

        return { dateFrom, dateTo };
    }, [periodFilter, customFrom, customTo]);

    const loadStats = useCallback(async (dateFrom: string, dateTo: string) => {
        if (!auth) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo,
                }),
            });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : (data.items || []);
            const mapNumber = (value: any): number => {
                if (value === null || value === undefined) return 0;
                if (typeof value === "number") return value;
                const parsed = parseFloat(String(value).replace(",", "."));
                return isNaN(parsed) ? 0 : parsed;
            };
            setItems(
                list.map((item: any) => ({
                    ...item,
                    Number: item.Number,
                    DatePrih: item.DatePrih,
                    DateVr: item.DateVr,
                    State: item.State,
                    Mest: mapNumber(item.Mest),
                    PW: mapNumber(item.PW),
                    W: mapNumber(item.W),
                    Value: mapNumber(item.Value),
                    Sum: mapNumber(item.Sum),
                    StateBill: item.StateBill,
                    Sender: item.Sender,
                }))
            );
        } catch (e: any) {
            setError(e.message || "Ошибка загрузки данных");
        } finally {
            setLoading(false);
        }
    }, [auth]);

    useEffect(() => {
        loadStats(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadStats]);

    const totalShipments = items.length;
    const totalPaidWeight = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.PW) || 0), 0),
        [items]
    );
    const totalWeight = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.W) || 0), 0),
        [items]
    );
    const totalVolume = useMemo(
        () => items.reduce((sum, item) => sum + (Number(item.Value) || 0), 0),
        [items]
    );

    const formatTons = (kg: number) => {
        if (!kg) return "0 т";
        return (kg / 1000).toFixed(1) + " т";
    };

    const periodLabel = useMemo(() => {
        const { dateFrom, dateTo } = apiDateRange;
        if (periodFilter === "month") {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString("ru-RU", {
                    month: "long",
                    year: "numeric",
                });
            }
        }
        if (periodFilter === "year") {
            const d = new Date(dateFrom);
            if (!isNaN(d.getTime())) {
                return d.getFullYear().toString();
            }
        }
        return `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;
    }, [apiDateRange, periodFilter]);

    const selectPeriod = (value: HomePeriodFilter) => {
        setPeriodFilter(value);
        setIsPeriodModalOpen(false);
        if (value !== "custom") {
            // при выборе предустановленного периода сбрасываем кастомные диапазоны к дефолту
            setCustomFrom(DEFAULT_DATE_FROM);
            setCustomTo(DEFAULT_DATE_TO);
        }
    };

    return (
        <div className="w-full max-w-lg">
            {/* Заголовок периода */}
            <div className="home-period-header mb-6">
                <Button
                    className="home-period-button"
                    onClick={() => setIsPeriodModalOpen(true)}
                >
                    <Typography.Body className="home-period-title">
                        Период:{" "}
                        <Typography.Label className="home-period-value">
                            {periodLabel.charAt(0).toUpperCase() + periodLabel.slice(1)}
                        </Typography.Label>
                    </Typography.Body>
                    <ChevronDown className="w-5 h-5 ml-2" />
                </Button>
            </div>

            {/* Карточки статистики */}
            <Grid className="stats-grid" cols={2} gap={12}>
                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Package className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            За период
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {totalShipments}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Всего перевозок
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Scale className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Платный вес
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {formatTons(totalPaidWeight)}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Платный вес за период
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Weight className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">Вес</Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {formatTons(totalWeight)}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Фактический вес за период
                    </Typography.Label>
                </Panel>

                <Panel className="stat-card">
                    <div className="flex justify-between items-center mb-2">
                        <Maximize className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">Объем</Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {totalVolume.toFixed(1)}м³
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Объем за период
                    </Typography.Label>
                </Panel>
            </Grid>

            {/* Загрузка / ошибка */}
            {loading && (
                <Flex direction="column" align="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                    <Typography.Body className="text-sm text-theme-secondary mt-2">
                        Обновление данных...
                    </Typography.Body>
                </Flex>
            )}
            {error && (
                <Flex align="center" className="login-error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}

            {/* Модальное окно выбора периода */}
            {isPeriodModalOpen && (
                <div
                    className="modal-overlay"
                    onClick={() => setIsPeriodModalOpen(false)}
                >
                    <div
                        className="modal-content"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="modal-header">
                            <Typography.Headline>Выбор периода</Typography.Headline>
                            <Button
                                className="modal-close-button"
                                onClick={() => setIsPeriodModalOpen(false)}
                                aria-label="Закрыть"
                            >
                                <X size={20} />
                            </Button>
                        </div>
                        <div className="space-y-3">
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("week")}
                            >
                                Неделя
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("month")}
                            >
                                Месяц
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => selectPeriod("year")}
                            >
                                Год
                            </Button>
                            <Button
                                className="period-option-button"
                                onClick={() => {
                                    setIsPeriodModalOpen(false);
                                    setIsCustomModalOpen(true);
                                    setPeriodFilter("custom");
                                }}
                            >
                                Произвольный период
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Модальное окно выбора произвольного периода */}
            <CustomPeriodModal
                isOpen={isCustomModalOpen}
                onClose={() => setIsCustomModalOpen(false)}
                dateFrom={customFrom}
                dateTo={customTo}
                onApply={(from, to) => {
                    setCustomFrom(from);
                    setCustomTo(to);
                }}
            />
        </div>
    );
}

function CustomPeriodModal({
    isOpen,
    onClose,
    dateFrom,
    dateTo,
    onApply,
}: {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (from: string, to: string) => void;
}) {
    const [localFrom, setLocalFrom] = useState<string>(dateFrom);
    const [localTo, setLocalTo] = useState<string>(dateTo);

    useEffect(() => {
        setLocalFrom(dateFrom);
        setLocalTo(dateTo);
    }, [dateFrom, dateTo]);

    if (!isOpen) return null;

    const handleApply = () => {
        if (!localFrom || !localTo) return;
        onApply(localFrom, localTo);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal-content"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <Typography.Headline>Произвольный период</Typography.Headline>
                    <Button
                        className="modal-close-button"
                        onClick={onClose}
                        aria-label="Закрыть"
                    >
                        <X size={20} />
                    </Button>
                </div>
                <div className="modal-body">
                    <label className="modal-label">
                        Дата с
                        <Input
                            type="date"
                            className="modal-input"
                            value={localFrom}
                            onChange={(e) => setLocalFrom(e.target.value)}
                        />
                    </label>
                    <label className="modal-label">
                        Дата по
                        <Input
                            type="date"
                            className="modal-input"
                            value={localTo}
                            onChange={(e) => setLocalTo(e.target.value)}
                        />
                    </label>
                </div>
                <div className="modal-footer">
                    <Button className="primary-button" onClick={handleApply}>
                        Применить
                    </Button>
                </div>
            </div>
        </div>
    );
}

// --- DASHBOARD PAGE (SECRET) ---
function DashboardPage({ auth, onClose }: { auth: AuthData, onClose: () => void }) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    
    // Filters State (такие же как на странице грузов)
    const [dateFilter, setDateFilter] = useState<DateFilter>("все");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    
    const apiDateRange = useMemo(() => 
        dateFilter === "период" 
            ? { dateFrom: customDateFrom, dateTo: customDateTo } 
            : getDateRange(dateFilter), 
        [dateFilter, customDateFrom, customDateTo]
    );
    
    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    dateFrom,
                    dateTo
                })
            });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            setItems(list.map((item: any) => ({
                ...item,
                Number: item.Number,
                DatePrih: item.DatePrih,
                DateVr: item.DateVr,
                State: item.State,
                Mest: item.Mest,
                PW: item.PW,
                W: item.W,
                Value: item.Value,
                Sum: item.Sum,
                StateBill: item.StateBill,
                Sender: item.Sender,
            })));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [auth]);
    
    useEffect(() => {
        loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadCargo]);
    
    // Фильтрация
    const filteredItems = useMemo(() => {
        let res = items;
        if (statusFilter === 'favorites') {
            // Фильтр избранных (если нужно)
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        return res;
    }, [items, statusFilter]);
    
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
        const dataMap = new Map<string, { date: string; sum: number; pw: number; mest: number }>();
        
        filteredItems.forEach(item => {
            if (!item.DatePrih) return;
            
            // Используем исходную дату для группировки, но форматируем для отображения
            const dateKey = item.DatePrih.split('T')[0]; // YYYY-MM-DD
            const displayDate = formatDate(item.DatePrih);
            if (!dateKey || displayDate === '-') return;
            
            const existing = dataMap.get(dateKey) || { date: displayDate, sum: 0, pw: 0, mest: 0 };
            existing.sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            existing.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            existing.mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            dataMap.set(dateKey, existing);
        });
        
        return Array.from(dataMap.values()).sort((a, b) => {
            // Сортируем по дате (формат DD.MM.YYYY)
            const partsA = a.date.split('.');
            const partsB = b.date.split('.');
            if (partsA.length !== 3 || partsB.length !== 3) return 0;
            const dateA = new Date(parseInt(partsA[2]), parseInt(partsA[1]) - 1, parseInt(partsA[0]));
            const dateB = new Date(parseInt(partsB[2]), parseInt(partsB[1]) - 1, parseInt(partsB[0]));
            return dateA.getTime() - dateB.getTime();
        });
    }, [filteredItems]);
    
    // Функция для создания SVG графика
    const renderChart = (
        data: { date: string; value: number }[],
        title: string,
        color: string,
        formatValue: (val: number) => string
    ) => {
        if (data.length === 0) {
            return (
                <Panel className="cargo-card" style={{ marginBottom: '1rem' }}>
                    <Typography.Headline style={{ marginBottom: '1rem', fontSize: '1rem' }}>{title}</Typography.Headline>
                    <Typography.Body className="text-theme-secondary">Нет данных для отображения</Typography.Body>
                </Panel>
            );
        }
        
        const maxValue = Math.max(...data.map(d => d.value), 1);
        const chartHeight = 200;
        const paddingLeft = 50;
        const paddingRight = 20;
        const paddingTop = 20;
        const paddingBottom = 60;
        const availableWidth = 300; // Минимальная ширина
        const barSpacing = 4;
        const barWidth = Math.max(8, (availableWidth - paddingLeft - paddingRight - (data.length - 1) * barSpacing) / data.length);
        const chartWidth = paddingLeft + paddingRight + data.length * (barWidth + barSpacing) - barSpacing;
        const availableHeight = chartHeight - paddingTop - paddingBottom;
        
        return (
            <Panel className="cargo-card" style={{ marginBottom: '1rem' }}>
                <Typography.Headline style={{ marginBottom: '1rem', fontSize: '1rem' }}>{title}</Typography.Headline>
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <svg 
                        width={Math.max(chartWidth, '100%')} 
                        height={chartHeight}
                        style={{ minWidth: `${chartWidth}px`, display: 'block' }}
                    >
                        {/* Горизонтальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={chartHeight - paddingBottom} 
                            x2={chartWidth - paddingRight} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="2" 
                        />
                        
                        {/* Вертикальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={paddingTop} 
                            x2={paddingLeft} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="2" 
                        />
                        
                        {/* Столбцы */}
                        {data.map((d, idx) => {
                            const barHeight = (d.value / maxValue) * availableHeight;
                            const x = paddingLeft + idx * (barWidth + barSpacing);
                            const y = chartHeight - paddingBottom - barHeight;
                            
                            return (
                                <g key={idx}>
                                    <rect
                                        x={x}
                                        y={y}
                                        width={barWidth}
                                        height={barHeight}
                                        fill={color}
                                        opacity={0.8}
                                        rx="2"
                                    />
                                    {/* Значение на столбце */}
                                    {barHeight > 25 && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={y - 5}
                                            fontSize="10"
                                            fill="var(--color-text-primary)"
                                            textAnchor="middle"
                                            fontWeight="600"
                                        >
                                            {formatValue(d.value)}
                                        </text>
                                    )}
                                    {/* Дата под столбцом */}
                                    <text
                                        x={x + barWidth / 2}
                                        y={chartHeight - paddingBottom + 15}
                                        fontSize="9"
                                        fill="var(--color-text-secondary)"
                                        textAnchor="middle"
                                    >
                                        {d.date.split('.').slice(0, 2).join('.')}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </Panel>
        );
    };
    
    return (
        <div className="w-full">
            {/* Filters (такие же как на странице грузов) */}
            <div className="filters-container">
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'период' ? 'Период' : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isDateDropdownOpen && (
                        <div className="filter-dropdown">
                            {['все', 'сегодня', 'неделя', 'месяц', 'период'].map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { 
                                    setDateFilter(key as any); 
                                    setIsDateDropdownOpen(false); 
                                    if(key === 'период') setIsCustomModalOpen(true); 
                                }}>
                                    <Typography.Body>{key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); }}>
                        Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isStatusDropdownOpen && (
                        <div className="filter-dropdown">
                            {Object.keys(STATUS_MAP).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { 
                                    setStatusFilter(key as any); 
                                    setIsStatusDropdownOpen(false); 
                                }}>
                                    <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            <Typography.Body className="text-sm text-theme-secondary mb-4 text-center">
                Период: {formatDate(apiDateRange.dateFrom)} – {formatDate(apiDateRange.dateTo)}
            </Typography.Body>
            
            {loading && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            
            {error && (
                <Flex align="center" className="login-error mt-4">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <Typography.Body>{error}</Typography.Body>
                </Flex>
            )}
            
            {!loading && !error && (
                <>
                    {renderChart(
                        chartData.map(d => ({ date: d.date, value: d.sum })),
                        "Динамика за период в деньгах",
                        "#3b82f6",
                        (val) => formatCurrency(val)
                    )}
                    
                    {renderChart(
                        chartData.map(d => ({ date: d.date, value: d.pw })),
                        "Динамика в платном весе за период",
                        "#34d399",
                        (val) => `${val.toFixed(2)} кг`
                    )}
                    
                    {renderChart(
                        chartData.map(d => ({ date: d.date, value: d.mest })),
                        "Динамика в местах",
                        "#facc15",
                        (val) => `${val.toFixed(0)}`
                    )}
                </>
            )}
            
            <FilterDialog 
                isOpen={isCustomModalOpen} 
                onClose={() => setIsCustomModalOpen(false)} 
                dateFrom={customDateFrom} 
                dateTo={customDateTo} 
                onApply={(f, t) => { 
                    setCustomDateFrom(f); 
                    setCustomDateTo(t); 
                }} 
            />
        </div>
    );
}

// --- CARGO PAGE (LIST ONLY) ---
function CargoPage({ auth, searchText }: { auth: AuthData, searchText: string }) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);
    
    // Filters State
    const [dateFilter, setDateFilter] = useState<DateFilter>("все"); // ИСПРАВЛЕНО: 'all' на 'все'
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [showSummary, setShowSummary] = useState(true);
    // Sort State
    const [sortBy, setSortBy] = useState<'datePrih' | 'dateVr' | null>(null);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    // Favorites State
    const [favorites, setFavorites] = useState<Set<string>>(new Set());
    
    // Загружаем избранные из localStorage при монтировании
    useEffect(() => {
        try {
            const saved = localStorage.getItem('haulz.favorites');
            if (saved) {
                const parsed = JSON.parse(saved) as string[];
                setFavorites(new Set(parsed));
            }
        } catch {
            // Игнорируем ошибки чтения
        }
    }, []);
    
    // Сохраняем избранные в localStorage при изменении
    useEffect(() => {
        try {
            localStorage.setItem('haulz.favorites', JSON.stringify(Array.from(favorites)));
        } catch {
            // Игнорируем ошибки записи
        }
    }, [favorites]);
    
    // Функции для работы с избранными
    const toggleFavorite = useCallback((cargoNumber: string | undefined) => {
        if (!cargoNumber) return;
        setFavorites(prev => {
            const newSet = new Set(prev);
            if (newSet.has(cargoNumber)) {
                newSet.delete(cargoNumber);
            } else {
                newSet.add(cargoNumber);
            }
            return newSet;
        });
    }, []);
    
    const isFavorite = useCallback((cargoNumber: string | undefined): boolean => {
        return cargoNumber ? favorites.has(cargoNumber) : false;
    }, [favorites]);

    const apiDateRange = useMemo(() => dateFilter === "период" ? { dateFrom: customDateFrom, dateTo: customDateTo } : getDateRange(dateFilter), [dateFilter, customDateFrom, customDateTo]); // ИСПРАВЛЕНО: 'custom' на 'период'

    // Удалена функция findDeliveryDate, используем DateVr напрямую.

    const loadCargo = useCallback(async (dateFrom: string, dateTo: string) => {
        setLoading(true); setError(null);
        try {
            const res = await fetch(PROXY_API_BASE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: auth.login, password: auth.password, dateFrom, dateTo }) });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            
            // МАППИНГ ДАННЫХ: используем только указанные поля API
            setItems(list.map((item: any) => ({
                ...item,
                Number: item.Number, 
                DatePrih: item.DatePrih, 
                DateVr: item.DateVr, // Дата доставки
                State: item.State, 
                Mest: item.Mest, 
                PW: item.PW, // Платный вес
                W: item.W, // Общий вес
                Value: item.Value, // Объем
                Sum: item.Sum, 
                StateBill: item.StateBill, // Статус счета
                Sender: item.Sender, // Отправитель
            })));
        } catch (e: any) { setError(e.message); } finally { setLoading(false); }
    }, [auth]);

    useEffect(() => { loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo); }, [apiDateRange, loadCargo]);

    // Client-side filtering and sorting
    const filteredItems = useMemo(() => {
        let res = items;
        if (statusFilter === 'favorites') {
            // Фильтр избранных
            res = res.filter(i => i.Number && favorites.has(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (searchText) {
            const lower = searchText.toLowerCase();
            // Обновлены поля поиска: PW вместо PV, добавлен Sender
            res = res.filter(i => [i.Number, i.State, i.Sender, formatDate(i.DatePrih), formatCurrency(i.Sum), String(i.PW), String(i.Mest)].join(' ').toLowerCase().includes(lower));
        }
        
        // Применяем сортировку ТОЛЬКО по датам
        if (sortBy) {
            res = [...res].sort((a, b) => {
                // Функция для безопасного парсинга даты
                const parseDate = (dateString: string | undefined): number | null => {
                    if (!dateString) return null;
                    
                    const str = String(dateString).trim();
                    if (!str || str === '' || str === '-') return null;
                    
                    try {
                        // Сначала пробуем стандартный формат ISO (YYYY-MM-DD или YYYY-MM-DDTHH:mm:ss)
                        let cleanStr = str.split('T')[0].trim();
                        let date = new Date(cleanStr);
                        
                        if (!isNaN(date.getTime())) {
                            return date.getTime();
                        }
                        
                        // Пробуем формат DD.MM.YYYY
                        const dotParts = cleanStr.split('.');
                        if (dotParts.length === 3) {
                            const day = parseInt(dotParts[0], 10);
                            const month = parseInt(dotParts[1], 10) - 1;
                            const year = parseInt(dotParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                        
                        // Пробуем формат DD/MM/YYYY
                        const slashParts = cleanStr.split('/');
                        if (slashParts.length === 3) {
                            const day = parseInt(slashParts[0], 10);
                            const month = parseInt(slashParts[1], 10) - 1;
                            const year = parseInt(slashParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                        
                        // Пробуем формат DD-MM-YYYY
                        const dashParts = cleanStr.split('-');
                        if (dashParts.length === 3 && dashParts[0].length <= 2) {
                            const day = parseInt(dashParts[0], 10);
                            const month = parseInt(dashParts[1], 10) - 1;
                            const year = parseInt(dashParts[2], 10);
                            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                                date = new Date(year, month, day);
                                if (!isNaN(date.getTime())) {
                                    return date.getTime();
                                }
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки парсинга
                    }
                    
                    return null;
                };
                
                let timestampA: number | null = null;
                let timestampB: number | null = null;
                
                // Сортируем ТОЛЬКО по выбранной дате
                if (sortBy === 'datePrih') {
                    timestampA = parseDate(a.DatePrih);
                    timestampB = parseDate(b.DatePrih);
                } else if (sortBy === 'dateVr') {
                    timestampA = parseDate(a.DateVr);
                    timestampB = parseDate(b.DateVr);
                }
                
                // Обрабатываем случаи с null/undefined - элементы без даты идут в конец
                if (timestampA === null && timestampB === null) {
                    // Если оба без даты, возвращаем 0 (сохраняем исходный порядок, НЕ сортируем по другим полям)
                    return 0;
                }
                if (timestampA === null) return 1; // Элементы без даты идут в конец
                if (timestampB === null) return -1; // Элементы без даты идут в конец
                
                // Сортируем ТОЛЬКО по разнице дат, без дополнительных критериев
                const diff = timestampA - timestampB;
                if (diff === 0) {
                    // Если даты одинаковые, возвращаем 0 (не используем другие критерии)
                    return 0;
                }
                return sortOrder === 'asc' ? diff : -diff;
            });
        }
        
        return res;
    }, [items, statusFilter, searchText, sortBy, sortOrder, favorites]);

    // Подсчет сумм из отфильтрованных элементов
    const summary = useMemo(() => {
        const totalSum = filteredItems.reduce((acc, item) => {
            const sum = typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            return acc + sum;
        }, 0);
        
        const totalMest = filteredItems.reduce((acc, item) => {
            const mest = typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            return acc + mest;
        }, 0);
        
        const totalPW = filteredItems.reduce((acc, item) => {
            const pw = typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            return acc + pw;
        }, 0);
        
        return {
            sum: totalSum,
            mest: totalMest,
            pw: totalPW
        };
    }, [filteredItems]);


    return (
        <div className="w-full">
            {/* Filters */}
            <div className="filters-container">
                <div className="filter-group" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setIsStatusDropdownOpen(false); }}>
                        Дата: {dateFilter === 'период' ? 'Период' : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isDateDropdownOpen && <div className="filter-dropdown">
                        {['все', 'сегодня', 'неделя', 'месяц', 'период'].map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setDateFilter(key as any); setIsDateDropdownOpen(false); if(key==='период') setIsCustomModalOpen(true); }}>
                                <Typography.Body>{key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                            </div>
                        ))}
                    </div>}
                    {/* Кнопка сортировки по датам */}
                    <Button 
                        className="filter-button" 
                        style={{ padding: '0.5rem', minWidth: 'auto' }}
                        onClick={() => {
                            if (!sortBy) {
                                // Нет сортировки -> сортировка по дате прихода (по убыванию)
                                setSortBy('datePrih');
                                setSortOrder('desc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'desc') {
                                // Дата прихода (убывание) -> дата прихода (возрастание)
                                setSortOrder('asc');
                            } else if (sortBy === 'datePrih' && sortOrder === 'asc') {
                                // Дата прихода (возрастание) -> дата доставки (убывание)
                                setSortBy('dateVr');
                                setSortOrder('desc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'desc') {
                                // Дата доставки (убывание) -> дата доставки (возрастание)
                                setSortOrder('asc');
                            } else if (sortBy === 'dateVr' && sortOrder === 'asc') {
                                // Дата доставки (возрастание) -> сброс
                                setSortBy(null);
                                setSortOrder('desc');
                            }
                        }}
                        title={
                            !sortBy ? "Сортировать по дате прихода" :
                            sortBy === 'datePrih' && sortOrder === 'desc' ? "Сортировать по дате прихода (возрастание)" :
                            sortBy === 'datePrih' && sortOrder === 'asc' ? "Сортировать по дате доставки" :
                            sortBy === 'dateVr' && sortOrder === 'desc' ? "Сортировать по дате доставки (возрастание)" :
                            "Сбросить сортировку"
                        }
                    >
                        {!sortBy ? (
                            <ArrowUpDown className="w-4 h-4" style={{ opacity: 0.5 }} />
                        ) : sortOrder === 'asc' ? (
                            <ArrowUp className="w-4 h-4" />
                        ) : (
                            <ArrowDown className="w-4 h-4" />
                        )}
                    </Button>
                </div>
                <div className="filter-group">
                    <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); }}>
                        Статус: {STATUS_MAP[statusFilter]} <ChevronDown className="w-4 h-4"/>
                    </Button>
                    {isStatusDropdownOpen && <div className="filter-dropdown">
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </div>}
                </div>
            </div>

            <Typography.Body className="text-sm text-theme-secondary mb-4 text-center">
                Период: {formatDate(apiDateRange.dateFrom)} – {formatDate(apiDateRange.dateTo)}
            </Typography.Body>

            {/* Суммирующая строка */}
            <div className="cargo-card mb-4" style={{ padding: '0.75rem' }}>
                <Flex justify="center" align="center">
                    <Flex gap="1.5rem" align="center" style={{ flexWrap: 'wrap' }}>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Сумма</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {formatCurrency(summary.sum)}
                            </Typography.Body>
                        </Flex>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Мест</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {summary.mest.toFixed(0)}
                            </Typography.Body>
                        </Flex>
                        <Flex direction="column" align="center">
                            <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Плат. вес</Typography.Label>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {summary.pw.toFixed(2)} кг
                            </Typography.Body>
                        </Flex>
                    </Flex>
                </Flex>
            </div>

            {/* List */}
            {loading && (
                <Flex justify="center" className="text-center py-8">
                    <Loader2 className="animate-spin w-6 h-6 mx-auto text-theme-primary" />
                </Flex>
            )}
            {!loading && !error && filteredItems.length === 0 && (
                <Panel className="empty-state-card">
                    <Flex direction="column" align="center">
                        <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                        <Typography.Body className="text-theme-secondary">Ничего не найдено</Typography.Body>
                    </Flex>
                </Panel>
            )}
            
            {/* List */}
            {filteredItems.length > 0 && (
                <div className="cargo-list">
                    {filteredItems.map((item: CargoItem, idx: number) => (
                        <Panel 
                            key={item.Number || idx} 
                            className="cargo-card"
                            onClick={() => setSelectedCargo(item)}
                            style={{ cursor: 'pointer', marginBottom: '0.75rem', position: 'relative' }}
                        >
                            <Flex justify="space-between" align="start" style={{ marginBottom: '0.5rem' }}>
                                <Typography.Body style={{ fontWeight: 600, fontSize: '1rem' }}>
                                    {item.Number}
                                </Typography.Body>
                                <Flex align="center" gap="0.5rem">
                                    <Button
                                        style={{ 
                                            padding: '0.25rem', 
                                            minWidth: 'auto', 
                                            background: 'transparent',
                                            border: 'none',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleFavorite(item.Number);
                                        }}
                                        title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.opacity = '0.7';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.opacity = '1';
                                        }}
                                    >
                                        <Heart 
                                            className="w-4 h-4" 
                                            style={{ 
                                                fill: isFavorite(item.Number) ? '#ef4444' : 'transparent',
                                                color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)',
                                                transition: 'all 0.2s'
                                            }} 
                                        />
                                    </Button>
                                    <Calendar className="w-4 h-4 text-theme-secondary" />
                                    <Typography.Label className="text-theme-secondary" style={{ fontSize: '0.85rem' }}>
                                        {formatDate(item.DatePrih)}
                                    </Typography.Label>
                                </Flex>
                            </Flex>
                            <Flex justify="space-between" align="center" style={{ marginBottom: '0.5rem' }}>
                                <StatusBadge status={item.State} />
                                <Typography.Body style={{ fontWeight: 600, fontSize: '1rem', color: getSumColorByPaymentStatus(item.StateBill) }}>
                                    {formatCurrency(item.Sum)}
                                </Typography.Body>
                            </Flex>
                            <Flex justify="space-between" align="center" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                <Flex gap="1rem">
                                    <Typography.Label>Мест: {item.Mest || '-'}</Typography.Label>
                                    <Typography.Label>Вес: {item.PW ? `${item.PW} кг` : '-'}</Typography.Label>
                                </Flex>
                                <StatusBillBadge status={item.StateBill} />
                            </Flex>
                        </Panel>
                    ))}
                </div>
            )}

            {selectedCargo && <CargoDetailsModal item={selectedCargo} isOpen={!!selectedCargo} onClose={() => setSelectedCargo(null)} auth={auth} />}
            <FilterDialog isOpen={isCustomModalOpen} onClose={() => setIsCustomModalOpen(false)} dateFrom={customDateFrom} dateTo={customDateTo} onApply={(f, t) => { setCustomDateFrom(f); setCustomDateTo(t); }} />
        </div>
    );
}

// --- SHARED COMPONENTS ---

function FilterDialog({ isOpen, onClose, dateFrom, dateTo, onApply }: { isOpen: boolean; onClose: () => void; dateFrom: string; dateTo: string; onApply: (from: string, to: string) => void; }) {
    const [tempFrom, setTempFrom] = useState(dateFrom);
    const [tempTo, setTempTo] = useState(dateTo);
    useEffect(() => { if (isOpen) { setTempFrom(dateFrom); setTempTo(dateTo); } }, [isOpen, dateFrom, dateTo]);
    if (!isOpen) return null;
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Typography.Headline>Произвольный диапазон</Typography.Headline>
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                </div>
                <form onSubmit={e => { e.preventDefault(); onApply(tempFrom, tempTo); onClose(); }}>
                    <div style={{marginBottom: '1rem'}}><Typography.Label className="detail-item-label">Дата начала:</Typography.Label><Input type="date" className="login-input date-input" value={tempFrom} onChange={e => setTempFrom(e.target.value)} required /></div>
                    <div style={{marginBottom: '1.5rem'}}><Typography.Label className="detail-item-label">Дата окончания:</Typography.Label><Input type="date" className="login-input date-input" value={tempTo} onChange={e => setTempTo(e.target.value)} required /></div>
                    <Button className="button-primary" type="submit">Применить</Button>
                </form>
            </div>
        </div>
    );
}

function CargoDetailsModal({ item, isOpen, onClose, auth }: { item: CargoItem, isOpen: boolean, onClose: () => void, auth: AuthData }) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string; docType: string; blob?: Blob; downloadFileName?: string } | null>(null);
    
    // Очистка blob URL при закрытии
    useEffect(() => {
        if (!isOpen && pdfViewer) {
            URL.revokeObjectURL(pdfViewer.url);
            setPdfViewer(null);
        }
    }, [isOpen, pdfViewer]);
    
    // Раскрываем на весь экран при открытии документов (MAX Bridge)
    useEffect(() => {
        if (isOpen) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.expand === "function" && isMaxWebApp()) {
                webApp.expand();
            }
        }
    }, [isOpen]);
    
    if (!isOpen) return null;

    const renderValue = (val: any, unit = '') => {
        // Улучшенная проверка на пустоту: проверяем на undefined, null и строку, 
        // которая после обрезки пробелов становится пустой.
        if (val === undefined || val === null || (typeof val === 'string' && val.trim() === "")) return '-';
        
        // Обработка сложных объектов/массивов
        if (typeof val === 'object' && val !== null && !React.isValidElement(val)) {
            try {
                if (Object.keys(val).length === 0) return '-';
                return <pre style={{whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.75rem', margin: 0}}>{JSON.stringify(val, null, 2)}</pre>;
            } catch (e) {
                return String(val); 
            }
        }
        
        const num = typeof val === 'string' ? parseFloat(val) : val;
        // Форматирование чисел
        if (typeof num === 'number' && !isNaN(num)) {
            if (unit.toLowerCase() === 'кг' || unit.toLowerCase() === 'м³') {
                 // Округляем до двух знаков для кг и м³
                return `${num.toFixed(2)}${unit ? ' ' + unit : ''}`;
            }
        }
        
        return `${val}${unit ? ' ' + unit : ''}`;
    };
    
    const downloadFile = (blob: Blob, fileName: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const handleDownload = async (docType: string) => {
        if (!item.Number) return alert("Нет номера перевозки");
        setDownloading(docType); setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    metod: DOCUMENT_METHODS[docType],
                    number: item.Number,
                }),
            });
            if (!res.ok) throw new Error(`Ошибка: ${res.status}`);
            const data = await res.json();

            if (!data?.data || !data.name) {
                throw new Error("Ответ от сервера не содержит файл.");
            }

            // Декодируем base64 в бинарный файл
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = data.name || `${docType}_${item.Number}.pdf`;

            // Метод 4: object/embed - показываем встроенным просмотрщиком
            const url = URL.createObjectURL(blob);
            setPdfViewer({
                url,
                name: fileName,
                docType,
                blob, // Сохраняем blob для скачивания
                downloadFileName: fileName
            });
            
            // Если скачали УПД в MAX - закрываем мини-апп после скачивания
            if (docType === 'УПД' && isMaxWebApp()) {
                const webApp = getWebApp();
                if (webApp && typeof webApp.close === "function") {
                    // Даём время на скачивание, затем закрываем
                    setTimeout(() => {
                        webApp.close();
                    }, 1000);
                }
            }
        } catch (e: any) { setDownloadError(e.message); } finally { setDownloading(null); }
    };

    // Список явно отображаемых полей (из API примера)
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender'];

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    {/* Заголовок без "Перевозка" */}
                    <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть"><X size={20} /></Button>
                </div>
                {downloadError && <Typography.Body className="login-error mb-2">{downloadError}</Typography.Body>}
                
                {/* Явно отображаемые поля (из API примера) */}
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number} />
                    <DetailItem label="Статус" value={normalizeStatus(item.State)} statusClass={getStatusClass(item.State)} />
                    <DetailItem label="Приход" value={formatDate(item.DatePrih)} />
                    <DetailItem label="Доставка" value={(() => {
                        // Показываем дату доставки только если груз доставлен
                        const status = normalizeStatus(item.State);
                        const lower = status.toLowerCase();
                        if (lower.includes('доставлен') || lower.includes('заверш')) {
                            return formatDate(item.DateVr);
                        }
                        return '-';
                    })()} /> {/* Используем DateVr */}
                    <DetailItem label="Отправитель" value={item.Sender || '-'} /> {/* Добавляем Sender */}
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted /> {/* Используем PW */}
                    <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем W */}
                    <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} /> {/* Используем Value */}
                    <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />
                    <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted /> {/* Используем StateBill */}
                </div>
                
                {/* ДОПОЛНИТЕЛЬНЫЕ поля из API - УДАЛЕН ЗАГОЛОВОК "Прочие данные из API" */}
                
                <div className="details-grid-modal">
                    {Object.entries(item)
                        .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                        .map(([key, val]) => {
                            // Пропускаем, если значение пустое
                            if (val === undefined || val === null || val === "" || (typeof val === 'string' && val.trim() === "") || (typeof val === 'object' && val !== null && Object.keys(val).length === 0)) return null; 
                            // Пропускаем, если значение - 0
                            if (val === 0 && key.toLowerCase().includes('date') === false) return null;
                            
                            return <DetailItem key={key} label={key} value={renderValue(val)} />;
                        })}
                </div>
                
                <Typography.Headline style={{marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>
                    Документы
                </Typography.Headline>
                
                {/* Умные сценарии документов */}
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || 
                                  item.StateBill?.toLowerCase().includes('paid') ||
                                  item.StateBill === 'Оплачен';
                    
                    // Базовые документы (всегда доступны)
                    const baseDocs = ['ЭР', 'АПП'];
                    
                    // Документы в зависимости от статуса оплаты
                    const availableDocs = isPaid 
                        ? [...baseDocs, 'СЧЕТ', 'УПД'] // Если оплачен - показываем все
                        : [...baseDocs, 'СЧЕТ']; // Если не оплачен - скрываем УПД
                    
                    return (
                        <>
                <div className="document-buttons">
                                {availableDocs.map(doc => {
                                    const isUPD = doc === 'УПД';
                                    const isHighlighted = isUPD && isPaid; // Подсветка для УПД если оплачен
                                    return (
                                        <Button 
                                            key={doc} 
                                            className={`doc-button ${isHighlighted ? 'doc-button-highlighted' : ''}`}
                                            onClick={() => handleDownload(doc)} 
                                            disabled={downloading === doc}
                                            style={isHighlighted ? {
                                                border: '2px solid var(--color-primary-blue)',
                                                boxShadow: '0 0 8px rgba(37, 99, 235, 0.3)'
                                            } : {}}
                                        >
                            {downloading === doc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} {doc}
                        </Button>
                                    );
                                })}
                </div>
                            
                            {/* Кнопка "Оплатить" если счет не оплачен */}
                            {!isPaid && (
                                <div style={{ marginTop: '0.75rem' }}>
                                    <Button 
                                        className="button-primary" 
                                        style={{ width: '100%' }}
                                        onClick={() => {
                                            const webApp = getWebApp();
                                            if (webApp && typeof webApp.openLink === 'function') {
                                                // Открываем страницу оплаты (нужно будет добавить URL)
                                                webApp.openLink(`https://lk.haulz.pro/payment?number=${item.Number}`);
                                            } else {
                                                window.open(`https://lk.haulz.pro/payment?number=${item.Number}`, '_blank');
                                            }
                                        }}
                                    >
                                        <CreditCard className="w-4 h-4 mr-2" />
                                        Оплатить
                                </Button>
                        </div>
                            )}
                        </>
                    );
                })()}

                {/* Встроенный просмотрщик PDF (метод 4: object/embed) */}
                {pdfViewer && (
                    <div style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography.Label style={{ fontSize: '0.8rem' }}>{pdfViewer.name}</Typography.Label>
                            <Button size="small" onClick={() => { URL.revokeObjectURL(pdfViewer.url); setPdfViewer(null); }}>
                                <X size={16} />
                            </Button>
                        </div>
                        <object 
                            data={pdfViewer.url} 
                            type="application/pdf" 
                            style={{ width: '100%', height: '500px' }}
                        >
                            <Typography.Body style={{ padding: '1rem', textAlign: 'center' }}>
                                Ваш браузер не поддерживает просмотр PDF.
                            </Typography.Body>
                        </object>
                    </div>
                )}
            </div>
        </div>
    );
}

const DetailItem = ({ label, value, icon, statusClass, highlighted, textColor }: any) => (
    <div className={`details-item-modal ${highlighted ? 'highlighted-detail' : ''}`}>
        <Typography.Label className="detail-item-label">{label}</Typography.Label>
        <Flex align="center" className={`detail-item-value ${statusClass || ''}`}>
            {icon}
            <Typography.Body style={textColor ? { color: textColor } : {}}>{value}</Typography.Body>
        </Flex>
    </div>
);

// УДАЛЕНО: function StubPage({ title }: { title: string }) { return <div className="w-full p-8 text-center"><h2 className="title">{title}</h2><p className="subtitle">Раздел в разработке</p></div>; }

function TabBar({ active, onChange, onCargoClick, showAllTabs }: { active: Tab, onChange: (t: Tab) => void, onCargoClick?: () => void, showAllTabs?: boolean }) {
    if (showAllTabs) {
        return (
            <div className="tabbar-container">
                <TabBtn label="Главная" icon={<Home />} active={active === "home" || active === "dashboard"} onClick={() => onChange("home")} />
                <TabBtn 
                    label="Грузы" 
                    icon={<Truck />} 
                    active={active === "cargo"} 
                    onClick={() => {
                        // Если секретный режим уже активирован, просто переключаемся на грузы
                        onChange("cargo");
                    }} 
                />
                <TabBtn label="Документы" icon={<FileText />} active={active === "docs"} onClick={() => onChange("docs")} />
                <TabBtn label="Поддержка" icon={<MessageCircle />} active={active === "support"} onClick={() => onChange("support")} />
                <TabBtn label="Профиль" icon={<User />} active={active === "profile"} onClick={() => onChange("profile")} />
            </div>
        );
    }
    
    return (
        <div className="tabbar-container">
            {/* ОСТАВЛЕНА ТОЛЬКО КНОПКА "Грузы" */}
            <TabBtn 
                label="Грузы" 
                icon={<Truck />} 
                active={active === "cargo" || active === "dashboard"} 
                onClick={() => {
                    if (onCargoClick) {
                        onCargoClick();
                    }
                    onChange("cargo");
                }} 
            />
        </div>
    );
}
const TabBtn = ({ label, icon, active, onClick }: any) => (
    <Button className={`tab-button ${active ? 'active' : ''}`} onClick={onClick}>
        <Flex align="center">
            <div className="tab-icon">{icon}</div>
            {label && <Typography.Label className="tab-label">{label}</Typography.Label>}
        </Flex>
    </Button>
);

// ----------------- MAIN APP -----------------

export default function App() {
    // --- Telegram Init ---
    useEffect(() => {
        let mounted = true;
        let cleanupHandler: (() => void) | undefined;
        let attempts = 0;

        const initWebApp = () => {
            const webApp = getWebApp();
            if (!webApp || !mounted) return false;

            try {
                if (typeof webApp.ready === "function") {
                    webApp.ready();
                }
                
                // Настройка цветов для MAX Bridge
                if (isMaxWebApp()) {
                    // Устанавливаем цвет фона - всегда белый для MAX
                    if (typeof webApp.setBackgroundColor === "function") {
                        webApp.setBackgroundColor('#ffffff');
                    }
                    
                    // Устанавливаем цвет хедера (визуально привязываем к бренду)
                    if (typeof webApp.setHeaderColor === "function") {
                        webApp.setHeaderColor('#2563eb'); // Синий цвет бренда HAULZ
                    }
                }
                
                if (typeof webApp.expand === "function") {
                    webApp.expand();
                }
                // Для MAX не используем автоматическую тему из colorScheme
                if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                // Для MAX не используем автоматическую тему
                if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
                // Для MAX всегда белый фон
                if (isMaxWebApp()) {
                    if (typeof webApp.setBackgroundColor === "function") {
                        webApp.setBackgroundColor('#ffffff');
                    }
                }
            };

            if (typeof webApp.onEvent === "function") {
                webApp.onEvent("themeChanged", themeHandler);
                cleanupHandler = () => webApp.offEvent?.("themeChanged", themeHandler);
            }

            return true;
        };

        // На Android WebApp может появиться позже, поэтому немного подождём
        if (!initWebApp()) {
            const timer = setInterval(() => {
                attempts += 1;
                const ready = initWebApp();
                if (ready || attempts > 40) {
                    clearInterval(timer);
                }
            }, 100);

            return () => {
                mounted = false;
                clearInterval(timer);
                cleanupHandler?.();
            };
        }

        return () => {
            mounted = false;
            cleanupHandler?.();
        };
    }, []);

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo"); // ИЗМЕНЕНО: По умолчанию только "cargo"
    const [theme, setTheme] = useState('dark');
    const [cargoClickCount, setCargoClickCount] = useState(0);
    const [showDashboard, setShowDashboard] = useState(false);
    const clickTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
    
    // Очистка таймаута при размонтировании
    useEffect(() => {
        return () => {
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
            }
        };
    }, []); 
    const [startParam, setStartParam] = useState<string | null>(null);
    const [contextCargoNumber, setContextCargoNumber] = useState<string | null>(null); 
    
    // ИНИЦИАЛИЗАЦИЯ ПУСТЫМИ СТРОКАМИ (данные берутся с фронта)
    const [login, setLogin] = useState(""); 
    const [password, setPassword] = useState(""); 
    
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [isOfferOpen, setIsOfferOpen] = useState(false);
    const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);

    useEffect(() => { 
        document.body.className = `${theme}-mode`; 
        // Для MAX всегда белый фон при изменении темы
        if (isMaxWebApp()) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.setBackgroundColor === "function") {
                webApp.setBackgroundColor('#ffffff');
            }
        }
    }, [theme]);

    // Обработка start_param для контекстного запуска
    useEffect(() => {
        if (typeof window === "undefined") return;
        
        const webApp = getWebApp();
        if (!webApp) return;
        
        // Получаем start_param из WebApp (MAX/Telegram)
        const param = (webApp as any).startParam || 
                     (webApp as any).initDataUnsafe?.start_param ||
                     new URLSearchParams(window.location.search).get('start_param') ||
                     new URLSearchParams(window.location.search).get('startapp');
        
        if (param) {
            setStartParam(param);
            console.log('📱 Start param:', param);
            
            // Парсим параметры: invoice_123, upd_456, delivery_789
            if (param.startsWith('invoice_')) {
                const number = param.replace('invoice_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('upd_')) {
                const number = param.replace('upd_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            } else if (param.startsWith('delivery_')) {
                const number = param.replace('delivery_', '');
                setContextCargoNumber(number);
                setActiveTab('cargo');
            }
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = window.localStorage.getItem("haulz.auth");
            if (saved) {
                const parsed = JSON.parse(saved) as AuthData;
                if (parsed?.login && parsed?.password) {
                    setAuth(parsed);
                }
            }
        } catch {
            // игнорируем ошибки чтения
        }
    }, []);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!login || !password) return setError("Введите логин и пароль");
        if (!agreeOffer || !agreePersonal) return setError("Подтвердите согласие с условиями");

        try {
            setLoading(true);
            // ИСПРАВЛЕНО: 'all' на 'все'
            const { dateFrom, dateTo } = getDateRange("все");
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, password, dateFrom, dateTo }),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации`;
                try {
                    const errorData = await res.json() as ApiError;
                    if (errorData.error) message = errorData.error;
                } catch { }
                setError(message);
                return;
            }
            const payload = { login, password };
            setAuth(payload);
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.setItem("haulz.auth", JSON.stringify(payload));
                } catch {
                    // игнорируем ошибки записи
                }
            }
            setActiveTab("cargo"); 
        } catch (err: any) {
            setError("Ошибка сети.");
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        setAuth(null);
        setActiveTab("cargo");
        setPassword(""); 
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("haulz.auth");
            } catch {
                // игнорируем ошибки удаления
            }
        }
        setIsSearchExpanded(false); setSearchText('');
    }

    if (!auth) {
        return (
            <Container className={`app-container login-form-wrapper`}>
                <Panel mode="secondary" className="login-card">
                    <div className="absolute top-4 right-4">
                        <Button
                            className="theme-toggle-button-login"
                            onClick={toggleTheme}
                            title={theme === 'dark' ? 'Светлый режим' : 'Темный режим'}
                            aria-label={theme === 'dark' ? 'Включить светлый режим' : 'Включить темный режим'}
                        >
                            {/* ИСПРАВЛЕНИЕ: Убран class text-yellow-400 */}
                            {theme === 'dark' 
                                ? <Sun className="w-5 h-5 text-theme-primary" /> 
                                : <Moon className="w-5 h-5 text-theme-primary" />}
                        </Button>
                    </div>
                    <Flex justify="center" className="mb-4 h-10 mt-6">
                        <Typography.Title className="logo-text">HAULZ</Typography.Title>
                    </Flex>
                    <Typography.Body className="tagline">
                        Доставка грузов в Калининград и обратно
                    </Typography.Body>
                    <form onSubmit={handleLoginSubmit} className="form">
                        <div className="field">
                            <Input
                                className="login-input"
                                type="text"
                                placeholder="Логин (email)"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                autoComplete="username"
                            />
                        </div>
                        <div className="field">
                            <div className="password-input-container">
                                <Input
                                    className="login-input password"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Пароль"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    style={{paddingRight: '3rem'}}
                                />
                                <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </Button>
                            </div>
                        </div>
                        {/* ТУМБЛЕРЫ ВОССТАНОВЛЕНЫ */}
                        <label className="checkbox-row switch-wrapper">
                            <Typography.Body>
                                Согласие с{" "}
                                <a href="#" onClick={(e) => { e.preventDefault(); setIsOfferOpen(true); }}>
                                    публичной офертой
                                </a>
                            </Typography.Body>
                            <Switch
                                checked={agreeOffer}
                                onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))}
                                onChange={(event) => setAgreeOffer(resolveChecked(event))}
                            />
                        </label>
                        <label className="checkbox-row switch-wrapper">
                            <Typography.Body>
                                Согласие на{" "}
                                <a href="#" onClick={(e) => { e.preventDefault(); setIsPersonalConsentOpen(true); }}>
                                    обработку данных
                                </a>
                            </Typography.Body>
                            <Switch
                                checked={agreePersonal}
                                onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))}
                                onChange={(event) => setAgreePersonal(resolveChecked(event))}
                            />
                        </label>
                        <Button className="button-primary" type="submit" disabled={loading}>
                            {loading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить"}
                        </Button>
                        <Flex justify="center" style={{ marginTop: '1rem' }}>
                            <Typography.Body 
                                style={{ 
                                    color: 'var(--color-primary-blue)', 
                                    cursor: 'pointer',
                                    textDecoration: 'underline',
                                    fontSize: '0.9rem'
                                }}
                                onClick={() => {
                                    const webApp = getWebApp();
                                    const forgotPasswordUrl = 'https://lk.haulz.pro/forgot-password';
                                    if (webApp && typeof webApp.openLink === 'function') {
                                        webApp.openLink(forgotPasswordUrl);
                                    } else {
                                        window.open(forgotPasswordUrl, '_blank', 'noopener,noreferrer');
                                    }
                                }}
                            >
                                Забыли пароль?
                            </Typography.Body>
                        </Flex>
                    </form>
                    {error && (
                        <Flex align="center" className="login-error mt-4">
                            <AlertTriangle className="w-5 h-5 mr-2" />
                            <Typography.Body>{error}</Typography.Body>
                        </Flex>
                    )}
                    {isOfferOpen && (
                        <div className="modal-overlay" onClick={() => setIsOfferOpen(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <Button className="modal-close-button" onClick={() => setIsOfferOpen(false)} aria-label="Закрыть">
                                        <X size={20} />
                                    </Button>
                                </div>
                                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                                    {PUBLIC_OFFER_TEXT}
                                </div>
                            </div>
                        </div>
                    )}
                    {isPersonalConsentOpen && (
                        <div className="modal-overlay" onClick={() => setIsPersonalConsentOpen(false)}>
                            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                                <div className="modal-header">
                                    <Button className="modal-close-button" onClick={() => setIsPersonalConsentOpen(false)} aria-label="Закрыть">
                                        <X size={20} />
                                    </Button>
                                </div>
                                <div style={{ whiteSpace: "pre-wrap", fontSize: "0.85rem", lineHeight: 1.45 }}>
                                    {PERSONAL_DATA_CONSENT_TEXT}
                                </div>
                            </div>
                        </div>
                    )}
                </Panel>
            </Container>
        );
    }

    return (
        <Container className={`app-container`}>
            <header className="app-header">
                <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info">
                        <UserIcon className="w-4 h-4 mr-2" />
                        <Typography.Body>{auth.login}</Typography.Body>
                    </Flex>
                    <Flex align="center" className="space-x-3">
                        <Button className="search-toggle-button" onClick={toggleTheme} title={theme === 'dark' ? 'Светлый режим' : 'Темный режим'} aria-label={theme === 'dark' ? 'Включить светлый режим' : 'Включить темный режим'}>
                            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
                        </Button>
                        <Button className="search-toggle-button" onClick={() => { setIsSearchExpanded(!isSearchExpanded); if(isSearchExpanded) { handleSearch(''); setSearchText(''); } }}>
                            {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                        </Button>
                        <Button className="search-toggle-button" onClick={handleLogout} title="Выход" aria-label="Выйти">
                            <LogOut className="w-5 h-5" />
                        </Button>
                    </Flex>
                </Flex>
                <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                    <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                    <Input type="search" placeholder="Поиск..." className="search-input" value={searchText} onChange={(e) => { setSearchText(e.target.value); handleSearch(e.target.value); }} />
                    {searchText && <Button className="search-toggle-button" onClick={() => { setSearchText(''); handleSearch(''); }} aria-label="Очистить поиск"><X className="w-4 h-4" /></Button>}
                </div>
            </header>
            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {showDashboard && activeTab === "dashboard" && <DashboardPage auth={auth} onClose={() => { setShowDashboard(false); setActiveTab("cargo"); }} />}
                    {!showDashboard && activeTab === "cargo" && <CargoPage auth={auth} searchText={searchText} />}
                    {!showDashboard && activeTab === "docs" && (
                        <div className="w-full p-8 text-center">
                            <Typography.Headline>Документы</Typography.Headline>
                            <Typography.Body className="text-theme-secondary">Раздел в разработке</Typography.Body>
                        </div>
                    )}
                    {!showDashboard && activeTab === "support" && (
                        <div className="w-full p-8 text-center">
                            <Typography.Headline>Поддержка</Typography.Headline>
                            <Typography.Body className="text-theme-secondary">Раздел в разработке</Typography.Body>
                        </div>
                    )}
                    {!showDashboard && activeTab === "profile" && (
                        <div className="w-full p-8 text-center">
                            <Typography.Headline>Профиль</Typography.Headline>
                            <Typography.Body className="text-theme-secondary">Раздел в разработке</Typography.Body>
                        </div>
                    )}
                </div>
            </div>
            <TabBar 
                active={activeTab} 
                onChange={(tab) => {
                    if (tab === "home") {
                        setShowDashboard(true);
                        setActiveTab("dashboard");
                    } else {
                        setShowDashboard(false);
                        setActiveTab(tab);
                    }
                }}
                onCargoClick={() => {
                    // Работаем только если секретный режим еще не активирован
                    if (showDashboard) return;
                    
                    // Очищаем предыдущий таймаут, если он есть
                    if (clickTimeoutRef.current) {
                        clearTimeout(clickTimeoutRef.current);
                    }
                    
                    const newCount = cargoClickCount + 1;
                    setCargoClickCount(newCount);
                    
                    if (newCount >= 9) {
                        setShowDashboard(true);
                        setActiveTab("dashboard");
                        setCargoClickCount(0); // Сбрасываем счетчик
                        if (clickTimeoutRef.current) {
                            clearTimeout(clickTimeoutRef.current);
                            clickTimeoutRef.current = null;
                        }
                    } else {
                        // Сбрасываем счетчик через 3 секунды, если не достигли 9
                        clickTimeoutRef.current = setTimeout(() => {
                            setCargoClickCount(0);
                            clickTimeoutRef.current = null;
                        }, 3000);
                    }
                }}
                showAllTabs={showDashboard}
            />
        </Container>
    );
}
