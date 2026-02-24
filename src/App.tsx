import React, { FormEvent, useEffect, useState, useCallback, useMemo, useRef, useLayoutEffect, Suspense, lazy } from "react";
import {
    LogOut, Truck, Loader2, Check, X, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, Search, ChevronDown, User as UserIcon, Users, Scale, RussianRuble, List, Download, Maximize,
    Home, FileText, MessageCircle, User, LayoutGrid, TrendingUp, TrendingDown, CornerUpLeft, ClipboardCheck, CreditCard, Minus, ArrowUp, ArrowDown, ArrowUpDown, Heart, Building2, Bell, Shield, Settings, Info, ArrowLeft, Plus, Trash2, MapPin, Phone, Mail, Share2, Mic, Square, Ship, RefreshCw, Lock
} from "lucide-react";
import { createPortal } from "react-dom";
import { Button, Container, Flex, Grid, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import { ChatModal } from "./ChatModal";
import "./styles.css";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import {
    ensureOk,
    readJsonOrText,
    extractErrorMessage,
    extractCustomerFromPerevozki,
    extractInnFromPerevozki,
    getExistingInns,
    dedupeCustomersByInn,
    dedupeCompaniesByName,
} from "./utils";
import { TabBar } from "./components/TabBar";
import { AccountSwitcher } from "./components/AccountSwitcher";
import { CustomerSwitcher } from "./components/CustomerSwitcher";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AppMainContent } from "./components/AppMainContent";
import { getWebApp, isMaxWebApp, isMaxDocsEnabled } from "./webApp";
import { DOCUMENT_METHODS } from "./documentMethods";
// import { NotificationsPage } from "./pages/NotificationsPage"; // temporarily disabled
import { TapSwitch } from "./components/TapSwitch";
import { FilterDropdownPortal } from "./components/ui/FilterDropdownPortal";
import { DateText } from "./components/ui/DateText";
import { DetailItem } from "./components/ui/DetailItem";
import { FilterDialog } from "./components/shared/FilterDialog";
import { StatusBadge, StatusBillBadge } from "./components/shared/StatusBadges";
import { normalizeStatus, getFilterKeyByStatus, getPaymentFilterKey, getSumColorByPaymentStatus, isReceivedInfoStatus, BILL_STATUS_MAP, STATUS_MAP } from "./lib/statusUtils";
import { workingDaysBetween, workingDaysInPlan, type WorkSchedule } from "./lib/slaWorkSchedule";
import type { BillStatusFilterKey } from "./lib/statusUtils";
import { CustomPeriodModal } from "./components/modals/CustomPeriodModal";
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then(m => ({ default: m.DocumentsPage })));
import { AdminPage } from "./pages/AdminPage";
import { CMSStandalonePage } from "./pages/CMSStandalonePage";
import { NotFoundPage, shouldShowNotFound } from "./pages/NotFoundPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { AddCompanyByINNPage } from "./pages/AddCompanyByINNPage";
import { AddCompanyByLoginPage } from "./pages/AddCompanyByLoginPage";
import { CompaniesListPage } from "./pages/CompaniesListPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { CargoPage } from "./pages/CargoPage";
import { AppRuntimeProvider } from "./contexts/AppRuntimeContext";
import { getSlaInfo, getPlanDays, getInnFromCargo, isFerry } from "./lib/cargoUtils";
import * as dateUtils from "./lib/dateUtils";
import { formatCurrency, stripOoo, formatInvoiceNumber, cityToCode, transliterateFilename, normalizeInvoiceStatus, parseCargoNumbersFromText } from "./lib/formatUtils";
import { PROXY_API_BASE_URL, PROXY_API_GETCUSTOMERS_URL, PROXY_API_DOWNLOAD_URL, PROXY_API_SEND_DOC_URL, PROXY_API_GETPEREVOZKA_URL, PROXY_API_INVOICES_URL } from "./constants/config";
import { usePerevozki, usePerevozkiMulti, usePerevozkiMultiAccounts, usePrevPeriodPerevozki, useInvoices } from "./hooks/useApi";
import type {
    Account, ApiError, AuthData, CargoItem, CargoStat, CompanyRow, CustomerOption,
    DateFilter, HaulzOffice, HeaderCompanyRow, HomePeriodFilter, PerevozkaTimelineStep,
    PerevozkiRole, ProfileView, StatusFilter, Tab,
} from "./types";

const { getTodayDate, isDateToday, isDateInRange, getSixMonthsAgoDate, DEFAULT_DATE_FROM, DEFAULT_DATE_TO, loadDateFilterState, saveDateFilterState, getDateRange, MONTH_NAMES, getWeekRange, getPreviousPeriodRange, getWeeksList, getYearsList, formatDate, formatDateTime, formatTimelineDate, formatTimelineTime, getDateTextColor, getFirstWorkingDayOnOrAfter, getFirstPaymentWeekdayOnOrAfter } = dateUtils;
type DateFilterState = dateUtils.DateFilterState;
type AuthMethodsConfig = {
    api_v1: boolean;
    api_v2: boolean;
    cms: boolean;
};

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

const ABOUT_HAULZ_TEXT = `HAULZ — B2B-логистическая компания, работающая на направлении Москва ↔ Калининград.

Мы выстраиваем логистику на базе современных цифровых технологий, глубоких интеграций и электронного документооборота, что позволяет клиентам получать актуальные статусы, документы и закрывающие отчёты в цифровом виде.

Сервисы HAULZ могут интегрироваться с внутренними системами клиентов и обеспечивают быстрый доступ к счетам, УПД и данным по перевозкам через онлайн-кабинет, мини-приложение, API, бот.`;

const HAULZ_OFFICES: HaulzOffice[] = [
    { city: "Калининград", address: "Железнодорожная ул., 12к4", phone: "+7 (401) 227-95-55" },
    { city: "Москва / МО", address: "Индустриальный парк «Андреевское», вл. 14А", phone: "+7 (958) 538-42-22" },
];

const HAULZ_EMAIL = "Info@haulz.pro";

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
        if (!auth?.login || !auth?.password) {
            setItems([]);
            setLoading(false);
            return;
        }
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
                    ...(auth.inn ? { inn: auth.inn } : {}),
                    ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
                }),
            });
            await ensureOk(res, "Ошибка загрузки данных");
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
                    Customer: item.Customer ?? item.customer,
                }))
            );
        } catch (e: any) {
            setError(e.message || "Ошибка загрузки данных");
        } finally {
            setLoading(false);
        }
    }, [auth]);

    // При смене аккаунта — перезапрос данных под выбранным аккаунтом
    useEffect(() => {
        loadStats(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange, loadStats, auth]);

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

            {showSums && (
                <>
            {/* Умные нотификации */}
            <Typography.Headline style={{ marginTop: '1.5rem', marginBottom: '0.75rem', fontSize: '1rem' }}>
                Умные нотификации
            </Typography.Headline>
            <Grid className="stats-grid" cols={2} gap={12}>
                <Panel
                    className="stat-card"
                    onClick={() => onOpenCargoFilters({ search: "не оплачен" })}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <CreditCard className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Счета
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {unpaidCount}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Не оплачено
                    </Typography.Label>
                </Panel>
                <Panel
                    className="stat-card"
                    onClick={() => onOpenCargoFilters({ status: "ready" })}
                    style={{ cursor: 'pointer' }}
                >
                    <div className="flex justify-between items-center mb-2">
                        <Check className="w-5 h-5 text-theme-primary" />
                        <Typography.Label className="text-xs text-theme-secondary">
                            Перевозки
                        </Typography.Label>
                    </div>
                    <Typography.Display className="text-2xl font-bold text-white">
                        {readyCount}
                    </Typography.Display>
                    <Typography.Label className="text-sm text-theme-secondary mt-1">
                        Готовы к выдаче
                    </Typography.Label>
                </Panel>
            </Grid>
                </>
            )}

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

// --- DASHBOARD PAGE (SECRET) ---
function DashboardPage({
    auth,
    onClose,
    onOpenCargoFilters,
    showSums = true,
    useServiceRequest = false,
    hasAnalytics = false,
    hasSupervisor = false,
}: {
    auth: AuthData;
    onClose: () => void;
    onOpenCargoFilters: (filters: { status?: StatusFilter; search?: string }) => void;
    /** false = роль только отправитель/получатель, раздел с суммами недоступен */
    showSums?: boolean;
    /** служебный режим: запрос перевозок только по датам (без INN и Mode) */
    useServiceRequest?: boolean;
    /** право «Аналитика»: показывать дашборд платёжного календаря (плановое поступление денег) */
    hasAnalytics?: boolean;
    /** право «Руководитель»: показывать дашборд платёжного календаря (дата создания счёта + дни на оплату из админки) */
    hasSupervisor?: boolean;
}) {
    const isVisibilityDeniedError = (message?: string | null) => {
        const raw = String(message || "").trim().toLowerCase();
        if (!raw) return false;
        return raw.includes("доступ") || raw.includes("недостаточно прав") || raw.includes("только для");
    };
    const showPaymentCalendar = hasAnalytics || hasSupervisor;
    const canViewTimesheetCostDashboard = hasAnalytics || hasSupervisor;
    const [debugInfo, setDebugInfo] = useState<string>("");
    // Виджеты дашборда включены по умолчанию.
    const WIDGET_1_FILTERS = true;
    const WIDGET_2_STRIP = true;
    const WIDGET_3_CHART = true;
    const WIDGET_4_SLA = true;
    const WIDGET_5_PAYMENT_CALENDAR = true;

    // Filters State (такие же как на странице грузов); при переключении вкладок восстанавливаем из localStorage
    const initDate = () => loadDateFilterState();
    const [dateFilter, setDateFilter] = useState<DateFilter>(() => initDate()?.dateFilter ?? "месяц");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(() => initDate()?.customDateFrom ?? DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(() => initDate()?.customDateTo ?? DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [dateDropdownMode, setDateDropdownMode] = useState<'main' | 'months' | 'years' | 'weeks'>('main');
    const [selectedMonthForFilter, setSelectedMonthForFilter] = useState<{ year: number; month: number } | null>(() => initDate()?.selectedMonthForFilter ?? null);
    const [selectedYearForFilter, setSelectedYearForFilter] = useState<number | null>(() => initDate()?.selectedYearForFilter ?? null);
    const [selectedWeekForFilter, setSelectedWeekForFilter] = useState<string | null>(() => initDate()?.selectedWeekForFilter ?? null);
    useEffect(() => {
        saveDateFilterState({ dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter });
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);
    const monthLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const monthWasLongPressRef = useRef(false);
    const yearLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const yearWasLongPressRef = useRef(false);
    const weekLongPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const weekWasLongPressRef = useRef(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);
    const [senderFilter, setSenderFilter] = useState<string>('');
    const [receiverFilter, setReceiverFilter] = useState<string>('');
    const [billStatusFilter, setBillStatusFilter] = useState<BillStatusFilterKey>('all');
    const [typeFilter, setTypeFilter] = useState<'all' | 'ferry' | 'auto'>('all');
    const [routeFilter, setRouteFilter] = useState<'all' | 'MSK-KGD' | 'KGD-MSK'>('all');
    const [isSenderDropdownOpen, setIsSenderDropdownOpen] = useState(false);
    const [isReceiverDropdownOpen, setIsReceiverDropdownOpen] = useState(false);
    const [isBillStatusDropdownOpen, setIsBillStatusDropdownOpen] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isRouteDropdownOpen, setIsRouteDropdownOpen] = useState(false);
    const dateButtonRef = useRef<HTMLDivElement>(null);
    const statusButtonRef = useRef<HTMLDivElement>(null);
    const senderButtonRef = useRef<HTMLDivElement>(null);
    const receiverButtonRef = useRef<HTMLDivElement>(null);
    const billStatusButtonRef = useRef<HTMLDivElement>(null);
    const typeButtonRef = useRef<HTMLDivElement>(null);
    const routeButtonRef = useRef<HTMLDivElement>(null);
    const [slaDetailsOpen, setSlaDetailsOpen] = useState(false);
    
    // Chart type selector: деньги / вес / объём (при !showSums доступны только вес и объём)
    const [chartType, setChartType] = useState<'money' | 'paidWeight' | 'weight' | 'volume' | 'pieces'>(() => (showSums ? 'money' : 'paidWeight'));
    const [stripTab, setStripTab] = useState<'type' | 'sender' | 'receiver' | 'customer'>('type');
    const [deliveryStripTab, setDeliveryStripTab] = useState<'type' | 'sender' | 'receiver'>('type');
    /** true = показывать проценты, false = показывать в рублях/кг/м³/шт (по типу графика) */
    const [stripShowAsPercent, setStripShowAsPercent] = useState(true);
    const [deliveryStripShowAsPercent, setDeliveryStripShowAsPercent] = useState(true);
    /** Раскрытая строка в таблице «Перевозки вне SLA»: по клику показываем статусы в виде таблицы */
    const [expandedSlaCargoNumber, setExpandedSlaCargoNumber] = useState<string | null>(null);
    const [expandedSlaItem, setExpandedSlaItem] = useState<CargoItem | null>(null);
    const [slaTimelineSteps, setSlaTimelineSteps] = useState<PerevozkaTimelineStep[] | null>(null);
    const [slaTimelineLoading, setSlaTimelineLoading] = useState(false);
    const [slaTimelineError, setSlaTimelineError] = useState<string | null>(null);
    /** Сортировка таблицы «Перевозки вне SLA»: колонка и направление */
    const [slaTableSortColumn, setSlaTableSortColumn] = useState<string | null>(null);
    const [slaTableSortOrder, setSlaTableSortOrder] = useState<'asc' | 'desc'>('asc');
    /** Платёжный календарь: дни на оплату по ИНН (для hasAnalytics) */
    const [paymentCalendarByInn, setPaymentCalendarByInn] = useState<Record<string, { days_to_pay: number; payment_weekdays: number[] }>>({});
    /** Рабочие графики заказчиков (для SLA при статусах «Готов к выдаче» / «На доставке») */
    const [workScheduleByInn, setWorkScheduleByInn] = useState<Record<string, WorkSchedule>>({});
    const [paymentCalendarLoading, setPaymentCalendarLoading] = useState(false);
    const [paymentCalendarMonth, setPaymentCalendarMonth] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });
    const [paymentCalendarSelectedDate, setPaymentCalendarSelectedDate] = useState<string | null>(null);
    const [timesheetDashboardPeriod, setTimesheetDashboardPeriod] = useState<{ year: number; month: number }>(() => {
        const n = new Date();
        return { year: n.getFullYear(), month: n.getMonth() + 1 };
    });
    const [timesheetAnalyticsLoading, setTimesheetAnalyticsLoading] = useState(false);
    const [timesheetAnalyticsError, setTimesheetAnalyticsError] = useState<string | null>(null);
    const [timesheetAnalyticsData, setTimesheetAnalyticsData] = useState<{
        totalHours: number;
        totalShifts: number;
        totalCost: number;
        totalPaid: number;
        totalOutstanding: number;
        employees: Array<{
            employeeId: number;
            fullName: string;
            department: string;
            position: string;
            accrualType: "hour" | "shift" | "month";
            accrualRate: number;
            active?: boolean;
            totalHours: number;
            totalShifts: number;
            totalCost: number;
            totalPaid: number;
            totalOutstanding: number;
        }>;
    } | null>(null);
    const normalizeDashboardAccrualType = (value: unknown): "hour" | "shift" | "month" => {
        const raw = String(value ?? "").trim().toLowerCase();
        if (!raw) return "hour";
        if (raw === "month" || raw === "месяц" || raw === "monthly") return "month";
        if (raw === "shift" || raw === "смена") return "shift";
        if (raw === "hour" || raw === "часы" || raw === "час") return "hour";
        if (raw.includes("month") || raw.includes("месяц")) return "month";
        return raw.includes("shift") || raw.includes("смен") ? "shift" : "hour";
    };
    const normalizeDashboardShiftMark = (rawValue: string): "Я" | "ПР" | "Б" | "ОГ" | "ОТ" | "УВ" | "" => {
        const raw = String(rawValue || "").trim().toUpperCase();
        if (!raw) return "";
        if (raw === "Я") return "Я";
        if (raw === "ПР") return "ПР";
        if (raw === "Б") return "Б";
        if (raw === "ОГ") return "ОГ";
        if (raw === "ОТ") return "ОТ";
        if (raw === "УВ") return "УВ";
        if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE" || raw === "ON" || raw === "YES") return "Я";
        if (raw.includes("СМЕН") || raw.includes("SHIFT")) return "Я";
        return "";
    };
    const parseDashboardHoursValue = (rawValue: string): number => {
        const raw = String(rawValue || "").trim();
        if (!raw) return 0;
        const timeMatch = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (timeMatch) {
            const h = Number(timeMatch[1]);
            const m = Number(timeMatch[2]);
            if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
        }
        const normalized = raw.replace(/\s+/g, "").replace(",", ".").replace(/[^\d.]/g, "");
        if (!normalized) return 0;
        const parsed = Number(normalized);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const timesheetDashboardMonthKey = useMemo(() => {
        return `${timesheetDashboardPeriod.year}-${String(timesheetDashboardPeriod.month).padStart(2, "0")}`;
    }, [timesheetDashboardPeriod.month, timesheetDashboardPeriod.year]);
    const timesheetDashboardDateRange = useMemo(() => {
        const { year, month } = timesheetDashboardPeriod;
        const lastDay = new Date(year, month, 0).getDate();
        return {
            dateFrom: `${year}-${String(month).padStart(2, "0")}-01`,
            dateTo: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
        };
    }, [timesheetDashboardPeriod.month, timesheetDashboardPeriod.year]);
    const timesheetDashboardYearOptions = useMemo(() => {
        const nowYear = new Date().getFullYear();
        const years = new Set<number>([nowYear - 2, nowYear - 1, nowYear, nowYear + 1, timesheetDashboardPeriod.year]);
        return Array.from(years).sort((a, b) => b - a);
    }, [timesheetDashboardPeriod.year]);

    const handleSlaTableSort = (column: string) => {
        if (slaTableSortColumn === column) {
            setSlaTableSortOrder(o => o === 'asc' ? 'desc' : 'asc');
        } else {
            setSlaTableSortColumn(column);
            setSlaTableSortOrder('asc');
        }
    };

    const sortOutOfSlaRows = <T extends { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> }>(rows: T[]): T[] => {
        if (!slaTableSortColumn) return rows;
        const order = slaTableSortOrder === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
            let va: string | number;
            let vb: string | number;
            switch (slaTableSortColumn) {
                case 'number': va = (a.item.Number ?? ''); vb = (b.item.Number ?? ''); break;
                case 'date': va = new Date(a.item.DatePrih || 0).getTime(); vb = new Date(b.item.DatePrih || 0).getTime(); break;
                case 'status': va = normalizeStatus(a.item.State) || ''; vb = normalizeStatus(b.item.State) || ''; break;
                case 'customer': va = stripOoo((a.item.Customer ?? (a.item as any).customer) ?? ''); vb = stripOoo((b.item.Customer ?? (b.item as any).customer) ?? ''); break;
                case 'mest': va = Number(a.item.Mest) || 0; vb = Number(b.item.Mest) || 0; break;
                case 'pw': va = Number(a.item.PW) || 0; vb = Number(b.item.PW) || 0; break;
                case 'sum': va = Number(a.item.Sum) || 0; vb = Number(b.item.Sum) || 0; break;
                case 'days': va = a.sla.actualDays; vb = b.sla.actualDays; break;
                case 'plan': va = a.sla.planDays; vb = b.sla.planDays; break;
                case 'delay': va = a.sla.delayDays; vb = b.sla.delayDays; break;
                default: return 0;
            }
            const cmp = typeof va === 'string' && typeof vb === 'string'
                ? va.localeCompare(vb)
                : (va < vb ? -1 : va > vb ? 1 : 0);
            return cmp * order;
        });
    };

    // При отключении раздела сумм (роль отправитель/получатель) переключаем тип графика с денег на вес
    useEffect(() => {
        if (!showSums && chartType === 'money') setChartType('paidWeight');
    }, [showSums]);
    useEffect(() => {
        if (!showSums) {
            setStripShowAsPercent(true);
            setDeliveryStripShowAsPercent(true);
        }
    }, [showSums]);

    // При выключении служебного режима сбрасываем вкладку «Заказчик»
    useEffect(() => {
        if (!useServiceRequest && stripTab === 'customer') setStripTab('type');
    }, [useServiceRequest, stripTab]);

    // Загрузка статусов перевозки при раскрытии строки в таблице «Перевозки вне SLA»
    useEffect(() => {
        if (!expandedSlaCargoNumber || !expandedSlaItem || !auth?.login || !auth?.password) {
            setSlaTimelineSteps(null);
            setSlaTimelineError(null);
            return;
        }
        let cancelled = false;
        setSlaTimelineLoading(true);
        setSlaTimelineError(null);
        fetchPerevozkaTimeline(auth, expandedSlaCargoNumber, expandedSlaItem)
            .then((steps) => { if (!cancelled) setSlaTimelineSteps(steps); })
            .catch((e: any) => { if (!cancelled) setSlaTimelineError(e?.message || 'Не удалось загрузить статусы'); })
            .finally(() => { if (!cancelled) setSlaTimelineLoading(false); });
        return () => { cancelled = true; };
    }, [expandedSlaCargoNumber, expandedSlaItem, auth?.login, auth?.password]);

    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const logs: string[] = [];
        
        logs.push(`Time: ${new Date().toISOString()}`);
        logs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        logs.push(`window.WebApp: ${!!(window as any).WebApp}`);
        logs.push(`window.Telegram.WebApp: ${!!window.Telegram?.WebApp}`);
        
        if (webApp) {
            logs.push(`initData: ${webApp.initData ? "present" : "absent"}`);
            logs.push(`initDataUnsafe keys: ${Object.keys(webApp.initDataUnsafe || {}).join(", ")}`);
            if (webApp.initDataUnsafe?.user) {
                logs.push(`user: ${JSON.stringify(webApp.initDataUnsafe.user)}`);
            }
            if (webApp.initDataUnsafe?.chat) {
                logs.push(`chat: ${JSON.stringify(webApp.initDataUnsafe.chat)}`);
            }
            
            const chatId = webApp.initDataUnsafe?.user?.id || webApp.initDataUnsafe?.chat?.id;
            logs.push(`Detected chatId: ${chatId}`);
            
            if (chatId) {
                try {
                    logs.push("Sending test message...");
                    const res = await fetch('/api/max-send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            chatId, 
                            text: `🛠 ТЕСТ ИЗ ДАШБОРДА\nChatID: ${chatId}\nTime: ${new Date().toLocaleTimeString()}` 
                        })
                    });
                    const resData = await res.json().catch(() => ({}));
                    logs.push(`Response status: ${res.status}`);
                    logs.push(`Response data: ${JSON.stringify(resData)}`);
                } catch (e: any) {
                    logs.push(`Error: ${e.message}`);
                }
            } else {
                logs.push("Error: No chatId found!");
            }
        } else {
            logs.push("Error: WebApp is not available!");
        }
        
        setDebugInfo(logs.join("\n"));
        console.log("[testMaxMessage]", logs);
    };

    // Один useMemo для дат (как в CargoPage), чтобы при минификации не было TDZ
    const { apiDateRange, prevRange } = useMemo(() => {
        const api =
            dateFilter === "период"
                ? { dateFrom: customDateFrom, dateTo: customDateTo }
                : dateFilter === "месяц" && selectedMonthForFilter
                    ? (() => {
                        const { year, month } = selectedMonthForFilter;
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const lastDay = new Date(year, month, 0).getDate();
                        return { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                    })()
                    : dateFilter === "год" && selectedYearForFilter
                        ? { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` }
                        : dateFilter === "неделя" && selectedWeekForFilter
                            ? getWeekRange(selectedWeekForFilter)
                            : getDateRange(dateFilter);
        const prev = getPreviousPeriodRange(dateFilter, api.dateFrom, api.dateTo);
        return { apiDateRange: api, prevRange: prev };
    }, [dateFilter, customDateFrom, customDateTo, selectedMonthForFilter, selectedYearForFilter, selectedWeekForFilter]);

    const { items, error, loading, mutate: mutatePerevozki } = usePerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        useServiceRequest,
        inn: !useServiceRequest ? auth.inn : undefined,
    });
    const { items: prevPeriodItems, loading: prevPeriodLoading } = usePrevPeriodPerevozki({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        dateFromPrev: prevRange?.dateFrom ?? '',
        dateToPrev: prevRange?.dateTo ?? '',
        useServiceRequest: true,
        enabled: !!useServiceRequest && !!prevRange,
    });
    const { items: invoiceItems } = useInvoices({
        auth,
        dateFrom: apiDateRange.dateFrom,
        dateTo: apiDateRange.dateTo,
        activeInn: !useServiceRequest ? auth?.inn : undefined,
        useServiceRequest,
    });

    const calendarYear = new Date().getFullYear();
    const calendarDateFrom = `${calendarYear - 1}-01-01`;
    const calendarDateTo = `${calendarYear + 1}-12-31`;
    const { items: calendarInvoiceItems, mutate: mutateCalendarInvoices } = useInvoices({
        auth: showPaymentCalendar ? auth : null,
        dateFrom: calendarDateFrom,
        dateTo: calendarDateTo,
        activeInn: !useServiceRequest ? auth?.inn : undefined,
        useServiceRequest,
    });

    useEffect(() => {
        if (!useServiceRequest) return;
        const handler = () => void mutatePerevozki(undefined, { revalidate: true });
        window.addEventListener('haulz-service-refresh', handler);
        return () => window.removeEventListener('haulz-service-refresh', handler);
    }, [useServiceRequest, mutatePerevozki]);

    useEffect(() => {
        if (!showPaymentCalendar || !auth?.login || !auth?.password) return;
        let cancelled = false;
        setPaymentCalendarLoading(true);
        fetch('/api/my-payment-calendar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: auth.login, password: auth.password }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_to_pay: number; payment_weekdays?: number[] }[]; work_schedules?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const map: Record<string, { days_to_pay: number; payment_weekdays: number[] }> = {};
                (data?.items ?? []).forEach((row) => {
                    if (row?.inn == null) return;
                    const inn = String(row.inn).trim();
                    const days = Math.max(0, Number(row.days_to_pay) || 0);
                    const weekdays = Array.isArray(row.payment_weekdays) ? row.payment_weekdays.filter((d) => d >= 1 && d <= 5) : [];
                    map[inn] = { days_to_pay: days, payment_weekdays: weekdays };
                });
                setPaymentCalendarByInn(map);
                const ws: Record<string, WorkSchedule> = {};
                (data?.work_schedules ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { if (!cancelled) setPaymentCalendarByInn({}); })
            .finally(() => { if (!cancelled) setPaymentCalendarLoading(false); });
        return () => { cancelled = true; };
    }, [showPaymentCalendar, auth?.login, auth?.password]);

    useEffect(() => {
        if (!canViewTimesheetCostDashboard || !auth?.login || !auth?.password) {
            setTimesheetAnalyticsData(null);
            setTimesheetAnalyticsError(null);
            return;
        }
        let cancelled = false;
        setTimesheetAnalyticsLoading(true);
        setTimesheetAnalyticsError(null);
        fetch('/api/my-department-timesheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: auth.login,
                password: auth.password,
                month: timesheetDashboardMonthKey,
            }),
        })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
                if (cancelled) return;
                if (!ok) throw new Error(data?.error || 'Ошибка загрузки данных табеля');
                const employees = Array.isArray(data?.employees) ? data.employees : [];
                const entriesRaw = data?.entries && typeof data.entries === "object" ? (data.entries as Record<string, string>) : {};
                const payoutsByEmployeeRaw = data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object"
                    ? (data.payoutsByEmployee as Record<string, number>)
                    : {};
                const shiftRateOverridesRaw = data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object"
                    ? (data.shiftRateOverrides as Record<string, number>)
                    : {};
                const employeeRows = employees.map((row: any) => ({
                    employeeId: Number(row?.id || 0),
                    fullName: String(row?.fullName || ""),
                    department: String(row?.department || ""),
                    position: String(row?.position || ""),
                    accrualType: normalizeDashboardAccrualType(row?.accrualType),
                    accrualRate: Number(row?.accrualRate || 0),
                    active: row?.active !== false,
                })).filter((x: any) =>
                    Number.isFinite(x.employeeId)
                    && x.employeeId > 0
                );
                const entriesByEmployee = new Map<number, Array<{ date: string; value: string }>>();
                for (const [entryKey, entryValue] of Object.entries(entriesRaw)) {
                    const match = /^(\d+)__(\d{4}-\d{2}-\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    const employeeId = Number(match[1]);
                    const dateIso = match[2];
                    if (!Number.isFinite(employeeId) || employeeId <= 0) continue;
                    const list = entriesByEmployee.get(employeeId) || [];
                    list.push({ date: dateIso, value: String(entryValue || "") });
                    entriesByEmployee.set(employeeId, list);
                }
                let totalHours = 0;
                let totalShifts = 0;
                let totalCost = 0;
                let totalPaid = 0;
                const employeeStats = employeeRows.map((employee: any) => {
                    const values = entriesByEmployee.get(employee.employeeId) || [];
                    const hasShiftMarks = values.some((v) => normalizeDashboardShiftMark(v.value) !== "");
                    const hasNumericHours = values.some((v) => parseDashboardHoursValue(v.value) > 0);
                    const resolvedAccrualType: "hour" | "shift" | "month" =
                        employee.accrualType === "month"
                            ? "month"
                            : (employee.accrualType === "shift" || (hasShiftMarks && !hasNumericHours) ? "shift" : "hour");
                    let employeeShifts = 0;
                    let employeeHours = 0;
                    let employeeCost = 0;
                    if (resolvedAccrualType === "shift" || resolvedAccrualType === "month") {
                        employeeShifts = values.reduce((acc, v) => acc + (normalizeDashboardShiftMark(v.value) === "Я" ? 1 : 0), 0);
                        employeeHours = employeeShifts * 8;
                        employeeCost = values.reduce((acc, v) => {
                            if (normalizeDashboardShiftMark(v.value) !== "Я") return acc;
                            const overrideKey = `${employee.employeeId}__${v.date}`;
                            const overrideRate = Number(shiftRateOverridesRaw[overrideKey]);
                            const baseRate = Number(employee.accrualRate || 0);
                            const dayRate = resolvedAccrualType === "month"
                                ? baseRate / 21
                                : (Number.isFinite(overrideRate) ? overrideRate : baseRate);
                            return acc + dayRate;
                        }, 0);
                    } else {
                        employeeHours = values.reduce((acc, v) => acc + parseDashboardHoursValue(v.value), 0);
                        employeeCost = employeeHours * Number(employee.accrualRate || 0);
                    }
                    const employeePaid = Number(payoutsByEmployeeRaw[String(employee.employeeId)] || 0);
                    const employeeOutstanding = Math.max(0, Number((employeeCost - employeePaid).toFixed(2)));
                    totalHours += employeeHours;
                    totalShifts += employeeShifts;
                    totalCost += employeeCost;
                    totalPaid += employeePaid;
                    return {
                        ...employee,
                        totalHours: Number(employeeHours.toFixed(2)),
                        totalShifts: Number(employeeShifts || 0),
                        totalCost: Number(employeeCost.toFixed(2)),
                        totalPaid: Number(employeePaid.toFixed(2)),
                        totalOutstanding: employeeOutstanding,
                    };
                });
                setTimesheetAnalyticsData({
                    totalHours: Number(totalHours.toFixed(2)),
                    totalShifts: Number(totalShifts || 0),
                    totalCost: Number(totalCost.toFixed(2)),
                    totalPaid: Number(totalPaid.toFixed(2)),
                    totalOutstanding: Math.max(0, Number((totalCost - totalPaid).toFixed(2))),
                    employees: employeeStats,
                });
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setTimesheetAnalyticsError((e as Error)?.message || 'Ошибка загрузки данных табеля');
                setTimesheetAnalyticsData(null);
            })
            .finally(() => {
                if (!cancelled) setTimesheetAnalyticsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [canViewTimesheetCostDashboard, auth?.login, auth?.password, timesheetDashboardMonthKey]);

    const unpaidCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getPaymentFilterKey(item.StateBill) === "unpaid").length;
    }, [items]);

    const readyCount = useMemo(() => {
        return items.filter(item => !isReceivedInfoStatus(item.State) && getFilterKeyByStatus(item.State) === "ready").length;
    }, [items]);

    const uniqueSenders = useMemo(() => [...new Set(items.map(i => (i.Sender ?? '').trim()).filter(Boolean))].sort(), [items]);
    const uniqueReceivers = useMemo(() => [...new Set(items.map(i => (i.Receiver ?? (i as any).receiver ?? '').trim()).filter(Boolean))].sort(), [items]);
    
    // Фильтрация
    const filteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            // Фильтр избранных (если нужно)
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [items, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter]);

    useEffect(() => {
        if (!useServiceRequest || !auth?.login || !auth?.password || filteredItems.length === 0) return;
        const inns = [...new Set(filteredItems.map((i) => getInnFromCargo(i)).filter((x): x is string => !!x))];
        if (inns.length === 0) return;
        let cancelled = false;
        fetch('/api/customer-work-schedules', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: auth.login, password: auth.password, inns }),
        })
            .then((r) => r.json())
            .then((data: { items?: { inn: string; days_of_week: number[]; work_start: string; work_end: string }[] }) => {
                if (cancelled) return;
                const ws: Record<string, WorkSchedule> = {};
                (data?.items ?? []).forEach((r) => {
                    if (r?.inn) ws[r.inn.trim()] = { days_of_week: r.days_of_week ?? [1, 2, 3, 4, 5], work_start: r.work_start || '09:00', work_end: r.work_end || '18:00' };
                });
                if (!cancelled) setWorkScheduleByInn((prev) => ({ ...prev, ...ws }));
            })
            .catch(() => { /* ignore */ });
        return () => { cancelled = true; };
    }, [useServiceRequest, auth?.login, auth?.password, filteredItems]);

    /** Фильтрация данных предыдущего периода (те же фильтры, что и для текущего) */
    const filteredPrevPeriodItems = useMemo(() => {
        if (!useServiceRequest || prevPeriodItems.length === 0) return [];
        let res = prevPeriodItems.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        } else if (statusFilter !== 'all') {
            res = res.filter(i => getFilterKeyByStatus(i.State) === statusFilter);
        }
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [prevPeriodItems, useServiceRequest, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter]);

    /** Плановое поступление по счетам: срок в календарных днях; при наступлении срока — первый платёжный день недели (если заданы) или первый рабочий день. */
    const plannedByDate = useMemo(() => {
        const map = new Map<string, { total: number; items: { customer: string; sum: number; number?: string }[] }>();
        const invDate = (inv: any): string => {
            const raw = String(inv?.DateDoc ?? inv?.Date ?? inv?.date ?? inv?.dateDoc ?? inv?.Дата ?? '').trim();
            if (!raw) return '';
            const parsed = dateUtils.parseDateOnly(raw);
            if (!parsed) return '';
            const y = parsed.getFullYear();
            const m = String(parsed.getMonth() + 1).padStart(2, '0');
            const d = String(parsed.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        const invSum = (inv: any) => {
            const v = inv?.SumDoc ?? inv?.Sum ?? inv?.sum ?? inv?.Сумма ?? inv?.Amount ?? 0;
            return typeof v === 'string' ? parseFloat(v) || 0 : Number(v) || 0;
        };
        const invInn = (inv: any) =>
            String(
                inv?.INN ??
                inv?.Inn ??
                inv?.inn ??
                inv?.CustomerINN ??
                inv?.CustomerInn ??
                inv?.INNCustomer ??
                inv?.InnCustomer ??
                inv?.КонтрагентИНН ??
                ''
            )
                .replace(/\D/g, '')
                .trim();
        const invCustomer = (inv: any) => String(inv?.Customer ?? inv?.customer ?? inv?.Контрагент ?? inv?.Contractor ?? inv?.Organization ?? '').trim() || '—';
        const invNumber = (inv: any) => (inv?.Number ?? inv?.number ?? inv?.Номер ?? inv?.N ?? '').toString();
        const invStatus = (inv: any) => normalizeInvoiceStatus(inv?.Status ?? inv?.State ?? inv?.state ?? inv?.Статус ?? inv?.status ?? inv?.PaymentStatus ?? '');
        (calendarInvoiceItems ?? []).forEach((inv: any) => {
            const dateStr = invDate(inv);
            if (!dateStr) return;
            // Календарь строим по счетам, выставленным в выбранном периоде (Date filter).
            if (dateStr < apiDateRange.dateFrom || dateStr > apiDateRange.dateTo) return;
            // Учитываем только не оплаченные/частично оплаченные счета.
            const status = invStatus(inv);
            if (status === 'Оплачен') return;
            const sum = invSum(inv);
            if (sum <= 0) return;
            const inn = invInn(inv) || String(auth?.inn ?? '').replace(/\D/g, '').trim();
            const cal = paymentCalendarByInn[inn] ?? { days_to_pay: 0, payment_weekdays: [] };
            const days = cal.days_to_pay ?? 0;
            const weekdays = cal.payment_weekdays ?? [];
            const parsedDate = dateUtils.parseDateOnly(dateStr);
            if (!parsedDate) return;
            const d = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate());
            d.setDate(d.getDate() + days);
            const deadline = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            const key = weekdays.length > 0 ? getFirstPaymentWeekdayOnOrAfter(deadline, weekdays) : getFirstWorkingDayOnOrAfter(deadline);
            const customer = invCustomer(inv);
            const entry = map.get(key);
            if (!entry) {
                map.set(key, { total: sum, items: [{ customer, sum, number: invNumber(inv) }] });
            } else {
                entry.total += sum;
                entry.items.push({ customer, sum, number: invNumber(inv) });
            }
        });
        return map;
    }, [calendarInvoiceItems, paymentCalendarByInn, apiDateRange.dateFrom, apiDateRange.dateTo, auth?.inn]);
    
    // Подготовка данных для графиков (группировка по датам)
    const chartData = useMemo(() => {
        const dataMap = new Map<string, { date: string; sum: number; pw: number; w: number; mest: number; vol: number }>();
        
        filteredItems.forEach(item => {
            if (!item.DatePrih) return;
            const dateKey = item.DatePrih.split('T')[0];
            const displayDate = formatDate(item.DatePrih);
            if (!dateKey || displayDate === '-') return;
            const existing = dataMap.get(dateKey) || { date: displayDate, dateKey, sum: 0, pw: 0, w: 0, mest: 0, vol: 0 };
            existing.sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            existing.pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            existing.w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            existing.mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            existing.vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            dataMap.set(dateKey, existing);
        });
        return Array.from(dataMap.values()).sort((a, b) => (a.dateKey || a.date).localeCompare(b.dateKey || b.date));
    }, [filteredItems]);

    const DIAGRAM_COLORS = ['#06b6d4', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444', '#84cc16'];
    const stripTotals = useMemo(() => {
        let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
        filteredItems.forEach(item => {
            sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        });
        return { sum, pw, w, vol, mest };
    }, [filteredItems]);
    const timesheetPaidWeight = useMemo(() => {
        return items.reduce((acc, item) => {
            if (isReceivedInfoStatus(item.State)) return acc;
            const dateRaw = item.DatePrih || item.DateVr || "";
            const date = String(dateRaw).slice(0, 10);
            if (!date || date < timesheetDashboardDateRange.dateFrom || date > timesheetDashboardDateRange.dateTo) return acc;
            const pw = typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            return acc + pw;
        }, 0);
    }, [items, timesheetDashboardDateRange.dateFrom, timesheetDashboardDateRange.dateTo]);
    const companyTimesheetSummary = useMemo(() => ({
        totalHours: Number(timesheetAnalyticsData?.totalHours || 0),
        totalShifts: Number(timesheetAnalyticsData?.totalShifts || 0),
        totalMoney: Number(timesheetAnalyticsData?.totalCost || 0),
        totalPaid: Number(timesheetAnalyticsData?.totalPaid || 0),
        totalOutstanding: Number(timesheetAnalyticsData?.totalOutstanding || 0),
    }), [timesheetAnalyticsData?.totalHours, timesheetAnalyticsData?.totalShifts, timesheetAnalyticsData?.totalCost, timesheetAnalyticsData?.totalPaid, timesheetAnalyticsData?.totalOutstanding]);
    const timesheetCostPerKg = useMemo(() => {
        const totalCost = companyTimesheetSummary.totalMoney;
        if (!(timesheetPaidWeight > 0)) return 0;
        return totalCost / timesheetPaidWeight;
    }, [companyTimesheetSummary.totalMoney, timesheetPaidWeight]);
    const topEmployeesByTimesheetCost = useMemo(() => {
        const list = timesheetAnalyticsData?.employees || [];
        return [...list]
            .sort((a, b) => Number(b.totalCost || 0) - Number(a.totalCost || 0))
            .slice(0, 5);
    }, [timesheetAnalyticsData?.employees]);
    const timesheetByDepartment = useMemo(() => {
        const rows = timesheetAnalyticsData?.employees || [];
        const grouped = new Map<string, { department: string; totalCost: number; totalPaid: number; totalOutstanding: number; totalHours: number; totalShifts: number; employeeCount: number }>();
        for (const row of rows) {
            const department = String(row.department || '').trim() || 'Без подразделения';
            const current = grouped.get(department) || { department, totalCost: 0, totalPaid: 0, totalOutstanding: 0, totalHours: 0, totalShifts: 0, employeeCount: 0 };
            current.totalCost += Number(row.totalCost || 0);
            current.totalPaid += Number(row.totalPaid || 0);
            current.totalOutstanding += Number(row.totalOutstanding || 0);
            current.totalHours += Number(row.totalHours || 0);
            current.totalShifts += Number(row.totalShifts || 0);
            current.employeeCount += 1;
            grouped.set(department, current);
        }
        const totalCost = companyTimesheetSummary.totalMoney;
        return Array.from(grouped.values())
            .map((row) => ({
                ...row,
                share: totalCost > 0 ? (row.totalCost / totalCost) * 100 : 0,
                costPerKg: timesheetPaidWeight > 0 ? row.totalCost / timesheetPaidWeight : 0,
            }))
            .sort((a, b) => b.totalCost - a.totalCost);
    }, [timesheetAnalyticsData?.employees, companyTimesheetSummary.totalMoney, timesheetPaidWeight]);
    const getValForChart = useCallback((item: CargoItem) => {
        if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
        if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
        if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
        if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
    }, [chartType]);

    /** Монитор доставки: только статус «доставлено» с DateVr в выбранном периоде (без фильтра по заказчику) */
    const deliveryFilteredItems = useMemo(() => {
        let res = items.filter(i => !isReceivedInfoStatus(i.State));
        if (statusFilter === 'favorites') {
            const favorites = JSON.parse(localStorage.getItem('haulz.favorites') || '[]') as string[];
            res = res.filter(i => i.Number && favorites.includes(i.Number));
        }
        res = res.filter(i => getFilterKeyByStatus(i.State) === 'delivered' && isDateInRange(i.DateVr, apiDateRange.dateFrom, apiDateRange.dateTo));
        if (senderFilter) res = res.filter(i => (i.Sender ?? '').trim() === senderFilter);
        if (receiverFilter) res = res.filter(i => (i.Receiver ?? (i as any).receiver ?? '').trim() === receiverFilter);
        if (billStatusFilter !== 'all') res = res.filter(i => getPaymentFilterKey(i.StateBill) === billStatusFilter);
        if (typeFilter === 'ferry') res = res.filter(i => i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1);
        if (typeFilter === 'auto') res = res.filter(i => !(i?.AK === true || i?.AK === 'true' || i?.AK === '1' || i?.AK === 1));
        if (routeFilter === 'MSK-KGD') res = res.filter(i => cityToCode(i.CitySender) === 'MSK' && cityToCode(i.CityReceiver) === 'KGD');
        if (routeFilter === 'KGD-MSK') res = res.filter(i => cityToCode(i.CitySender) === 'KGD' && cityToCode(i.CityReceiver) === 'MSK');
        return res;
    }, [items, statusFilter, senderFilter, receiverFilter, billStatusFilter, typeFilter, routeFilter, apiDateRange]);
    const deliveryStripTotals = useMemo(() => {
        let sum = 0, pw = 0, w = 0, vol = 0, mest = 0;
        deliveryFilteredItems.forEach(item => {
            sum += typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            pw += typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            w += typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            vol += typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
            mest += typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
        });
        return { sum, pw, w, vol, mest };
    }, [deliveryFilteredItems]);
    const deliveryStripDiagramByType = useMemo(() => {
        let autoVal = 0, ferryVal = 0;
        deliveryFilteredItems.forEach(item => {
            const v = getValForChart(item);
            if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
            else autoVal += v;
        });
        const total = autoVal + ferryVal || 1;
        return [
            { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0] },
            { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1] },
        ];
    }, [deliveryFilteredItems, chartType, getValForChart]);
    const deliveryStripDiagramBySender = useMemo(() => {
        const map = new Map<string, number>();
        deliveryFilteredItems.forEach(item => {
            const key = (item.Sender ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => ({ name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [deliveryFilteredItems, chartType, getValForChart]);
    const deliveryStripDiagramByReceiver = useMemo(() => {
        const map = new Map<string, number>();
        deliveryFilteredItems.forEach(item => {
            const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => ({ name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [deliveryFilteredItems, chartType, getValForChart]);

    const stripDiagramByType = useMemo(() => {
        let autoVal = 0, ferryVal = 0;
        filteredItems.forEach(item => {
            const v = getValForChart(item);
            if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryVal += v;
            else autoVal += v;
        });
        let autoPrev = 0, ferryPrev = 0;
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const v = getValForChart(item);
                if (item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1) ferryPrev += v;
                else autoPrev += v;
            });
        }
        const total = autoVal + ferryVal || 1;
        const dynamics = (cur: number, prev: number): number | null => {
            if (!hasPrev) return null;
            if (prev === 0) return cur > 0 ? 100 : null;
            return Math.round(((cur - prev) / prev) * 100);
        };
        return [
            { label: 'Авто', value: autoVal, percent: Math.round((autoVal / total) * 100), color: DIAGRAM_COLORS[0], dynamics: dynamics(autoVal, autoPrev) },
            { label: 'Паром', value: ferryVal, percent: Math.round((ferryVal / total) * 100), color: DIAGRAM_COLORS[1], dynamics: dynamics(ferryVal, ferryPrev) },
        ];
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const slaStats = useMemo(() => {
        const withSla = filteredItems.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
        const total = withSla.length;
        const onTime = withSla.filter(s => s.onTime).length;
        const delayed = withSla.filter(s => !s.onTime);
        const avgDelay = delayed.length > 0
            ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length)
            : 0;
        // Мин/макс/среднее только по неотрицательным срокам доставки (ошибки дат дают отрицательные значения)
        const actualDaysValid = withSla.map(s => s.actualDays).filter(d => d >= 0);
        const minDays = actualDaysValid.length ? Math.min(...actualDaysValid) : 0;
        const maxDays = actualDaysValid.length ? Math.max(...actualDaysValid) : 0;
        const avgDays = actualDaysValid.length ? Math.round(actualDaysValid.reduce((a, b) => a + b, 0) / actualDaysValid.length) : 0;
        return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay, minDays, maxDays, avgDays };
    }, [filteredItems, workScheduleByInn]);

    const slaStatsByType = useMemo(() => {
        const autoItems = filteredItems.filter(i => !isFerry(i));
        const ferryItems = filteredItems.filter(i => isFerry(i));
        const calc = (arr: CargoItem[]) => {
            const withSla = arr.map(i => getSlaInfo(i, workScheduleByInn)).filter((s): s is NonNullable<ReturnType<typeof getSlaInfo>> => s != null);
            const total = withSla.length;
            const onTime = withSla.filter(s => s.onTime).length;
            const delayed = withSla.filter(s => !s.onTime);
            const avgDelay = delayed.length > 0 ? Math.round(delayed.reduce((sum, s) => sum + s.delayDays, 0) / delayed.length) : 0;
            return { total, onTime, percentOnTime: total ? Math.round((onTime / total) * 100) : 0, avgDelay };
        };
        return { auto: calc(autoItems), ferry: calc(ferryItems) };
    }, [filteredItems, workScheduleByInn]);

    /** Перевозки вне SLA по типу (для таблицы в подробностях, только в служебном режиме) */
    const outOfSlaByType = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null && !x.sla.onTime);
        return {
            auto: withSla.filter(x => !isFerry(x.item)),
            ferry: withSla.filter(x => isFerry(x.item)),
        };
    }, [filteredItems, workScheduleByInn]);

    const sortedOutOfSlaAuto = useMemo(() => sortOutOfSlaRows(outOfSlaByType.auto), [outOfSlaByType.auto, slaTableSortColumn, slaTableSortOrder]);
    const sortedOutOfSlaFerry = useMemo(() => sortOutOfSlaRows(outOfSlaByType.ferry), [outOfSlaByType.ferry, slaTableSortColumn, slaTableSortOrder]);

    const slaTrend = useMemo(() => {
        const withSla = filteredItems
            .map(i => ({ item: i, sla: getSlaInfo(i, workScheduleByInn) }))
            .filter((x): x is { item: CargoItem; sla: NonNullable<ReturnType<typeof getSlaInfo>> } => x.sla != null);
        if (withSla.length < 4) return null;
        const sorted = [...withSla].sort((a, b) => (new Date(a.item.DateVr || 0).getTime()) - (new Date(b.item.DateVr || 0).getTime()));
        const mid = Math.floor(sorted.length / 2);
        const first = sorted.slice(0, mid);
        const second = sorted.slice(mid);
        const p1 = first.length ? Math.round((first.filter(x => x.sla.onTime).length / first.length) * 100) : 0;
        const p2 = second.length ? Math.round((second.filter(x => x.sla.onTime).length / second.length) * 100) : 0;
        if (p2 > p1) return 'up';
        if (p2 < p1) return 'down';
        return null;
    }, [filteredItems, workScheduleByInn]);

    const stripDiagramBySender = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Sender ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Sender ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByReceiver = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Receiver ?? (item as any).receiver ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);
    const stripDiagramByCustomer = useMemo(() => {
        const map = new Map<string, number>();
        const prevMap = new Map<string, number>();
        filteredItems.forEach(item => {
            const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
            map.set(key, (map.get(key) || 0) + getValForChart(item));
        });
        const hasPrev = useServiceRequest && filteredPrevPeriodItems.length > 0;
        if (hasPrev) {
            filteredPrevPeriodItems.forEach(item => {
                const key = (item.Customer ?? (item as any).customer ?? '').trim() || '—';
                prevMap.set(key, (prevMap.get(key) || 0) + getValForChart(item));
            });
        }
        const total = [...map.values()].reduce((a, b) => a + b, 0) || 1;
        return [...map.entries()]
            .map(([name, value], i) => {
                const prevVal = prevMap.get(name) ?? 0;
                const dynamics = hasPrev ? (prevVal === 0 ? (value > 0 ? 100 : null) : Math.round(((value - prevVal) / prevVal) * 100)) : null;
                return { name: stripOoo(name), value, percent: Math.round((value / total) * 100), color: DIAGRAM_COLORS[i % DIAGRAM_COLORS.length], dynamics };
            })
            .sort((a, b) => b.value - a.value);
    }, [filteredItems, filteredPrevPeriodItems, useServiceRequest, chartType, getValForChart]);

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
                    <Flex style={{ gap: '0.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("месяц")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За месяц
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setDateFilter("все")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            За всё время
                        </Button>
                        <Button className="filter-button" type="button" onClick={() => setStatusFilter("all")} style={{ fontSize: '0.85rem', padding: '0.5rem 0.75rem' }}>
                            Сбросить фильтр статуса
                        </Button>
                    </Flex>
                </Panel>
            );
        }
        
        // Округляем значения до целых
        const roundedData = data.map(d => ({ ...d, value: Math.round(d.value) }));
        const maxValue = Math.max(...roundedData.map(d => d.value), 1);
        const scaleMax = maxValue * 1.1; // Максимум шкалы = max + 10%
        
        const chartHeight = 250;
        const paddingLeft = 60;
        const paddingRight = 30;
        const paddingTop = 30;
        const paddingBottom = 80;
        const availableWidth = 350;
        const barSpacing = 6;
        const barWidth = Math.max(12, (availableWidth - paddingLeft - paddingRight - (roundedData.length - 1) * barSpacing) / roundedData.length);
        const chartWidth = paddingLeft + paddingRight + roundedData.length * (barWidth + barSpacing) - barSpacing;
        const availableHeight = chartHeight - paddingTop - paddingBottom;
        
        // Градиенты для столбцов (полутона, сложные)
        const gradientId = `gradient-${color.replace('#', '')}`;
        // Создаем более светлый и темный оттенки для градиента
        const hexToRgb = (hex: string) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        const rgb = hexToRgb(color);
        const lightColor = rgb ? `rgb(${Math.min(255, rgb.r + 40)}, ${Math.min(255, rgb.g + 40)}, ${Math.min(255, rgb.b + 40)})` : color;
        const darkColor = rgb ? `rgb(${Math.max(0, rgb.r - 30)}, ${Math.max(0, rgb.g - 30)}, ${Math.max(0, rgb.b - 30)})` : color;
        
        return (
            <div>
                <div style={{ overflowX: 'auto', width: '100%' }}>
                    <svg 
                        width={Math.max(chartWidth, '100%')} 
                        height={chartHeight}
                        style={{ minWidth: `${chartWidth}px`, display: 'block' }}
                    >
                        {/* Определение градиента */}
                        <defs>
                            <linearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={lightColor} stopOpacity="0.9" />
                                <stop offset="100%" stopColor={darkColor} stopOpacity="0.6" />
                            </linearGradient>
                        </defs>
                        
                        {/* Горизонтальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={chartHeight - paddingBottom} 
                            x2={chartWidth - paddingRight} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Вертикальная ось */}
                        <line 
                            x1={paddingLeft} 
                            y1={paddingTop} 
                            x2={paddingLeft} 
                            y2={chartHeight - paddingBottom} 
                            stroke="var(--color-border)" 
                            strokeWidth="1.5" 
                            opacity="0.5"
                        />
                        
                        {/* Столбцы */}
                        {roundedData.map((d, idx) => {
                            const barHeight = (d.value / scaleMax) * availableHeight;
                            const x = paddingLeft + idx * (barWidth + barSpacing);
                            const y = chartHeight - paddingBottom - barHeight;
                            
                            return (
                                <g key={idx}>
                                    {/* Столбец с градиентом */}
                                    <rect
                                        x={x}
                                        y={y}
                                        width={barWidth}
                                        height={barHeight}
                                        fill={`url(#${gradientId})`}
                                        rx="4"
                                        style={{ transition: 'all 0.3s ease' }}
                                    />
                                    
                                    {/* Значение вертикально внутри столбца */}
                                    {barHeight > 20 && (
                                        <text
                                            x={x + barWidth / 2}
                                            y={y + barHeight / 2}
                                            fontSize="7"
                                            fill="var(--color-text-primary)"
                                            textAnchor="middle"
                                            fontWeight="600"
                                            dominantBaseline="middle"
                                            transform={`rotate(-90 ${x + barWidth / 2} ${y + barHeight / 2})`}
                                        >
                                            {formatValue(d.value)}
                                        </text>
                                    )}
                                    
                                    {/* Дата вертикально под столбцом: день 1 раз, выходные/праздники — красным */}
                                    <text
                                        x={x + barWidth / 2}
                                        y={chartHeight - paddingBottom + 20}
                                        fontSize="10"
                                        fill={getDateTextColor((d as { dateKey?: string }).dateKey || d.date)}
                                        textAnchor="middle"
                                        transform={`rotate(-45 ${x + barWidth / 2} ${chartHeight - paddingBottom + 20})`}
                                    >
                                        {d.date.split('.').slice(0, 2).join('.')}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>
            </div>
        );
    };
    
    const formatStripValue = (): string => {
        if (chartType === 'money') return `${Math.round(stripTotals.sum || 0).toLocaleString('ru-RU')} ₽`;
        if (chartType === 'paidWeight') return `${Math.round(stripTotals.pw || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'weight') return `${Math.round(stripTotals.w || 0).toLocaleString('ru-RU')} кг`;
        if (chartType === 'pieces') return `${Math.round(stripTotals.mest || 0).toLocaleString('ru-RU')} шт`;
        const vol = Number(stripTotals.vol);
        return `${(isNaN(vol) ? 0 : vol).toFixed(2).replace('.', ',')} м³`;
    };

    /** Тренд период к периоду: текущий период vs предыдущий период (только в служебном режиме) */
    const periodToPeriodTrend = useMemo(() => {
        if (!useServiceRequest || filteredPrevPeriodItems.length === 0) return null;
        
        const getVal = (item: CargoItem) => {
            if (chartType === 'money') return typeof item.Sum === 'string' ? parseFloat(item.Sum) || 0 : (item.Sum || 0);
            if (chartType === 'paidWeight') return typeof item.PW === 'string' ? parseFloat(item.PW) || 0 : (item.PW || 0);
            if (chartType === 'weight') return typeof item.W === 'string' ? parseFloat(item.W) || 0 : (item.W || 0);
            if (chartType === 'pieces') return typeof item.Mest === 'string' ? parseFloat(item.Mest) || 0 : (item.Mest || 0);
            return typeof item.Value === 'string' ? parseFloat(item.Value) || 0 : (item.Value || 0);
        };
        
        const currentVal = filteredItems.reduce((acc, item) => acc + getVal(item), 0);
        const prevVal = filteredPrevPeriodItems.reduce((acc, item) => acc + getVal(item), 0);
        
        if (prevVal === 0) return currentVal > 0 ? { direction: 'up', percent: 100 } : null;
        
        const percent = Math.round(((currentVal - prevVal) / prevVal) * 100);
        return {
            direction: currentVal > prevVal ? 'up' : currentVal < prevVal ? 'down' : null,
            percent: Math.abs(percent),
        };
    }, [useServiceRequest, filteredItems, filteredPrevPeriodItems, chartType]);

    /** Тренд по выбранной метрике: первая половина периода vs вторая половина */
    const stripTrend = useMemo(() => {
        if (chartData.length < 4) return null;
        const mid = Math.floor(chartData.length / 2);
        const firstHalf = chartData.slice(0, mid);
        const secondHalf = chartData.slice(mid);
        const getVal = (d: { sum: number; pw: number; w: number; mest: number; vol: number }) => {
            if (chartType === 'money') return d.sum;
            if (chartType === 'paidWeight') return d.pw;
            if (chartType === 'weight') return d.w;
            if (chartType === 'pieces') return d.mest;
            return d.vol;
        };
        const v1 = firstHalf.reduce((acc, d) => acc + getVal(d), 0);
        const v2 = secondHalf.reduce((acc, d) => acc + getVal(d), 0);
        if (v2 > v1) return 'up';
        if (v2 < v1) return 'down';
        return null;
    }, [chartData, chartType]);

    if (!auth?.login || !auth?.password) {
        return (
            <div className="w-full p-4">
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет доступа к дашборду. Выберите аккаунт в профиле.</Typography.Body>
            </div>
        );
    }

    return (
        <div className="w-full">
            {/* === ВИДЖЕТ 1: Фильтры (включить: WIDGET_1_FILTERS = true) === */}
            {WIDGET_1_FILTERS && (
            <div className="cargo-page-sticky-header" style={{ marginBottom: '1rem' }}>
            <div className="filters-container filters-row-scroll">
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={dateButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsDateDropdownOpen(!isDateDropdownOpen); setDateDropdownMode('main'); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Дата: {dateFilter === 'период' ? 'Период' : dateFilter === 'месяц' && selectedMonthForFilter ? `${MONTH_NAMES[selectedMonthForFilter.month - 1]} ${selectedMonthForFilter.year}` : dateFilter === 'год' && selectedYearForFilter ? `${selectedYearForFilter}` : dateFilter === 'неделя' && selectedWeekForFilter ? (() => { const r = getWeekRange(selectedWeekForFilter); return `${r.dateFrom.slice(8,10)}.${r.dateFrom.slice(5,7)} – ${r.dateTo.slice(8,10)}.${r.dateTo.slice(5,7)}`; })() : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={dateButtonRef} isOpen={isDateDropdownOpen} onClose={() => setIsDateDropdownOpen(false)}>
                        {dateDropdownMode === 'months' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {MONTH_NAMES.map((name, i) => (
                                    <div key={i} className="dropdown-item" onClick={() => {
                                        const year = new Date().getFullYear();
                                        setDateFilter('месяц');
                                        setSelectedMonthForFilter({ year, month: i + 1 });
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{name} {new Date().getFullYear()}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'years' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getYearsList(6).map(y => (
                                    <div key={y} className="dropdown-item" onClick={() => {
                                        setDateFilter('год');
                                        setSelectedYearForFilter(y);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{y}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : dateDropdownMode === 'weeks' ? (
                            <>
                                <div className="dropdown-item" onClick={() => setDateDropdownMode('main')} style={{ fontWeight: 600 }}>← Назад</div>
                                {getWeeksList(16).map(w => (
                                    <div key={w.monday} className="dropdown-item" onClick={() => {
                                        setDateFilter('неделя');
                                        setSelectedWeekForFilter(w.monday);
                                        setIsDateDropdownOpen(false);
                                        setDateDropdownMode('main');
                                    }}>
                                        <Typography.Body>{w.label}</Typography.Body>
                                    </div>
                                ))}
                            </>
                        ) : (
                            ['сегодня', 'вчера', 'неделя', 'месяц', 'год', 'период'].map(key => {
                                const isMonth = key === 'месяц';
                                const isYear = key === 'год';
                                const isWeek = key === 'неделя';
                                const doLongPress = isMonth || isYear || isWeek;
                                const timerRef = isMonth ? monthLongPressTimerRef : isYear ? yearLongPressTimerRef : weekLongPressTimerRef;
                                const wasLongPressRef = isMonth ? monthWasLongPressRef : isYear ? yearWasLongPressRef : weekWasLongPressRef;
                                const mode = isMonth ? 'months' : isYear ? 'years' : 'weeks';
                                const title = isMonth ? 'Клик — текущий месяц; удерживайте — выбор месяца' : isYear ? 'Клик — 365 дней; удерживайте — выбор года' : isWeek ? 'Клик — предыдущая неделя; удерживайте — выбор недели (пн–вс)' : undefined;
                                return (
                                    <div key={key} className="dropdown-item" title={title}
                                        onPointerDown={doLongPress ? () => {
                                            wasLongPressRef.current = false;
                                            timerRef.current = setTimeout(() => {
                                                timerRef.current = null;
                                                wasLongPressRef.current = true;
                                                setDateDropdownMode(mode);
                                            }, 500);
                                        } : undefined}
                                        onPointerUp={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onPointerLeave={doLongPress ? () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } } : undefined}
                                        onClick={() => {
                                            if (doLongPress && wasLongPressRef.current) { wasLongPressRef.current = false; return; }
                                            if (key === 'период') {
                                                let r: { dateFrom: string; dateTo: string };
                                                if (dateFilter === "период") {
                                                    r = { dateFrom: customDateFrom, dateTo: customDateTo };
                                                } else if (dateFilter === "месяц" && selectedMonthForFilter) {
                                                    const { year, month } = selectedMonthForFilter;
                                                    const pad = (n: number) => String(n).padStart(2, '0');
                                                    const lastDay = new Date(year, month, 0).getDate();
                                                    r = { dateFrom: `${year}-${pad(month)}-01`, dateTo: `${year}-${pad(month)}-${pad(lastDay)}` };
                                                } else if (dateFilter === "год" && selectedYearForFilter) {
                                                    r = { dateFrom: `${selectedYearForFilter}-01-01`, dateTo: `${selectedYearForFilter}-12-31` };
                                                } else if (dateFilter === "неделя" && selectedWeekForFilter) {
                                                    r = getWeekRange(selectedWeekForFilter);
                                                } else {
                                                    r = getDateRange(dateFilter);
                                                }
                                                setCustomDateFrom(r.dateFrom);
                                                setCustomDateTo(r.dateTo);
                                            }
                                            setDateFilter(key as any);
                                            if (key === 'месяц') setSelectedMonthForFilter(null);
                                            if (key === 'год') setSelectedYearForFilter(null);
                                            if (key === 'неделя') setSelectedWeekForFilter(null);
                                            setIsDateDropdownOpen(false);
                                            if (key === 'период') setIsCustomModalOpen(true);
                                        }}
                                    >
                                        <Typography.Body>{key === 'год' ? 'Год' : key.charAt(0).toUpperCase() + key.slice(1)}</Typography.Body>
                                    </div>
                                );
                            })
                        )}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={statusButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsStatusDropdownOpen(!isStatusDropdownOpen); setIsDateDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Статус: {STATUS_MAP[statusFilter] ?? 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={statusButtonRef} isOpen={isStatusDropdownOpen} onClose={() => setIsStatusDropdownOpen(false)}>
                        {Object.keys(STATUS_MAP).map(key => (
                            <div key={key} className="dropdown-item" onClick={() => { setStatusFilter(key as any); setIsStatusDropdownOpen(false); }}>
                                <Typography.Body>{STATUS_MAP[key as StatusFilter]}</Typography.Body>
                            </div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={senderButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsSenderDropdownOpen(!isSenderDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Отправитель: {senderFilter ? stripOoo(senderFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={senderButtonRef} isOpen={isSenderDropdownOpen} onClose={() => setIsSenderDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setSenderFilter(''); setIsSenderDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueSenders.map(s => (
                            <div key={s} className="dropdown-item" onClick={() => { setSenderFilter(s); setIsSenderDropdownOpen(false); }}><Typography.Body>{stripOoo(s)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={receiverButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsReceiverDropdownOpen(!isReceiverDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Получатель: {receiverFilter ? stripOoo(receiverFilter) : 'Все'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={receiverButtonRef} isOpen={isReceiverDropdownOpen} onClose={() => setIsReceiverDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setReceiverFilter(''); setIsReceiverDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        {uniqueReceivers.map(r => (
                            <div key={r} className="dropdown-item" onClick={() => { setReceiverFilter(r); setIsReceiverDropdownOpen(false); }}><Typography.Body>{stripOoo(r)}</Typography.Body></div>
                        ))}
                    </FilterDropdownPortal>
                </div>
                {useServiceRequest && (
                    <div className="filter-group" style={{ flexShrink: 0 }}>
                        <div ref={billStatusButtonRef} style={{ display: 'inline-flex' }}>
                            <Button className="filter-button" onClick={() => { setIsBillStatusDropdownOpen(!isBillStatusDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsTypeDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                                Статус счёта: {BILL_STATUS_MAP[billStatusFilter]} <ChevronDown className="w-4 h-4"/>
                            </Button>
                        </div>
                        <FilterDropdownPortal triggerRef={billStatusButtonRef} isOpen={isBillStatusDropdownOpen} onClose={() => setIsBillStatusDropdownOpen(false)}>
                            {(['all', 'paid', 'unpaid', 'partial', 'cancelled', 'unknown'] as const).map(key => (
                                <div key={key} className="dropdown-item" onClick={() => { setBillStatusFilter(key); setIsBillStatusDropdownOpen(false); }}>
                                    <Typography.Body>{BILL_STATUS_MAP[key]}</Typography.Body>
                                </div>
                            ))}
                        </FilterDropdownPortal>
                    </div>
                )}
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={typeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsTypeDropdownOpen(!isTypeDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsRouteDropdownOpen(false); }}>
                            Тип: {typeFilter === 'all' ? 'Все' : typeFilter === 'ferry' ? 'Паром' : 'Авто'} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={typeButtonRef} isOpen={isTypeDropdownOpen} onClose={() => setIsTypeDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('all'); setIsTypeDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('ferry'); setIsTypeDropdownOpen(false); }}><Typography.Body>Паром</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setTypeFilter('auto'); setIsTypeDropdownOpen(false); }}><Typography.Body>Авто</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
                <div className="filter-group" style={{ flexShrink: 0 }}>
                    <div ref={routeButtonRef} style={{ display: 'inline-flex' }}>
                        <Button className="filter-button" onClick={() => { setIsRouteDropdownOpen(!isRouteDropdownOpen); setIsDateDropdownOpen(false); setIsStatusDropdownOpen(false); setIsSenderDropdownOpen(false); setIsReceiverDropdownOpen(false);  setIsBillStatusDropdownOpen(false); setIsTypeDropdownOpen(false); }}>
                            Маршрут: {routeFilter === 'all' ? 'Все' : routeFilter} <ChevronDown className="w-4 h-4"/>
                        </Button>
                    </div>
                    <FilterDropdownPortal triggerRef={routeButtonRef} isOpen={isRouteDropdownOpen} onClose={() => setIsRouteDropdownOpen(false)}>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('all'); setIsRouteDropdownOpen(false); }}><Typography.Body>Все</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('MSK-KGD'); setIsRouteDropdownOpen(false); }}><Typography.Body>MSK – KGD</Typography.Body></div>
                        <div className="dropdown-item" onClick={() => { setRouteFilter('KGD-MSK'); setIsRouteDropdownOpen(false); }}><Typography.Body>KGD – MSK</Typography.Body></div>
                    </FilterDropdownPortal>
                </div>
            </div>
            </div>
            )}

            {/* === ВИДЖЕТ 2: Полоска с периодом и типом графика (включить: WIDGET_2_STRIP = true) === */}
            {WIDGET_2_STRIP && showSums && (
            <>
            {useServiceRequest && (
                <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem' }}>Приемка</Typography.Body>
            )}
            {/* Раскрывающаяся полоска: в свёрнутом виде — период + переключатели; в развёрнутом — переключатель и диаграммы */}
            <div
                className="home-strip"
                style={{
                    background: 'var(--color-bg-card)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                        padding: '0.75rem 1rem',
                        minWidth: 0,
                    }}
                >
                    <span style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                            <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} />
                        </Typography.Body>
                    </span>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        {showSums && (
                            <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        )}
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                {(
                    <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                        <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            {dateFilter === 'неделя' && (
                                <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem', color: 'var(--color-text-secondary)', marginRight: '0.5rem' }}>За неделю:</Typography.Body>
                            )}
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>{formatStripValue()}</Typography.Body>
                            {useServiceRequest && prevPeriodLoading && (
                                <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }} title="Расчёт динамики">
                                    <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                </Flex>
                            )}
                            {useServiceRequest && !prevPeriodLoading && periodToPeriodTrend && (
                                <>
                                    {periodToPeriodTrend.direction === 'up' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', fontWeight: 600 }}>
                                                +{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === 'down' && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: '#ef4444', fontWeight: 600 }}>
                                                -{periodToPeriodTrend.percent}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    {periodToPeriodTrend.direction === null && periodToPeriodTrend.percent === 0 && (
                                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                                            <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                0%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                </>
                            )}
                            {!useServiceRequest && (
                                <>
                                    {stripTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)', flexShrink: 0 }} title="Тренд вверх (вторая половина периода больше первой)" />}
                                    {stripTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444', flexShrink: 0 }} title="Тренд вниз (вторая половина периода меньше первой)" />}
                                    {stripTrend === null && chartData.length >= 2 && <Minus className="w-5 h-5" style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} title="Без выраженного тренда" />}
                                </>
                            )}
                        </Flex>
                        <div style={{ marginBottom: '0.75rem', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
                            <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                                {((useServiceRequest ? ['type', 'sender', 'receiver', 'customer'] : ['type', 'sender', 'receiver']) as const).map((tab) => (
                                    <Button
                                        key={tab}
                                        className="filter-button"
                                        style={{
                                            flexShrink: 0,
                                            padding: '0.5rem 0.75rem',
                                            background: stripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                            color: stripTab === tab ? 'white' : 'var(--color-text-primary)',
                                            border: stripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)',
                                        }}
                                        onClick={() => setStripTab(tab)}
                                    >
                                        {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : tab === 'receiver' ? 'Получатель' : 'Заказчик'}
                                    </Button>
                                ))}
                            </Flex>
                        </div>
                        <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                            {stripTab === 'type' && stripDiagramByType.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, width: 56 }}>{row.label}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'sender' && stripDiagramBySender.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'receiver' && stripDiagramByReceiver.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                            {stripTab === 'customer' && stripDiagramByCustomer.map((row, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                    <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                            <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4, transition: 'width 0.3s' }} />
                                        </div>
                                    </div>
                                    {row.dynamics != null && (
                                        <Flex align="center" gap="0.2rem" style={{ flexShrink: 0, minWidth: 48 }}>
                                            {row.dynamics > 0 && <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-success-status)' }} />}
                                            {row.dynamics < 0 && <TrendingDown className="w-4 h-4" style={{ color: '#ef4444' }} />}
                                            {row.dynamics === 0 && <Minus className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                                            <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600, color: row.dynamics > 0 ? 'var(--color-success-status)' : row.dynamics < 0 ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                {row.dynamics > 0 ? '+' : ''}{row.dynamics}%
                                            </Typography.Body>
                                        </Flex>
                                    )}
                                    <Typography.Body
                                        component="span"
                                        style={{ flexShrink: 0, fontWeight: 600, minWidth: 36, cursor: showSums ? 'pointer' : 'default', userSelect: 'none' }}
                                        onClick={(e) => { e.stopPropagation(); if (!showSums) return; setStripShowAsPercent(p => !p); }}
                                        title={showSums ? (stripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах') : 'Финансовые значения скрыты'}
                                    >
                                        {!showSums || stripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                    </Typography.Body>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Монитор доставки: только статус «доставлено» в выбранном периоде (только в служебном режиме, без заказчика). Пока скрыт. */}
            {false && useServiceRequest && (
            <>
            <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '0.35rem', marginTop: '0.5rem' }}>Доставка</Typography.Body>
            <div className="home-strip" style={{ background: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: '12px', marginBottom: '1rem', overflow: 'hidden' }}>
                <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 1rem', minWidth: 0 }}>
                    <Typography.Body style={{ color: 'var(--color-primary-blue)', fontWeight: 600, fontSize: '0.6rem' }}>
                        <DateText value={apiDateRange.dateFrom} /> – <DateText value={apiDateRange.dateTo} /> — Доставлено
                    </Typography.Body>
                    <Flex gap="0.25rem" align="center" style={{ flexShrink: 0 }}>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'money' ? 'var(--color-primary-blue)' : 'transparent', border: 'none' }} onClick={() => setChartType('money')} title="Рубли"><RussianRuble className="w-4 h-4" style={{ color: chartType === 'money' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'paidWeight' ? '#10b981' : 'transparent', border: 'none' }} onClick={() => setChartType('paidWeight')} title="Платный вес"><Scale className="w-4 h-4" style={{ color: chartType === 'paidWeight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'weight' ? '#0d9488' : 'transparent', border: 'none' }} onClick={() => setChartType('weight')} title="Вес"><Weight className="w-4 h-4" style={{ color: chartType === 'weight' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'volume' ? '#f59e0b' : 'transparent', border: 'none' }} onClick={() => setChartType('volume')} title="Объём"><List className="w-4 h-4" style={{ color: chartType === 'volume' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                        <Button className="filter-button" style={{ padding: '0.35rem', minWidth: 'auto', background: chartType === 'pieces' ? '#8b5cf6' : 'transparent', border: 'none' }} onClick={() => setChartType('pieces')} title="Шт"><Package className="w-4 h-4" style={{ color: chartType === 'pieces' ? 'white' : 'var(--color-text-secondary)' }} /></Button>
                    </Flex>
                </div>
                <div style={{ padding: '1.25rem 1rem 1rem', borderTop: '1px solid var(--color-border)' }}>
                    <Flex align="center" gap="0.5rem" style={{ marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.6rem' }}>
                            {chartType === 'money' ? `${Math.round(deliveryStripTotals.sum || 0).toLocaleString('ru-RU')} ₽` : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(deliveryStripTotals.pw || 0).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(deliveryStripTotals.mest || 0).toLocaleString('ru-RU')} шт` : `${(deliveryStripTotals.vol || 0).toFixed(2).replace('.', ',')} м³`}
                        </Typography.Body>
                    </Flex>
                    <div style={{ marginBottom: '0.75rem' }}>
                        <Flex gap="0.5rem" style={{ flexWrap: 'nowrap', minWidth: 'min-content' }}>
                            {(['type', 'sender', 'receiver'] as const).map((tab) => (
                                <Button key={tab} className="filter-button" style={{ flexShrink: 0, padding: '0.5rem 0.75rem', background: deliveryStripTab === tab ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)', color: deliveryStripTab === tab ? 'white' : 'var(--color-text-primary)', border: deliveryStripTab === tab ? '1px solid var(--color-primary-blue)' : '1px solid var(--color-border)' }} onClick={() => setDeliveryStripTab(tab)}>
                                    {tab === 'type' ? 'Тип' : tab === 'sender' ? 'Отправитель' : 'Получатель'}
                                </Button>
                            ))}
                        </Flex>
                    </div>
                    <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
                        {deliveryStripTab === 'type' && deliveryStripDiagramByType.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, width: 140 }}>{row.label}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }} title={deliveryStripShowAsPercent ? 'Показать в рублях' : 'Показать в процентах'}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {deliveryStripTab === 'sender' && deliveryStripDiagramBySender.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                        {deliveryStripTab === 'receiver' && deliveryStripDiagramByReceiver.map((row, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                                <Typography.Body style={{ flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={row.name}>{row.name}</Typography.Body>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ height: 8, borderRadius: 4, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                                        <div style={{ width: `${row.percent}%`, height: '100%', background: row.color, borderRadius: 4 }} />
                                    </div>
                                </div>
                                <Typography.Body component="span" style={{ flexShrink: 0, fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); setDeliveryStripShowAsPercent(p => !p); }}>
                                    {deliveryStripShowAsPercent ? `${row.percent}%` : (chartType === 'money' ? formatCurrency(row.value, true) : chartType === 'paidWeight' || chartType === 'weight' ? `${Math.round(row.value).toLocaleString('ru-RU')} кг` : chartType === 'pieces' ? `${Math.round(row.value).toLocaleString('ru-RU')} шт` : `${Math.round(row.value).toLocaleString('ru-RU')} м³`)}
                                </Typography.Body>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            </>
            )}
            </>
            )}

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
            
            {/* === ВИДЖЕТ 3: График динамики (включить: WIDGET_3_CHART = true) === */}
            {WIDGET_3_CHART && !loading && !error && showSums && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1.5rem' }}>
                    {(() => {
                        let chartDataForType: { date: string; value: number }[];
                        let title: string;
                        let color: string;
                        let formatValue: (val: number) => string;
                        
                        switch (chartType) {
                            case 'money':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.sum) }));
                                title = "Динамика в деньгах";
                                color = "#6366f1";
                                formatValue = (val) => `${Math.round(val).toLocaleString('ru-RU')} ₽`;
                                break;
                            case 'paidWeight':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.pw) }));
                                title = "Динамика в платном весе";
                                color = "#10b981";
                                formatValue = (val) => `${Math.round(val)} кг`;
                                break;
                            case 'weight':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.w) }));
                                title = "Динамика по весу";
                                color = "#0d9488";
                                formatValue = (val) => `${Math.round(val)} кг`;
                                break;
                            case 'volume':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: d.vol }));
                                title = "Динамика по объёму";
                                color = "#f59e0b";
                                formatValue = (val) => `${val.toFixed(2)} м³`;
                                break;
                            case 'pieces':
                                chartDataForType = chartData.map(d => ({ date: d.date, dateKey: (d as { dateKey?: string }).dateKey, value: Math.round(d.mest) }));
                                title = "Динамика по местам (шт)";
                                color = "#8b5cf6";
                                formatValue = (val) => `${Math.round(val)} шт`;
                                break;
                        }
                        
                        return renderChart(chartDataForType, title, color, formatValue);
                    })()}
                </Panel>
            )}

            {/* === ВИДЖЕТ 4: Монитор SLA (включить: WIDGET_4_SLA = true) === */}
            {WIDGET_4_SLA && !loading && !error && slaStats.total > 0 && (
                <Panel className="cargo-card sla-monitor-panel" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.5rem' }}>
                    <Flex align="center" justify="space-between" className="sla-monitor-header" style={{ marginBottom: '0.75rem' }}>
                        <Typography.Headline style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                            Монитор SLA
                        </Typography.Headline>
                        {slaTrend === 'up' && <TrendingUp className="w-5 h-5" style={{ color: 'var(--color-success-status)' }} title="Динамика SLA улучшается" />}
                        {slaTrend === 'down' && <TrendingDown className="w-5 h-5" style={{ color: '#ef4444' }} title="Динамика SLA ухудшается" />}
                    </Flex>
                    <Flex gap="2rem" wrap="wrap" align="flex-start" className="sla-monitor-metrics" style={{ marginBottom: '1rem' }}>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>В срок{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.percentOnTime >= 90 ? 'var(--color-success-status)' : slaStats.percentOnTime >= 70 ? '#f59e0b' : '#ef4444', display: 'inline' }}>
                                {slaStats.percentOnTime}%
                            </Typography.Body>
                            <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'inline' }}>{'   '}{slaStats.onTime} из {slaStats.total} перевозок</Typography.Body>
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Средняя просрочка{'   '}</Typography.Body>
                            <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: slaStats.avgDelay > 0 ? '#ef4444' : 'var(--color-text-primary)', display: 'inline' }}>
                                {slaStats.avgDelay} дн.
                            </Typography.Body>
                        </div>
                        {useServiceRequest && (
                            <>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Мин. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.minDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Макс. дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.maxDays} дн.
                                    </Typography.Body>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Среднее дней доставки{'   '}</Typography.Body>
                                    <Typography.Body style={{ fontWeight: 700, fontSize: '1.25rem', color: 'var(--color-text-primary)', display: 'inline' }}>
                                        {slaStats.avgDays} дн.
                                    </Typography.Body>
                                </div>
                            </>
                        )}
                    </Flex>
                    <div
                        className="sla-monitor-details-toggle"
                        role="button"
                        tabIndex={0}
                        onClick={() => setSlaDetailsOpen(!slaDetailsOpen)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSlaDetailsOpen(!slaDetailsOpen); } }}
                        style={{ cursor: 'pointer', marginBottom: slaDetailsOpen ? '0.75rem' : 0 }}
                        title={slaDetailsOpen ? 'Свернуть' : 'Подробности по типу перевозки'}
                    >
                        <div style={{ height: 12, borderRadius: 6, background: 'var(--color-bg-hover)', overflow: 'hidden' }}>
                            <div
                                style={{
                                    width: `${slaStats.percentOnTime}%`,
                                    height: '100%',
                                    borderRadius: 6,
                                    background: `linear-gradient(90deg, var(--color-success-status) 0%, #f59e0b 50%, #ef4444 100%)`,
                                    transition: 'width 0.3s ease',
                                }}
                            />
                        </div>
                        <Typography.Body style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                            {slaDetailsOpen ? '▼ Подробности' : '▶ Нажмите для разбивки по типу перевозки'}
                        </Typography.Body>
                    </div>
                    {slaDetailsOpen && (
                        <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--color-border)' }}>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Авто{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.auto.percentOnTime}% ({slaStatsByType.auto.onTime}/{slaStatsByType.auto.total}), ср. {slaStatsByType.auto.avgDelay} дн.
                                </Typography.Body>
                                {useServiceRequest && outOfSlaByType.auto.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaAuto.map(({ item, sla }, idx) => (
                                                    <React.Fragment key={`auto-${item.Number ?? idx}`}>
                                                        <tr
                                                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer', background: expandedSlaCargoNumber === (item.Number ?? '') ? 'var(--color-bg-hover)' : undefined }}
                                                            onClick={() => {
                                                                const num = item.Number ?? '';
                                                                if (expandedSlaCargoNumber === num) {
                                                                    setExpandedSlaCargoNumber(null);
                                                                    setExpandedSlaItem(null);
                                                                } else {
                                                                    setExpandedSlaCargoNumber(num);
                                                                    setExpandedSlaItem(item);
                                                                }
                                                            }}
                                                            title={expandedSlaCargoNumber === (item.Number ?? '') ? 'Свернуть статусы' : 'Показать статусы перевозки'}
                                                        >
                                                            <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                            <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                            <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                        </tr>
                                                        {expandedSlaCargoNumber === (item.Number ?? '') && (
                                                            <tr>
                                                                <td colSpan={10} style={{ padding: '0.5rem', borderBottom: '1px solid var(--color-border)', verticalAlign: 'top', background: 'var(--color-bg-primary)' }}>
                                                                    <Typography.Body style={{ fontSize: '0.75rem', fontWeight: 600, marginBottom: '0.35rem' }}>Статусы перевозки</Typography.Body>
                                                                    {slaTimelineLoading && (
                                                                        <Flex align="center" gap="0.5rem" style={{ padding: '0.35rem 0' }}>
                                                                            <Loader2 className="w-3 h-3 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                                                            <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                                                                        </Flex>
                                                                    )}
                                                                    {slaTimelineError && (
                                                                        <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{slaTimelineError}</Typography.Body>
                                                                    )}
                                                                    {!slaTimelineLoading && slaTimelineSteps && slaTimelineSteps.length > 0 && (() => {
                                                                        const planEndMs = item?.DatePrih ? new Date(item.DatePrih).getTime() + getPlanDays(item) * 24 * 60 * 60 * 1000 : 0;
                                                                        return (
                                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                            <thead>
                                                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Статус</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Дата доставки</th>
                                                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600 }}>Время доставки</th>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody>
                                                                                {slaTimelineSteps.map((step, i) => {
                                                                                    const stepMs = step.date ? new Date(step.date).getTime() : 0;
                                                                                    const outOfSlaFromThisStep = planEndMs > 0 && stepMs > planEndMs;
                                                                                    const dateColor = outOfSlaFromThisStep ? '#ef4444' : (planEndMs > 0 && stepMs > 0 ? '#22c55e' : 'var(--color-text-secondary)');
                                                                                    return (
                                                                                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: outOfSlaFromThisStep ? '#ef4444' : undefined }}>{step.label}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineDate(step.date)}</td>
                                                                                        <td style={{ padding: '0.35rem 0.3rem', color: dateColor }}>{formatTimelineTime(step.date)}</td>
                                                                                    </tr>
                                                                                    );
                                                                                })}
                                                                            </tbody>
                                                                        </table>
                                                                        );
                                                                    })()}
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                            <div>
                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Паром{'   '}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'inline' }}>
                                    {slaStatsByType.ferry.percentOnTime}% ({slaStatsByType.ferry.onTime}/{slaStatsByType.ferry.total}), ср. {slaStatsByType.ferry.avgDelay} дн.
                                </Typography.Body>
                                {useServiceRequest && outOfSlaByType.ferry.length > 0 && (
                                    <div style={{ marginTop: '0.5rem', overflowX: 'auto' }}>
                                        <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: '0.25rem' }}>Перевозки вне SLA:</Typography.Body>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-hover)' }}>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('number'); }} title="Сортировка">Номер{slaTableSortColumn === 'number' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('date'); }} title="Сортировка">Дата прихода{slaTableSortColumn === 'date' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('status'); }} title="Сортировка">Статус{slaTableSortColumn === 'status' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'left', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('customer'); }} title="Сортировка">Заказчик{slaTableSortColumn === 'customer' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('mest'); }} title="Сортировка">Мест{slaTableSortColumn === 'mest' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('pw'); }} title="Сортировка">Плат. вес{slaTableSortColumn === 'pw' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('sum'); }} title="Сортировка">Сумма{slaTableSortColumn === 'sum' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('days'); }} title="Сортировка">Дней{slaTableSortColumn === 'days' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('plan'); }} title="Сортировка">План{slaTableSortColumn === 'plan' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                    <th style={{ padding: '0.35rem 0.3rem', textAlign: 'right', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }} onClick={(e) => { e.stopPropagation(); handleSlaTableSort('delay'); }} title="Сортировка">Просрочка{slaTableSortColumn === 'delay' && (slaTableSortOrder === 'asc' ? <ArrowUp className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} /> : <ArrowDown className="w-3 h-3" style={{ verticalAlign: 'middle', marginLeft: 2, display: 'inline-block' }} />)}</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sortedOutOfSlaFerry.map(({ item, sla }, idx) => (
                                                    <tr key={`ferry-${item.Number ?? idx}`} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                        <td style={{ padding: '0.35rem 0.3rem', color: '#ef4444' }}>{item.Number ?? '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}><DateText value={item.DatePrih} /></td>
                                                        <td style={{ padding: '0.35rem 0.3rem' }}>{normalizeStatus(item.State) || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={stripOoo((item.Customer ?? (item as any).customer) || '')}>{stripOoo((item.Customer ?? (item as any).customer) || '') || '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Mest != null ? Math.round(Number(item.Mest)) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.PW != null ? `${Math.round(Number(item.PW))} кг` : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{item.Sum != null ? formatCurrency(item.Sum as number, true) : '—'}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.actualDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right' }}>{sla.planDays}</td>
                                                        <td style={{ padding: '0.35rem 0.3rem', textAlign: 'right', color: '#ef4444' }}>+{sla.delayDays} дн.</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </Panel>
            )}

            {/* === ВИДЖЕТ 5: Платёжный календарь (включить: WIDGET_5_PAYMENT_CALENDAR = true) === */}
            {WIDGET_5_PAYMENT_CALENDAR && showPaymentCalendar && !loading && !error && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>Платёжный календарь</Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        Рекомендуемые дни оплаты выставленных и неоплаченных счетов
                    </Typography.Body>
                    {paymentCalendarLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка условий оплаты...</Typography.Body></Flex>
                    ) : (
                        <>
                            <Flex align="center" gap="0.5rem" style={{ marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { year: m.year, month: m.month - 1 }))}>←</Button>
                                <Typography.Body style={{ fontWeight: 600, minWidth: '10rem', textAlign: 'center' }}>
                                    {['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'][paymentCalendarMonth.month - 1]} {paymentCalendarMonth.year}
                                </Typography.Body>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem' }} onClick={() => setPaymentCalendarMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { year: m.year, month: m.month + 1 }))}>→</Button>
                                <Button className="filter-button" style={{ padding: '0.35rem 0.5rem', marginLeft: '0.25rem' }} onClick={() => mutateCalendarInvoices()} title="Обновить счета с начала текущего года" aria-label="Обновить счета">
                                    <RefreshCw className="w-4 h-4" />
                                </Button>
                            </Flex>
                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '0.5rem' }}>
                                <div className="payment-calendar-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(2.5rem, 1fr))', gap: '2px', fontSize: '0.75rem', minWidth: '22rem' }}>
                                    {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'За неделю'].map((wd) => (
                                        <div key={wd} style={{ textAlign: 'center', color: 'var(--color-text-secondary)', fontWeight: 600, padding: '0.25rem' }}>{wd}</div>
                                    ))}
                                    {(() => {
                                        const { year, month } = paymentCalendarMonth;
                                        const first = new Date(year, month - 1, 1);
                                        const lastDay = new Date(year, month, 0).getDate();
                                        const startOffset = (first.getDay() + 6) % 7;
                                        const cells: { day: number | null; key: string | null; dow: number }[] = [];
                                        for (let i = 0; i < startOffset; i++) cells.push({ day: null, key: null, dow: i });
                                        for (let d = 1; d <= lastDay; d++) {
                                            const key = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                                            const date = new Date(year, month - 1, d);
                                            const dow = (date.getDay() + 6) % 7;
                                            cells.push({ day: d, key, dow });
                                        }
                                        const weeks: { cells: typeof cells }[] = [];
                                        for (let i = 0; i < cells.length; i += 7) {
                                            const chunk = cells.slice(i, i + 7);
                                            while (chunk.length < 7) chunk.push({ day: null, key: null, dow: chunk.length });
                                            weeks.push({ cells: chunk });
                                        }
                                        return weeks.flatMap(({ cells: weekCells }, wi) => {
                                            let weekSum = 0;
                                            for (let i = 0; i < 7; i++) {
                                                const c = weekCells[i];
                                                if (c?.key) {
                                                    const e = plannedByDate.get(c.key);
                                                    if (e?.total) weekSum += e.total;
                                                }
                                            }
                                            const monFri = weekCells.slice(0, 5);
                                            const row: React.ReactNode[] = monFri.map((c, i) => {
                                                const entry = c.key ? plannedByDate.get(c.key) : undefined;
                                                const sum = entry?.total;
                                                const hasSum = sum != null && sum > 0;
                                                return (
                                                    <div
                                                        key={`w${wi}-${i}-${c.key ?? ''}`}
                                                        className="payment-calendar-day-cell"
                                                        role={hasSum ? 'button' : undefined}
                                                        tabIndex={hasSum ? 0 : undefined}
                                                        onClick={hasSum && c.key ? () => setPaymentCalendarSelectedDate(c.key) : undefined}
                                                        onKeyDown={hasSum && c.key ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPaymentCalendarSelectedDate(c.key); } } : undefined}
                                                        style={{
                                                            padding: '0.35rem',
                                                            textAlign: 'center',
                                                            borderRadius: 4,
                                                            background: hasSum ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                            color: hasSum ? 'white' : 'var(--color-text-secondary)',
                                                            minHeight: '2.25rem',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            cursor: hasSum ? 'pointer' : undefined,
                                                        }}
                                                        title={c.key && hasSum ? `${c.key}: ${Math.round(sum!).toLocaleString('ru-RU')} ₽` : undefined}
                                                    >
                                                        {c.day != null ? c.day : ''}
                                                        {hasSum && <span className="payment-calendar-day-amount" style={{ fontSize: '0.65rem', lineHeight: 1 }}>{formatCurrency(sum!, true)}</span>}
                                                    </div>
                                                );
                                            });
                                            row.push(
                                                <div
                                                    key={`week-${wi}`}
                                                    className="payment-calendar-week-total"
                                                    style={{
                                                        padding: '0.35rem',
                                                        textAlign: 'center',
                                                        borderRadius: 4,
                                                        background: weekSum > 0 ? 'var(--color-primary-blue)' : 'var(--color-bg-hover)',
                                                        color: weekSum > 0 ? 'white' : 'var(--color-text-secondary)',
                                                        minHeight: '2.25rem',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: weekSum > 0 ? 600 : undefined,
                                                    }}
                                                >
                                                    {weekSum > 0 ? formatCurrency(weekSum, true) : '—'}
                                                </div>
                                            );
                                            return row;
                                        });
                                    })()}
                                </div>
                            </div>
                            {paymentCalendarSelectedDate && plannedByDate.get(paymentCalendarSelectedDate) && (
                                <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="payment-calendar-day-title" onClick={() => setPaymentCalendarSelectedDate(null)}>
                                    <div className="modal-content" style={{ maxWidth: '22rem', padding: '1rem', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
                                        <Typography.Body id="payment-calendar-day-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>
                                            Плановое поступление — {paymentCalendarSelectedDate}
                                        </Typography.Body>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                                            Заказчики и суммы:
                                        </Typography.Body>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                            {plannedByDate.get(paymentCalendarSelectedDate)!.items.map((row, idx) => (
                                                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--color-border)' }}>
                                                    <Typography.Body style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.customer}>{row.customer}</Typography.Body>
                                                    <Typography.Body style={{ fontWeight: 600, flexShrink: 0 }}>{formatCurrency(row.sum, true)}</Typography.Body>
                                                </div>
                                            ))}
                                        </div>
                                        <Flex justify="space-between" align="center" style={{ marginTop: '0.75rem', paddingTop: '0.5rem', borderTop: '1px solid var(--color-border)', fontWeight: 600 }}>
                                            <Typography.Body>Итого:</Typography.Body>
                                            <Typography.Body>{formatCurrency(plannedByDate.get(paymentCalendarSelectedDate)!.total, true)}</Typography.Body>
                                        </Flex>
                                        <Button type="button" className="filter-button" style={{ marginTop: '0.75rem', width: '100%' }} onClick={() => setPaymentCalendarSelectedDate(null)}>Закрыть</Button>
                                    </div>
                                </div>
                            )}
                            {plannedByDate.size === 0 && !paymentCalendarLoading && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                                    Нет данных за выбранный период или условия оплаты не заданы в справочнике.
                                </Typography.Body>
                            )}
                        </>
                    )}
                </Panel>
            )}

            {canViewTimesheetCostDashboard && !loading && !error && !isVisibilityDeniedError(timesheetAnalyticsError) && (
                <Panel className="cargo-card" style={{ marginBottom: '1rem', background: 'var(--color-bg-card)', borderRadius: '12px', padding: '1rem 1.25rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
                        ФОТ
                    </Typography.Headline>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.75rem' }}>
                        В разрезе стоимости на 1 кг платного веса за выбранный период
                    </Typography.Body>
                    <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: '-0.25rem', marginBottom: '0.55rem' }}>
                        <select
                            className="admin-form-input"
                            value={timesheetDashboardPeriod.month}
                            onChange={(e) => {
                                const month = Number(e.target.value);
                                if (!Number.isFinite(month) || month < 1 || month > 12) return;
                                setTimesheetDashboardPeriod((prev) => ({ ...prev, month }));
                            }}
                            style={{ padding: '0 0.5rem', minWidth: '10rem' }}
                            aria-label="Месяц ФОТ"
                        >
                            {MONTH_NAMES.map((name, idx) => (
                                <option key={`timesheet-dashboard-month-${idx + 1}`} value={idx + 1}>{name.charAt(0).toUpperCase() + name.slice(1)}</option>
                            ))}
                        </select>
                        <select
                            className="admin-form-input"
                            value={timesheetDashboardPeriod.year}
                            onChange={(e) => {
                                const year = Number(e.target.value);
                                if (!Number.isFinite(year)) return;
                                setTimesheetDashboardPeriod((prev) => ({ ...prev, year }));
                            }}
                            style={{ padding: '0 0.5rem', minWidth: '6.5rem' }}
                            aria-label="Год ФОТ"
                        >
                            {timesheetDashboardYearOptions.map((year) => (
                                <option key={`timesheet-dashboard-year-${year}`} value={year}>{year}</option>
                            ))}
                        </select>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '-0.35rem', marginBottom: '0.75rem' }}>
                        Расчетный период: <DateText value={timesheetDashboardDateRange.dateFrom} /> – <DateText value={timesheetDashboardDateRange.dateTo} />
                    </Typography.Body>
                    {timesheetAnalyticsLoading ? (
                        <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка аналитики табеля...</Typography.Body></Flex>
                    ) : timesheetAnalyticsError ? (
                        <Typography.Body style={{ color: 'var(--color-error)' }}>{timesheetAnalyticsError}</Typography.Body>
                    ) : (
                        <>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>ФОТ</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600 }}>{Math.round(companyTimesheetSummary.totalMoney).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Платный вес</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600 }}>{Math.round(timesheetPaidWeight).toLocaleString('ru-RU')} кг</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Стоимость на 1 кг</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 700, color: '#2563eb' }}>{timesheetCostPerKg.toFixed(2)} ₽/кг</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Выплаты</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, color: '#065f46' }}>{Math.round(companyTimesheetSummary.totalPaid).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                                <div>
                                    <Typography.Body style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '0.2rem' }}>Остаток</Typography.Body>
                                    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.5rem' }}>
                                        <Typography.Body style={{ fontWeight: 700, color: '#b45309' }}>{Math.round(companyTimesheetSummary.totalOutstanding).toLocaleString('ru-RU')} ₽</Typography.Body>
                                    </div>
                                </div>
                            </div>
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginBottom: '0.4rem' }}>
                                Топ сотрудников по затратам
                            </Typography.Body>
                            {topEmployeesByTimesheetCost.length === 0 ? (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    Нет данных табеля за выбранный период.
                                </Typography.Body>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {topEmployeesByTimesheetCost.map((row) => (
                                        <div key={`timesheet-top-${row.employeeId}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.25rem' }}>
                                            <Typography.Body style={{ fontSize: '0.8rem' }}>
                                                {row.fullName || `Сотрудник #${row.employeeId}`} {row.department ? `· ${row.department}` : ''}
                                            </Typography.Body>
                                            <Flex align="center" gap="0.5rem" wrap="wrap" justify="flex-end">
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600 }}>
                                                    {Math.round(Number(row.totalCost || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #86efac', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                                                    {Math.round(Number(row.totalPaid || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                                <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                    {Math.round(Number(row.totalOutstanding || 0)).toLocaleString('ru-RU')} ₽
                                                </span>
                                            </Flex>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <Typography.Body style={{ fontSize: '0.78rem', fontWeight: 600, marginTop: '0.75rem', marginBottom: '0.4rem' }}>
                                По подразделениям
                            </Typography.Body>
                            {timesheetByDepartment.length === 0 ? (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                    Нет данных по подразделениям за выбранный период.
                                </Typography.Body>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                    {timesheetByDepartment.map((row) => (
                                        <div key={`timesheet-dep-${row.department}`} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.3rem' }}>
                                            <Flex align="center" justify="space-between" gap="0.5rem">
                                                <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>{row.department}</Typography.Body>
                                                <Flex align="center" justify="flex-end" gap="0.35rem" wrap="wrap">
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', fontWeight: 600 }}>
                                                        {Math.round(row.totalCost).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #86efac', background: '#dcfce7', color: '#166534', fontWeight: 600 }}>
                                                        {Math.round(row.totalPaid || 0).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                    <span style={{ fontSize: '0.74rem', padding: '0.14rem 0.4rem', borderRadius: 999, border: '1px solid #fcd34d', background: '#fef3c7', color: '#92400e', fontWeight: 700 }}>
                                                        {Math.round(row.totalOutstanding || 0).toLocaleString('ru-RU')} ₽
                                                    </span>
                                                </Flex>
                                            </Flex>
                                            <Typography.Body style={{ fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                Сотрудников: {row.employeeCount} · Часы: {Number(row.totalHours.toFixed(1))} · Смены: {row.totalShifts} · Доля: {row.share.toFixed(1)}% · 1 кг: {row.costPerKg.toFixed(2)} ₽/кг
                                            </Typography.Body>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </Panel>
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

function truncateForLog(u: string, max = 80) {
    return u.length <= max ? u : u.slice(0, max) + '...';
}

function TinyUrlTestPage({ onBack }: { onBack: () => void }) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Дашборды</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                    Раздел временно недоступен.
                </Typography.Body>
            </Panel>
        </div>
    );

    const [inputUrl, setInputUrl] = useState('');
    const [shortUrl, setShortUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [maxDebugInfo, setMaxDebugInfo] = useState<string>("");

    const testMaxMessage = async () => {
        const webApp = getWebApp();
        const testLogs: string[] = [];
        
        testLogs.push(`Time: ${new Date().toISOString()}`);
        testLogs.push(`Environment: ${isMaxWebApp() ? "MAX" : "Not MAX"}`);
        testLogs.push(`window.WebApp: ${!!(window as any).WebApp}`);
        testLogs.push(`URL: ${window.location.href}`);
        
        if (webApp) {
            // Попробуем вызвать ready() еще раз
            if (typeof webApp.ready === "function") {
                try { webApp.ready(); testLogs.push("Called webApp.ready()"); } catch(e) { testLogs.push(`ready() error: ${e}`); }
            }

            testLogs.push(`initData Type: ${typeof webApp.initData}`);
            if (webApp.initData) {
                testLogs.push(`initData Length: ${webApp.initData.length}`);
                testLogs.push(`initData Value: ${webApp.initData.substring(0, 100)}`);
            } else {
                testLogs.push("initData is EMPTY string or null");
            }
            
            const unsafe = webApp.initDataUnsafe || {};
            const unsafeKeys = Object.keys(unsafe);
            testLogs.push(`initDataUnsafe Keys (${unsafeKeys.length}): ${unsafeKeys.join(", ")}`);
            
            if (unsafe.user) testLogs.push(`user: ${JSON.stringify(unsafe.user)}`);
            if (unsafe.chat) testLogs.push(`chat: ${JSON.stringify(unsafe.chat)}`);
            
            // Проверка всех свойств window на наличие слова "id" или "user" или "chat"
            testLogs.push("--- Searching Global Scope ---");
            const globals = Object.keys(window).filter(k => 
                (k.toLowerCase().includes("id") || k.toLowerCase().includes("user") || k.toLowerCase().includes("chat")) &&
                !k.startsWith("webkit") && !k.startsWith("on") && k !== "id"
            );
            testLogs.push(`Global matches: ${globals.slice(0, 10).join(", ")}`);
            globals.slice(0, 5).forEach(k => {
                try {
                    const val = (window as any)[k];
                    if (typeof val !== "function" && typeof val !== "object") {
                        testLogs.push(`${k}: ${val}`);
                    }
                } catch(e) {}
            });

            // Проверяем Telegram.WebApp отдельно
            if (window.Telegram?.WebApp) {
                testLogs.push(`Telegram.WebApp.initData: ${window.Telegram.WebApp.initData ? "YES" : "NO"}`);
            }

            const chatId = unsafe.user?.id || unsafe.chat?.id || (window as any).WebAppUser?.id || (window as any).userId;
            testLogs.push(`Detected chatId from unsafe: ${chatId}`);

            // Попытка прямого парсинга из URL для отладки
            let manualChatId = null;
            try {
                const hash = window.location.hash;
                if (hash.includes("WebAppData=")) {
                    const data = decodeURIComponent(hash.split("WebAppData=")[1].split("&")[0]);
                    const params = new URLSearchParams(data);
                    const chatStr = params.get("chat");
                    if (chatStr) {
                        const chatObj = JSON.parse(chatStr);
                        manualChatId = chatObj.id;
                        testLogs.push(`Manual parse chatId (chat): ${manualChatId}`);
                    }
                    if (!manualChatId) {
                        const userStr = params.get("user");
                        if (userStr) {
                            const userObj = JSON.parse(userStr);
                            manualChatId = userObj.id;
                            testLogs.push(`Manual parse chatId (user): ${manualChatId}`);
                        }
                    }
                }
            } catch(e) { testLogs.push(`Manual parse error: ${e}`); }

            const finalId = chatId || manualChatId;
            testLogs.push(`Final Detected chatId: ${finalId}`);
            
            if (finalId) {
                try {
                    testLogs.push("Sending test message...");
                    const res = await fetch('/api/max-send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            chatId: finalId, 
                            text: `🛠 ТЕСТ ИЗ ПРОФИЛЯ\nChatID: ${finalId}\nTime: ${new Date().toLocaleTimeString()}` 
                        })
                    });
                    const resStatus = res.status;
                    const resText = await res.text();
                    testLogs.push(`Response status: ${resStatus}`);
                    
                    try {
                        const resData = JSON.parse(resText);
                        if (resStatus !== 200) {
                            testLogs.push(`Error Data: ${JSON.stringify(resData)}`);
                        } else {
                            testLogs.push("✅ Message sent successfully!");
                        }
                    } catch (e) {
                        testLogs.push(`Raw Response (not JSON): ${resText.substring(0, 200)}`);
                    }
                } catch (e: any) {
                    testLogs.push(`Fetch Error: ${e.message}`);
                }
            }
        }
        
        setMaxDebugInfo(testLogs.join("\n"));
    };

    const addLog = (message: string) => {
        const timestamp = new Date().toLocaleTimeString('ru-RU');
        setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
    };

    const handlePing = async () => {
        setError(null);
        addLog('Проверка GET /api/shorten-ping...');
        try {
            const res = await fetch('/api/shorten-ping', { method: 'GET' });
            const data = await res.json().catch(() => ({}));
            addLog(`GET ответ: status=${res.status}, ok=${res.ok}`);
            addLog(`tinyurl_configured: ${data.tinyurl_configured === true ? 'ДА' : 'НЕТ'}`);
            if (data.tinyurl_configured) addLog('✅ Токен TinyURL задан. Можно пробовать сокращать.');
            else addLog('❌ TINYURL_API_TOKEN не задан в Vercel.');
        } catch (e: any) {
            addLog(`❌ Ошибка: ${e?.message || String(e)}`);
        }
    };

    const handleShorten = async () => {
        if (!inputUrl.trim()) {
            setError('Введите URL');
            return;
        }
        try {
            new URL(inputUrl);
        } catch {
            setError('Неверный формат URL');
            return;
        }

        setLoading(true);
        setError(null);
        setShortUrl(null);
        addLog(`Начало сокращения URL: ${truncateForLog(inputUrl)}`);

        try {
            addLog('Клиент → POST /api/shorten');
            addLog(`Тело запроса: {"url":"${truncateForLog(inputUrl)}"} (длина: ${inputUrl.length})`);
            
            const res = await fetch('/api/shorten', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: inputUrl }),
            });

            const raw = await res.text();
            addLog(`Ответ: status=${res.status}, ok=${res.ok}`);

            if (res.ok) {
                let data: any = {};
                try { data = JSON.parse(raw); } catch { data = { message: raw }; }
                if (data.short_url) {
                    setShortUrl(data.short_url);
                    addLog(`✅ Успешно! Короткая ссылка: ${data.short_url}`);
                } else {
                    setError('Короткая ссылка не получена');
                    addLog(`❌ В ответе нет short_url`);
                }
            } else {
                let errData: any = {};
                try { errData = JSON.parse(raw); } catch { errData = { message: raw }; }
                if (raw.includes('FUNCTION_INVOCATION_FAILED')) {
                    addLog('Сервер упал до ответа. Детали — в логах Vercel (Functions → /api/shorten).');
                }
                setError(errData.message || errData.error || raw || `Ошибка ${res.status}`);
                addLog(`❌ Ошибка: ${errData.error || errData.message || raw}`);
            }
        } catch (e: any) {
            const msg = e?.message || String(e);
            addLog(`❌ Исключение: ${msg}`);
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Тест TinyURL</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <Typography.Label style={{ marginBottom: '0.5rem', display: 'block' }}>
                    Введите длинную ссылку:
                </Typography.Label>
                <Input
                    type="url"
                    placeholder="https://example.com/very/long/url..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="login-input"
                    style={{ marginBottom: '0.75rem' }}
                    disabled={loading}
                />
                <Flex style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                    <Button
                        className="filter-button"
                        onClick={handlePing}
                        disabled={loading}
                        style={{ flex: 1, minWidth: '140px' }}
                    >
                        Проверить подключение
                    </Button>
                    <Button
                        className="button-primary"
                        onClick={handleShorten}
                        disabled={loading || !inputUrl.trim()}
                        style={{ flex: 1, minWidth: '140px' }}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                Сокращаю...
                            </>
                        ) : (
                            'Сократить ссылку'
                        )}
                    </Button>
                </Flex>

                {error && (
                    <Flex align="center" className="login-error mt-4">
                        <AlertTriangle className="w-5 h-5 mr-2" />
                        <Typography.Body>{error}</Typography.Body>
                    </Flex>
                )}

                {shortUrl && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: '0.5rem' }}>
                        <Typography.Label style={{ marginBottom: '0.5rem', display: 'block' }}>
                            Короткая ссылка:
                        </Typography.Label>
                        <Typography.Body
                            style={{
                                wordBreak: 'break-all',
                                color: 'var(--color-primary)',
                                cursor: 'pointer',
                            }}
                            onClick={() => {
                                navigator.clipboard?.writeText(shortUrl).then(() => {
                                    alert('Скопировано!');
                                });
                            }}
                        >
                            {shortUrl}
                        </Typography.Body>
                    </div>
                )}
            </Panel>

            {isMaxWebApp() && (
                <Panel className="cargo-card mb-4" style={{ padding: '1rem', background: '#222', color: '#fff', border: '1px dashed #555', marginTop: '1rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#ffcc00' }}>🛠 MAX Debug (Profile Section)</Typography.Headline>
                    <Flex vertical gap="0.75rem">
                        <Button onClick={testMaxMessage} className="filter-button" style={{ background: '#ffcc00', color: '#000', fontWeight: 'bold' }}>
                            Отправить тестовое сообщение
                        </Button>
                        {maxDebugInfo && (
                            <pre style={{ 
                                background: '#000', 
                                padding: '0.75rem', 
                                borderRadius: '8px', 
                                fontSize: '0.75rem', 
                                overflowX: 'auto',
                                whiteSpace: 'pre-wrap',
                                border: '1px solid #333'
                            }}>
                                {maxDebugInfo}
                            </pre>
                        )}
                    </Flex>
                </Panel>
            )}

            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Typography.Label style={{ marginBottom: '0.75rem', display: 'block' }}>
                    Логи:
                </Typography.Label>
                <div
                    style={{
                        maxHeight: '400px',
                        overflowY: 'auto',
                        background: 'var(--color-bg-secondary)',
                        padding: '0.75rem',
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                    }}
                >
                    {logs.length === 0 ? (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>
                            Логи появятся здесь после попытки сокращения ссылки...
                        </Typography.Body>
                    ) : (
                        logs.map((log, idx) => (
                            <div key={idx} style={{ marginBottom: '0.25rem' }}>
                                {log}
                            </div>
                        ))
                    )}
                </div>
                {logs.length > 0 && (
                    <Button
                        className="filter-button"
                        onClick={() => setLogs([])}
                        style={{ marginTop: '0.75rem', width: '100%' }}
                    >
                        Очистить логи
                    </Button>
                )}
            </Panel>
        </div>
    );
}

function AiChatProfilePage({
    onBack,
    auth,
    accountId,
    customer,
    onOpenCargo,
    chatId,
    onOpenTelegramBot,
    onOpenMaxBot
}: {
    onBack: () => void;
    auth: AuthData | null;
    accountId: string | null;
    customer: string | null;
    onOpenCargo: (cargoNumber: string) => void;
    chatId: string | null;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
}) {
    const [prefillMessage, setPrefillMessage] = useState<string | undefined>(undefined);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [chatCustomerState, setChatCustomerState] = useState<{ customer: string | null; unlinked: boolean }>({
        customer: customer ?? null,
        unlinked: false,
    });
    const chatClearRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.sessionStorage.getItem("haulz.chat.prefill");
        if (stored) {
            setPrefillMessage(stored);
            window.sessionStorage.removeItem("haulz.chat.prefill");
        }
    }, []);

    return (
        <div
            className="w-full"
            style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 240px)' }}
        >
            <Flex align="center" style={{ marginBottom: '0.5rem', gap: '0.75rem', flexWrap: 'wrap' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Button
                    className="filter-button"
                    style={{ marginLeft: 'auto' }}
                    onClick={() => chatClearRef.current?.()}
                >
                    Очистить чат
                </Button>
                {onOpenTelegramBot && (
                    <img
                        src="/icons/telegram.png"
                        alt="Открыть в Telegram"
                        role="button"
                        title="Открыть в Telegram"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenTelegramBot();
                            } catch (e: any) {
                                setTgLinkError(e?.message || "Не удалось открыть Telegram-бота.");
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLImageElement).click(); } }}
                        className="chat-icon-btn"
                    />
                )}
                {onOpenMaxBot && (
                    <img
                        src="/icons/max.png"
                        alt="Открыть в MAX"
                        role="button"
                        title="Открыть в MAX"
                        tabIndex={0}
                        onClick={async () => {
                            setTgLinkError(null);
                            try {
                                await onOpenMaxBot();
                            } catch (e: any) {
                                setTgLinkError(e?.message || "Не удалось открыть MAX.");
                            }
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLImageElement).click(); } }}
                        className="chat-icon-btn"
                    />
                )}
            </Flex>
            <div style={{ marginBottom: '1rem', paddingLeft: '0.25rem' }}>
                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    Заказчик: {chatCustomerState.unlinked || !chatCustomerState.customer
                        ? 'не привязан'
                        : stripOoo(chatCustomerState.customer)}
                </Typography.Body>
            </div>
            {tgLinkError && (
                <Typography.Body style={{ color: 'var(--color-error-text)', marginBottom: '0.5rem' }}>
                    {tgLinkError}
                </Typography.Body>
            )}
            <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
                {auth ? (
                    <ChatPage
                        auth={auth}
                        sessionOverride={`ai_${customer || accountId || "anon"}_${chatId || "anon"}`}
                        userIdOverride={chatId || customer || accountId || "anon"}
                        customerOverride={customer || undefined}
                        prefillMessage={prefillMessage}
                        onClearPrefill={() => setPrefillMessage(undefined)}
                        onOpenCargo={onOpenCargo}
                        clearChatRef={chatClearRef}
                        onChatCustomerState={setChatCustomerState}
                    />
                ) : (
                    <Panel className="cargo-card" style={{ padding: '1rem', width: '100%' }}>
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            Сначала выберите компанию.
                        </Typography.Body>
                    </Panel>
                )}
            </div>
        </div>
    );
}

function AboutCompanyPage({ onBack }: { onBack: () => void }) {
    const normalizePhoneToTel = (phone: string) => {
        const digits = phone.replace(/[^\d+]/g, "");
        return digits.startsWith("+") ? digits : `+${digits}`;
    };

    const getMapsUrl = (address: string) => {
        const q = encodeURIComponent(address);
        return `https://yandex.ru/maps/?text=${q}`;
    };

    const shareText = async (title: string, text: string) => {
        try {
            // Web Share API (лучше всего для мессенджеров на мобилках)
            if (typeof navigator !== "undefined" && (navigator as any).share) {
                await (navigator as any).share({ title, text });
                return;
            }
        } catch {
            // игнорируем ошибки шаринга/отмены
        }
        // Фоллбек: копирование в буфер
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                alert("Скопировано");
                return;
            }
        } catch {
            // ignore
        }
        // Последний фоллбек
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            alert("Скопировано");
        } catch {
            alert(text);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}>
                    <ArrowLeft className="w-4 h-4" />
                </Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>О компании</Typography.Headline>
            </Flex>

            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <Typography.Body style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: '0.95rem' }}>
                    {ABOUT_HAULZ_TEXT}
                </Typography.Body>
            </Panel>

            <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                Контакты
            </Typography.Body>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {HAULZ_OFFICES.map((office) => (
                    <Panel key={office.city} className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: '0.5rem', gap: '0.5rem' }}>
                            <Typography.Body style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                                {office.city}
                            </Typography.Body>
                            <Button
                                className="filter-button"
                                type="button"
                                title="Поделиться"
                                aria-label="Поделиться"
                                style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }}
                                onClick={() => {
                                    const text = `HAULZ — ${office.city}\nАдрес: ${office.address}\nТел.: ${office.phone}\nEmail: ${HAULZ_EMAIL}`;
                                    shareText(`HAULZ — ${office.city}`, text);
                                }}
                            >
                                <Share2 className="w-4 h-4" />
                            </Button>
                        </Flex>
                        <a
                            className="filter-button"
                            href={getMapsUrl(`${office.city}, ${office.address}`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                marginBottom: "0.5rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Открыть маршрут"
                        >
                            <MapPin className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                {office.address}
                            </Typography.Body>
                        </a>
                        <a
                            className="filter-button"
                            href={`tel:${normalizePhoneToTel(office.phone)}`}
                            style={{
                                width: "100%",
                                justifyContent: "flex-start",
                                gap: "0.5rem",
                                padding: "0.5rem 0.75rem",
                                backgroundColor: "transparent",
                                textDecoration: "none",
                            }}
                            title="Позвонить"
                        >
                            <Phone className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                {office.phone}
                            </Typography.Body>
                        </a>
                    </Panel>
                ))}
            </div>

            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Flex align="center" justify="space-between" style={{ gap: '0.5rem' }}>
                    <a
                        className="filter-button"
                        href={`mailto:${HAULZ_EMAIL}`}
                        style={{
                            width: "100%",
                            justifyContent: "flex-start",
                            gap: "0.5rem",
                            padding: "0.5rem 0.75rem",
                            backgroundColor: "transparent",
                            textDecoration: "none",
                            marginRight: "0.5rem",
                        }}
                        title="Написать письмо"
                    >
                        <Mail className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            {HAULZ_EMAIL}
                        </Typography.Body>
                    </a>
                    <Button
                        className="filter-button"
                        type="button"
                        title="Поделиться"
                        aria-label="Поделиться"
                        style={{ padding: '0.25rem 0.5rem', minWidth: 'auto', flexShrink: 0 }}
                        onClick={() => {
                            const text = `HAULZ\nEmail: ${HAULZ_EMAIL}\nТел.: ${HAULZ_OFFICES.map(o => `${o.city}: ${o.phone}`).join(" | ")}`;
                            shareText("HAULZ — контакты", text);
                        }}
                    >
                        <Share2 className="w-4 h-4" />
                    </Button>
                </Flex>
            </Panel>
        </div>
    );
}

// --- NOTIFICATION EVENTS: Перевозки + Документы (шаблоны для Telegram: Принята, В пути, Доставлено; Счёт оплачен) ---
const NOTIF_PEREVOZKI: { id: string; label: string }[] = [
  { id: "accepted", label: "Принята" },
  { id: "in_transit", label: "В пути" },
  { id: "delivered", label: "Доставлено" },
];
const NOTIF_DOCS: { id: string; label: string }[] = [
  { id: "bill_created", label: "Создан счёт" },
  { id: "bill_paid", label: "Счёт оплачен" },
];
const NOTIF_SUMMARY: { id: string; label: string }[] = [
  { id: "daily_summary", label: "Ежедневная сводка в 10:00" },
];

function NotificationsPage({
  activeAccount,
  activeAccountId,
  onBack,
  onOpenDeveloper,
  onOpenTelegramBot,
  onOpenMaxBot,
  onUpdateAccount,
}: {
  activeAccount: Account | null;
  activeAccountId: string | null;
  onBack: () => void;
  onOpenDeveloper: () => void;
  onOpenTelegramBot?: () => Promise<void>;
  onOpenMaxBot?: () => Promise<void>;
  onUpdateAccount?: (accountId: string, patch: Partial<Account>) => void;
}) {
  const FETCH_TIMEOUT_MS = 8000;
  const withTimeout = async <T,>(factory: (signal: AbortSignal) => Promise<T>, timeoutMs = FETCH_TIMEOUT_MS): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await factory(controller.signal);
    } finally {
      clearTimeout(timer);
    }
  };

  const [prefs, setPrefs] = useState<{ telegram: Record<string, boolean>; webpush: Record<string, boolean> }>({
    telegram: {},
    webpush: {},
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [webPushLoading, setWebPushLoading] = useState(false);
  const [webPushError, setWebPushError] = useState<string | null>(null);
  const [webPushSubscribed, setWebPushSubscribed] = useState(false);
  const [tgLinkLoading, setTgLinkLoading] = useState(false);
  const [tgLinkError, setTgLinkError] = useState<string | null>(null);
  const [tgUnlinkLoading, setTgUnlinkLoading] = useState(false);
  const [maxLinkLoading, setMaxLinkLoading] = useState(false);
  const [maxLinkError, setMaxLinkError] = useState<string | null>(null);
  /** Статус привязки Telegram с сервера (при открытии экрана и по «Проверить привязку»). */
  const [telegramLinkedFromApi, setTelegramLinkedFromApi] = useState<boolean | null>(null);
  const [maxLinkedFromApi, setMaxLinkedFromApi] = useState<boolean | null>(null);

  const login = activeAccount?.login?.trim().toLowerCase() || "";
  /** Telegram считается подключённым, если API вернул telegramLinked или в аккаунте уже есть флаг. */
  const telegramLinked = telegramLinkedFromApi ?? activeAccount?.twoFactorTelegramLinked ?? false;
  const maxLinked = maxLinkedFromApi ?? false;

  /** Запросить статус привязки Telegram и MAX (GET /api/2fa). */
  const checkTelegramLinked = useCallback(async () => {
    if (!login) return false;
    try {
      const res = await withTimeout(
        (signal) => fetch(`/api/2fa?login=${encodeURIComponent(login)}`, { signal }),
        FETCH_TIMEOUT_MS
      );
      if (!res.ok) return false;
      const data = await res.json();
      const linked = !!data?.settings?.telegramLinked;
      setTelegramLinkedFromApi(linked);
      setMaxLinkedFromApi(!!data?.settings?.maxLinked);
      if (linked && activeAccountId && onUpdateAccount) onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: true });
      return linked;
    } catch {
      return false;
    }
  }, [login, activeAccountId, onUpdateAccount]);

  useEffect(() => {
    if (!login) {
      setPrefsLoading(false);
      setTelegramLinkedFromApi(null);
      setMaxLinkedFromApi(null);
      return;
    }
    let cancelled = false;
    const hardStop = setTimeout(() => {
      if (!cancelled) setPrefsLoading(false);
    }, FETCH_TIMEOUT_MS + 2000);
    (async () => {
      try {
        const prefsRes = await withTimeout(
          (signal) => fetch(`/api/webpush-preferences?login=${encodeURIComponent(login)}`, { signal }),
          FETCH_TIMEOUT_MS
        ).catch(() => null);
        // Статус Telegram/MAX подгружаем независимо, чтобы не блокировать экран уведомлений.
        checkTelegramLinked().catch(() => {});
        if (cancelled) return;
        if (prefsRes?.ok) {
          const data = await prefsRes.json();
          if (!cancelled) setPrefs({ telegram: data.telegram || {}, webpush: data.webpush || {} });
        } else {
          if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
        }
      } catch {
        if (!cancelled) setPrefs({ telegram: {}, webpush: {} });
      } finally {
        if (!cancelled) setPrefsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(hardStop);
    };
  }, [login, checkTelegramLinked]);

  const savePrefs = useCallback(
    async (channel: "telegram" | "webpush", eventId: string, value: boolean) => {
      let nextPrefs: { telegram: Record<string, boolean>; webpush: Record<string, boolean> } | null = null;
      setPrefs((prev) => {
        const next = {
          ...prev,
          [channel]: { ...prev[channel], [eventId]: value },
        };
        nextPrefs = next;
        return next;
      });
      if (!login || !nextPrefs) return;
      setPrefsSaving(true);
      try {
        const res = await fetch("/api/webpush-preferences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, preferences: nextPrefs }),
        });
        if (!res.ok) {
          throw new Error("Не удалось сохранить настройки уведомлений.");
        }
      } catch {
        setTgLinkError("Не удалось сохранить настройки. Проверьте миграции notification_preferences.");
      } finally {
        setPrefsSaving(false);
      }
    },
    [login]
  );

  const enableWebPush = useCallback(async () => {
    if (!login) return;
    if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
      setWebPushError("Уведомления в браузере не поддерживаются.");
      return;
    }
    setWebPushError(null);
    setWebPushLoading(true);
    try {
      let permission = Notification.permission;
      if (permission === "default") {
        permission = await Notification.requestPermission();
      }
      if (permission !== "granted") {
        setWebPushError("Разрешение на уведомления отклонено.");
        setWebPushLoading(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await reg.update();
      const res = await fetch("/api/webpush-vapid");
      if (!res.ok) throw new Error("VAPID not configured");
      const { publicKey } = await res.json();
      if (!publicKey) throw new Error("No public key");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      const subRes = await fetch("/api/webpush-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, subscription: sub.toJSON() }),
      });
      if (!subRes.ok) throw new Error("Failed to save subscription");
      setWebPushSubscribed(true);
    } catch (e: any) {
      setWebPushError(e?.message || "Не удалось включить уведомления.");
    } finally {
      setWebPushLoading(false);
    }
  }, [login]);

  const disableTelegram = useCallback(async () => {
    if (!login) return;
    setTgLinkError(null);
    setTgUnlinkLoading(true);
    try {
      const res = await fetch("/api/telegram-unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login }),
      });
      let ok = false;
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        ok = !!data?.ok;
      }
      if (!ok) {
        // Fallback for environments where new endpoint is not available yet.
        const fallbackRes = await fetch("/api/2fa-telegram", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ login, action: "unlink" }),
        });
        const fallbackData = await fallbackRes.json().catch(() => ({}));
        if (!fallbackRes.ok || !fallbackData?.ok) {
          throw new Error(fallbackData?.error || "Не удалось отключить Telegram.");
        }
      }

      const telegramOff: Record<string, boolean> = {
        accepted: false,
        in_transit: false,
        delivered: false,
        bill_created: false,
        bill_paid: false,
        daily_summary: false,
      };
      const nextPrefs = { ...prefs, telegram: { ...prefs.telegram, ...telegramOff } };
      setPrefs(nextPrefs);
      await fetch("/api/webpush-preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ login, preferences: nextPrefs }),
      }).catch(() => {});

      setTelegramLinkedFromApi(false);
      if (activeAccountId && onUpdateAccount) onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: false });
      setTgLinkError(null);
    } catch (e: any) {
      setTgLinkError(e?.message || "Не удалось отключить Telegram.");
    } finally {
      setTgUnlinkLoading(false);
    }
  }, [login, prefs, activeAccountId, onUpdateAccount]);

  const webPushSupported =
    typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
  const SHOW_WEB_PUSH_SECTION = false;

  return (
    <div className="w-full">
      <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
        <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Typography.Headline style={{ fontSize: "1.25rem" }}>Уведомления</Typography.Headline>
      </Flex>

      {!login ? (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Войдите в аккаунт, чтобы настроить уведомления.
          </Typography.Body>
        </Panel>
      ) : prefsLoading ? (
        <Panel className="cargo-card" style={{ padding: "1rem" }}>
          <Flex align="center" gap="0.5rem">
            <Loader2 className="w-4 h-4 animate-spin" />
            <Typography.Body style={{ fontSize: "0.9rem" }}>Загрузка…</Typography.Body>
          </Flex>
        </Panel>
      ) : (
        <>
          {/* Чат-бот Telegram HAULZinfobot */}
          <Typography.Body style={{ marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
            Чат-бот Telegram HAULZinfobot
          </Typography.Body>
          <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {onOpenTelegramBot && (
              <Button
                type="button"
                className="filter-button"
                disabled={tgLinkLoading}
                onClick={async () => {
                  setTgLinkError(null);
                  setTgLinkLoading(true);
                  try {
                    await onOpenTelegramBot();
                  } catch (e: any) {
                    setTgLinkError(e?.message || "Не удалось открыть Telegram.");
                  } finally {
                    setTgLinkLoading(false);
                  }
                }}
              >
                {tgLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Открыть HAULZinfobot"}
              </Button>
            )}
            {!telegramLinked ? (
              <>
                <Typography.Body style={{ fontSize: "0.9rem" }}>
                  Для активации откройте HAULZinfobot и введите логин или ИНН. Затем подтвердите пин-код из email.
                </Typography.Body>
                {tgLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {tgLinkError}
                  </Typography.Body>
                )}
                {onOpenMaxBot && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={maxLinkLoading}
                    onClick={async () => {
                      setMaxLinkError(null);
                      setMaxLinkLoading(true);
                      try {
                        await onOpenMaxBot();
                      } catch (e: any) {
                        setMaxLinkError(e?.message || "Не удалось открыть MAX.");
                      } finally {
                        setMaxLinkLoading(false);
                      }
                    }}
                  >
                    {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                  </Button>
                )}
                {maxLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {maxLinkError}
                  </Typography.Body>
                )}
                <Typography.Body
                  style={{ fontSize: "0.8rem", color: "var(--color-primary)", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => checkTelegramLinked()}
                >
                  Проверить привязку
                </Typography.Body>
              </>
            ) : (
              <>
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                  Telegram подключён.
                </Typography.Body>
                <Button
                  type="button"
                  className="button-secondary"
                  disabled={tgUnlinkLoading}
                  onClick={disableTelegram}
                >
                  {tgUnlinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Отключить Telegram"}
                </Button>
                {tgLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {tgLinkError}
                  </Typography.Body>
                )}
                {maxLinked ? (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                    MAX подключён.
                  </Typography.Body>
                ) : onOpenMaxBot && (
                  <Button
                    type="button"
                    className="button-primary"
                    disabled={maxLinkLoading}
                    onClick={async () => {
                      setMaxLinkError(null);
                      setMaxLinkLoading(true);
                      try {
                        await onOpenMaxBot();
                      } catch (e: any) {
                        setMaxLinkError(e?.message || "Не удалось открыть MAX.");
                      } finally {
                        setMaxLinkLoading(false);
                      }
                    }}
                  >
                    {maxLinkLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Привязать MAX"}
                  </Button>
                )}
                {maxLinkError && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                    {maxLinkError}
                  </Typography.Body>
                )}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginBottom: "0.25rem" }}>
                  Раздел «Перевозки»
                </Typography.Body>
                {NOTIF_PEREVOZKI.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.telegram[ev.id]}
                      onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                    />
                  </Flex>
                ))}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                  Раздел «Документы»
                </Typography.Body>
                {NOTIF_DOCS.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.telegram[ev.id]}
                      onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                    />
                  </Flex>
                ))}
                <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                  Сводка
                </Typography.Body>
                {NOTIF_SUMMARY.map((ev) => (
                  <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                    <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                    <TapSwitch
                      checked={!!prefs.telegram[ev.id]}
                      onToggle={() => savePrefs("telegram", ev.id, !prefs.telegram[ev.id])}
                    />
                  </Flex>
                ))}
              </>
            )}
          </Panel>

          {SHOW_WEB_PUSH_SECTION && (
            <>
              {/* Web Push */}
              <Typography.Body style={{ marginTop: "1.25rem", marginBottom: "0.5rem", fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>
                Web Push (браузер)
              </Typography.Body>
              <Panel className="cargo-card" style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {webPushSupported && (
                  <>
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                      Уведомления в браузере (Chrome, Edge, Firefox; на iOS — после добавления на экран «Домой»).
                    </Typography.Body>
                    {!webPushSubscribed && (
                      <Button
                        type="button"
                        className="button-primary"
                        disabled={webPushLoading}
                        onClick={enableWebPush}
                      >
                        {webPushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Включить уведомления в браузере"}
                      </Button>
                    )}
                    {webPushSubscribed && (
                      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-success, #22c55e)" }}>
                        Уведомления в браузере включены.
                      </Typography.Body>
                    )}
                    {webPushError && (
                      <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-error, #ef4444)" }}>
                        {webPushError}
                      </Typography.Body>
                    )}
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.25rem", marginBottom: "0.25rem" }}>
                      Раздел «Перевозки»
                    </Typography.Body>
                    {NOTIF_PEREVOZKI.map((ev) => (
                      <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                        <TapSwitch
                          checked={!!prefs.webpush[ev.id]}
                          onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                        />
                      </Flex>
                    ))}
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                      Раздел «Документы»
                    </Typography.Body>
                    {NOTIF_DOCS.map((ev) => (
                      <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                        <TapSwitch
                          checked={!!prefs.webpush[ev.id]}
                          onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                        />
                      </Flex>
                    ))}
                    <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)", marginTop: "0.5rem", marginBottom: "0.25rem" }}>
                      Сводка
                    </Typography.Body>
                    {NOTIF_SUMMARY.map((ev) => (
                      <Flex key={ev.id} align="center" justify="space-between" style={{ gap: "0.5rem" }}>
                        <Typography.Body style={{ fontSize: "0.9rem" }}>{ev.label}</Typography.Body>
                        <TapSwitch
                          checked={!!prefs.webpush[ev.id]}
                          onToggle={() => savePrefs("webpush", ev.id, !prefs.webpush[ev.id])}
                        />
                      </Flex>
                    ))}
                  </>
                )}
                {!webPushSupported && (
                  <Typography.Body style={{ fontSize: "0.85rem", color: "var(--color-text-secondary)" }}>
                    Web Push доступен в браузерах (Chrome, Edge, Firefox). В мини‑приложении внутри соцсетей может быть недоступен.
                  </Typography.Body>
                )}
              </Panel>
            </>
          )}

          <Typography.Body
            style={{ marginTop: "1.5rem", fontSize: "0.8rem", color: "var(--color-text-secondary)", cursor: "pointer", textDecoration: "underline" }}
            onClick={onOpenDeveloper}
          >
            Для разработчиков
          </Typography.Body>
        </>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

// --- PROFILE PAGE ---
function ProfilePage({ 
    accounts, 
    activeAccountId, 
    onSwitchAccount, 
    onAddAccount, 
    onRemoveAccount,
    onOpenOffer,
    onOpenPersonalConsent,
    onOpenNotifications,
    onOpenCargo,
    onOpenTelegramBot,
    onOpenMaxBot,
    onUpdateAccount
}: { 
    accounts: Account[]; 
    activeAccountId: string | null; 
    onSwitchAccount: (accountId: string) => void; 
    onAddAccount: (login: string, password: string) => Promise<void>; 
    onRemoveAccount: (accountId: string) => void;
    onOpenOffer: () => void;
    onOpenPersonalConsent: () => void;
    onOpenNotifications: () => void;
    onOpenCargo: (cargoNumber: string) => void;
    onOpenTelegramBot?: () => Promise<void>;
    onOpenMaxBot?: () => Promise<void>;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
    const [tgLinkLoading, setTgLinkLoading] = useState(false);
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);
    const [tgLinkChecking, setTgLinkChecking] = useState(false);
    const [aliceCode, setAliceCode] = useState<string | null>(null);
    const [aliceExpiresAt, setAliceExpiresAt] = useState<number | null>(null);
    const [aliceLoading, setAliceLoading] = useState(false);
    const [aliceError, setAliceError] = useState<string | null>(null);
    const [aliceSuccess, setAliceSuccess] = useState<string | null>(null);
    const [googleSetupData, setGoogleSetupData] = useState<{ otpauthUrl: string; secret: string } | null>(null);
    const [googleSetupStep, setGoogleSetupStep] = useState<'idle' | 'qr' | 'verify'>('idle');
    const [googleSetupLoading, setGoogleSetupLoading] = useState(false);
    const [googleSetupError, setGoogleSetupError] = useState<string | null>(null);
    const [googleVerifyCode, setGoogleVerifyCode] = useState('');
    const [showPasswordForm, setShowPasswordForm] = useState(false);
    const [passwordCurrent, setPasswordCurrent] = useState('');
    const [passwordNew, setPasswordNew] = useState('');
    const [passwordConfirm, setPasswordConfirm] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [passwordSuccess, setPasswordSuccess] = useState(false);

    const [employeesList, setEmployeesList] = useState<{ id: number; login: string; active: boolean; createdAt: string; presetLabel: string; fullName?: string; department?: string; employeeRole?: "employee" | "department_head" }[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [employeesError, setEmployeesError] = useState<string | null>(null);
    const [rolePresets, setRolePresets] = useState<{ id: string; label: string }[]>([]);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteFullName, setInviteFullName] = useState('');
    const [inviteDepartment, setInviteDepartment] = useState('');
    const [inviteEmployeeRole, setInviteEmployeeRole] = useState<'employee' | 'department_head'>('employee');
    const [invitePresetId, setInvitePresetId] = useState('');
    const [inviteLoading, setInviteLoading] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
    const [employeeDeleteId, setEmployeeDeleteId] = useState<number | null>(null);
    const [employeeDeleteLoading, setEmployeeDeleteLoading] = useState(false);
    const [employeePresetLoadingId, setEmployeePresetLoadingId] = useState<number | null>(null);
    const [departmentTimesheetDepartment, setDepartmentTimesheetDepartment] = useState("");
    const [departmentTimesheetAllDepartments, setDepartmentTimesheetAllDepartments] = useState(false);
    const [departmentTimesheetEmployees, setDepartmentTimesheetEmployees] = useState<Array<{
        id: number;
        login: string;
        fullName: string;
        department: string;
        position: string;
        cooperationType?: "self_employed" | "ip" | "staff" | string;
        employeeRole: "employee" | "department_head";
        accrualType: "hour" | "shift" | "month";
        accrualRate: number;
        active: boolean;
    }>>([]);
    const [departmentTimesheetAvailableEmployees, setDepartmentTimesheetAvailableEmployees] = useState<Array<{
        id: number;
        login: string;
        fullName: string;
        position: string;
        employeeRole: "employee" | "department_head";
    }>>([]);
    const [departmentTimesheetSelectedEmployeeId, setDepartmentTimesheetSelectedEmployeeId] = useState<string>("");
    const [departmentTimesheetLoading, setDepartmentTimesheetLoading] = useState(false);
    const [departmentTimesheetError, setDepartmentTimesheetError] = useState<string | null>(null);
    const [departmentTimesheetSearch, setDepartmentTimesheetSearch] = useState("");
    const [departmentTimesheetMonth, setDepartmentTimesheetMonth] = useState<string>(() => {
        const now = new Date();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return `${now.getFullYear()}-${month}`;
    });
    const departmentTimesheetEditableMonthKeys = useMemo(() => {
        const now = new Date();
        const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
        const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const previousMonthKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
        return new Set([currentMonthKey, previousMonthKey]);
    }, []);
    const departmentTimesheetIsEditableMonth = departmentTimesheetEditableMonthKeys.has(departmentTimesheetMonth);
    const [departmentTimesheetHours, setDepartmentTimesheetHours] = useState<Record<string, string>>({});
    const [departmentTimesheetPayoutsByEmployee, setDepartmentTimesheetPayoutsByEmployee] = useState<Record<string, number>>({});
    const [departmentTimesheetPaidDayMarks, setDepartmentTimesheetPaidDayMarks] = useState<Record<string, boolean>>({});
    const [departmentTimesheetShiftRateOverrides, setDepartmentTimesheetShiftRateOverrides] = useState<Record<string, number>>({});
    const [departmentTimesheetMobilePicker, setDepartmentTimesheetMobilePicker] = useState(false);
    const sortedDepartmentTimesheetEmployees = useMemo(() => {
        return [...departmentTimesheetEmployees].sort((a, b) => {
            const posA = String(a.position || "").trim();
            const posB = String(b.position || "").trim();
            const posCmp = (posA || "\uffff").localeCompare((posB || "\uffff"), "ru");
            if (posCmp !== 0) return posCmp;
            const nameA = String(a.fullName || a.login || "").trim();
            const nameB = String(b.fullName || b.login || "").trim();
            return nameA.localeCompare(nameB, "ru");
        });
    }, [departmentTimesheetEmployees]);
    const filteredDepartmentTimesheetEmployees = useMemo(() => {
        const q = departmentTimesheetSearch.trim().toLowerCase();
        if (!q) return sortedDepartmentTimesheetEmployees;
        return sortedDepartmentTimesheetEmployees.filter((emp) => {
            const haystack = [emp.fullName, emp.login, emp.position, emp.department]
                .map((x) => String(x || "").toLowerCase())
                .join(" ");
            return haystack.includes(q);
        });
    }, [departmentTimesheetSearch, sortedDepartmentTimesheetEmployees]);
    const [departmentTimesheetEmployeeFullName, setDepartmentTimesheetEmployeeFullName] = useState("");
    const [departmentTimesheetEmployeePosition, setDepartmentTimesheetEmployeePosition] = useState("");
    const [departmentTimesheetEmployeeAccrualType, setDepartmentTimesheetEmployeeAccrualType] = useState<"hour" | "shift" | "month">("hour");
    const [departmentTimesheetEmployeeAccrualRate, setDepartmentTimesheetEmployeeAccrualRate] = useState("0");
    const [departmentTimesheetEmployeeCooperationType, setDepartmentTimesheetEmployeeCooperationType] = useState<"self_employed" | "ip" | "staff">("staff");
    const [departmentTimesheetEmployeeSaving, setDepartmentTimesheetEmployeeSaving] = useState(false);
    const WORK_DAYS_IN_MONTH = 21;
    const SHIFT_MARK_OPTIONS = [
        { code: "Я", label: "Явка", bg: "#35c46a", color: "#ffffff", border: "#1f8f45" },
        { code: "ПР", label: "Прогул", bg: "#ef4444", color: "#ffffff", border: "#dc2626" },
        { code: "Б", label: "Болезнь", bg: "#f59e0b", color: "#111827", border: "#d97706" },
        { code: "В", label: "Выходной", bg: "#94a3b8", color: "#ffffff", border: "#64748b" },
        { code: "ОГ", label: "Отгул", bg: "#8b5cf6", color: "#ffffff", border: "#7c3aed" },
        { code: "ОТ", label: "Отпуск", bg: "#3b82f6", color: "#ffffff", border: "#2563eb" },
        { code: "УВ", label: "Уволен", bg: "#6b7280", color: "#ffffff", border: "#4b5563" },
    ] as const;
    const SHIFT_MARK_CODES = SHIFT_MARK_OPTIONS.map((x) => x.code);
    type ShiftMarkCode = typeof SHIFT_MARK_OPTIONS[number]["code"];
    const [departmentShiftPicker, setDepartmentShiftPicker] = useState<{ key: string; employeeId: number; day: number; x: number; y: number; isShift: boolean } | null>(null);
    const departmentShiftHoldTimerRef = useRef<number | null>(null);
    const departmentShiftHoldTriggeredRef = useRef(false);
    const normalizeShiftMark = (rawValue: string): ShiftMarkCode | "" => {
        const raw = String(rawValue || "").trim().toUpperCase();
        if (!raw) return "";
        if (raw === "Я") return "Я";
        if (raw === "ПР") return "ПР";
        if (raw === "Б") return "Б";
        if (raw === "В") return "В";
        if (raw === "ОГ") return "ОГ";
        if (raw === "ОТ") return "ОТ";
        if (raw === "УВ") return "УВ";
        // Backward compatibility with old shift markers.
        if (raw === "С" || raw === "C" || raw === "1" || raw === "TRUE") return "Я";
        return "";
    };
    const getShiftMarkStyle = (mark: ShiftMarkCode | "") => {
        const option = SHIFT_MARK_OPTIONS.find((x) => x.code === mark);
        if (!option) {
            return { border: "1px solid var(--color-border)", background: "var(--color-bg)", color: "var(--color-text-secondary)" };
        }
        return { border: `1px solid ${option.border}`, background: option.bg, color: option.color };
    };
    const normalizeDepartmentAccrualType = (value: unknown): "hour" | "shift" | "month" => {
        const raw = String(value || '').trim().toLowerCase();
        if (!raw) return "hour";
        if (raw === "month" || raw === "месяц" || raw === "monthly" || raw.includes("month") || raw.includes("месяц")) return "month";
        if (raw === "shift" || raw === "смена" || raw.includes("shift") || raw.includes("смен")) return "shift";
        return "hour";
    };
    const isShiftAccrual = (value: string) => {
        return normalizeDepartmentAccrualType(value) === "shift";
    };
    const getDayRateByAccrualType = (rate: number, accrualType: "hour" | "shift" | "month") => {
        return accrualType === "month" ? rate / WORK_DAYS_IN_MONTH : rate;
    };
    const departmentTimesheetMonthlyEstimate = useMemo(() => {
        const rate = Number(String(departmentTimesheetEmployeeAccrualRate || '').replace(',', '.'));
        if (!Number.isFinite(rate) || rate < 0) return 0;
        if (departmentTimesheetEmployeeAccrualType === "month") return rate;
        return departmentTimesheetEmployeeAccrualType === 'shift' ? rate * WORK_DAYS_IN_MONTH : rate * 8 * WORK_DAYS_IN_MONTH;
    }, [departmentTimesheetEmployeeAccrualRate, departmentTimesheetEmployeeAccrualType]);
    const toHalfHourValue = (raw: string) => {
        const parsed = Number(String(raw || '').replace(',', '.'));
        if (!Number.isFinite(parsed)) return '0.0';
        const normalized = Math.max(0, Math.min(24, parsed));
        return (Math.round(normalized * 2) / 2).toFixed(1);
    };
    const parseHourValue = (rawValue: string): number => {
        const raw = String(rawValue || '').trim();
        if (!raw) return 0;
        const hhmm = raw.match(/^(\d{1,2}):(\d{2})$/);
        if (hhmm) {
            const h = Number(hhmm[1]);
            const m = Number(hhmm[2]);
            if (Number.isFinite(h) && Number.isFinite(m) && m >= 0 && m < 60) return h + m / 60;
        }
        const parsed = Number(raw.replace(',', '.'));
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const getHourlyCellMark = (rawValue: string): ShiftMarkCode | "" => {
        const mark = normalizeShiftMark(rawValue);
        if (mark) return mark;
        return parseHourValue(rawValue) > 0 ? "Я" : "В";
    };
    const departmentTimesheetHalfHourOptions = useMemo(() => {
        return Array.from({ length: 49 }, (_, idx) => {
            const hours = Math.floor(idx / 2);
            const mins = idx % 2 === 0 ? '00' : '30';
            const value = (idx * 0.5).toFixed(1);
            return { value, label: `${hours}:${mins}` };
        });
    }, []);

    const DEPARTMENT_OPTIONS = [
        'Склад Москва',
        'Склад Калининград',
        'Отдел продаж',
        'Управляющая компания',
    ] as const;
    const COOPERATION_TYPE_OPTIONS = [
        { value: "self_employed", label: "Самозанятость" },
        { value: "ip", label: "ИП" },
        { value: "staff", label: "Штатный сотрудник" },
    ] as const;
    const employeeRoleLabel = (value?: string) => value === 'department_head' ? 'Руководитель подразделения' : 'Сотрудник';
    const cooperationTypeLabel = (value?: string) => {
        if (value === "self_employed") return "Самозанятость";
        if (value === "ip") return "ИП";
        return "Штатный сотрудник";
    };

    const fetchEmployeesAndPresets = useCallback(async () => {
        if (!activeAccount?.login) return;
        setEmployeesLoading(true);
        setEmployeesError(null);
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            // Пресеты ролей — без авторизации, загружаем всегда (чтобы выпадающий список ролей появлялся)
            const presetsRes = await fetch(`${origin}/api/role-presets`);
            const presetsData = await presetsRes.json().catch(() => ({}));
            if (presetsRes.ok && Array.isArray(presetsData.presets)) {
                setRolePresets(presetsData.presets.map((p: { id: string; label: string }) => ({ id: String(p.id), label: p.label || '' })));
            }

            if (!activeAccount?.password) {
                setEmployeesList([]);
                return;
            }
            const listRes = await fetch(`${origin}/api/my-employees`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
            });
            const listData = await listRes.json().catch(() => ({}));
            if (listRes.ok && listData.employees) setEmployeesList(listData.employees);
            else setEmployeesError(listData.error || 'Ошибка загрузки');
        } catch {
            setEmployeesError('Ошибка сети');
        } finally {
            setEmployeesLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password]);

    const departmentTimesheetDays = useMemo(() => {
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return [];
        const [yearRaw, monthRaw] = departmentTimesheetMonth.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];
        const daysInMonth = new Date(year, month, 0).getDate();
        return Array.from({ length: daysInMonth }, (_, idx) => idx + 1);
    }, [departmentTimesheetMonth]);
    const departmentTimesheetWeekdayByDay = useMemo(() => {
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return {} as Record<number, { short: string; isWeekend: boolean }>;
        const [yearRaw, monthRaw] = departmentTimesheetMonth.split("-");
        const year = Number(yearRaw);
        const month = Number(monthRaw);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return {} as Record<number, { short: string; isWeekend: boolean }>;
        const weekdayShort = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        const out: Record<number, { short: string; isWeekend: boolean }> = {};
        for (const day of departmentTimesheetDays) {
            const dt = new Date(year, month - 1, day);
            const wd = dt.getDay();
            out[day] = { short: weekdayShort[wd] ?? "", isWeekend: wd === 0 || wd === 6 };
        }
        return out;
    }, [departmentTimesheetMonth, departmentTimesheetDays]);
    const calculateTimesheetSummary = (employees: typeof departmentTimesheetEmployees) => {
        let totalHours = 0;
        let totalShifts = 0;
        let totalMoney = 0;
        let totalPaid = 0;
        for (const emp of employees) {
            const accrualType = normalizeDepartmentAccrualType(emp.accrualType);
            const isShift = accrualType === "shift";
            const isMarkAccrualType = accrualType === "shift" || accrualType === "month";
            const rate = Number(emp.accrualRate ?? 0);
            if (isMarkAccrualType) {
                const shifts = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    return acc + (normalizeShiftMark(departmentTimesheetHours[key] || '') === 'Я' ? 1 : 0);
                }, 0);
                const shiftMoney = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    if (normalizeShiftMark(departmentTimesheetHours[key] || '') !== 'Я') return acc;
                    const override = Number(departmentTimesheetShiftRateOverrides[key]);
                    const dayRate = isShift
                        ? (Number.isFinite(override) ? override : rate)
                        : getDayRateByAccrualType(rate, accrualType);
                    return acc + dayRate;
                }, 0);
                totalShifts += shifts;
                totalHours += shifts * 8;
                totalMoney += shiftMoney;
            } else {
                const hours = departmentTimesheetDays.reduce((acc, day) => {
                    const key = `${emp.id}:${day}`;
                    const value = Number(String(departmentTimesheetHours[key] || '').trim().replace(',', '.'));
                    return acc + (Number.isFinite(value) ? value : 0);
                }, 0);
                totalHours += hours;
                totalMoney += hours * rate;
            }
            totalPaid += Number(departmentTimesheetPayoutsByEmployee[String(emp.id)] || 0);
        }
        return {
            totalHours: Number(totalHours.toFixed(2)),
            totalShifts,
            totalMoney: Number(totalMoney.toFixed(2)),
            totalPaid: Number(totalPaid.toFixed(2)),
            totalOutstanding: Math.max(0, Number((totalMoney - totalPaid).toFixed(2))),
        };
    };
    const departmentTimesheetSummary = useMemo(() => {
        return calculateTimesheetSummary(departmentTimesheetEmployees);
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
    const departmentTimesheetDepartmentSummaries = useMemo(() => {
        const grouped = new Map<string, typeof departmentTimesheetEmployees>();
        for (const emp of departmentTimesheetEmployees) {
            const dep = String(emp.department || "").trim() || "Без подразделения";
            const prev = grouped.get(dep) || [];
            grouped.set(dep, [...prev, emp]);
        }
        return Array.from(grouped.entries())
            .map(([departmentName, employees]) => ({
                departmentName,
                ...calculateTimesheetSummary(employees),
            }))
            .sort((a, b) => a.departmentName.localeCompare(b.departmentName, "ru"));
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);
    const companyTimesheetSummary = useMemo(() => {
        return calculateTimesheetSummary(departmentTimesheetEmployees);
    }, [departmentTimesheetEmployees, departmentTimesheetDays, departmentTimesheetHours, departmentTimesheetPayoutsByEmployee, departmentTimesheetShiftRateOverrides]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const update = () => setDepartmentTimesheetMobilePicker(window.matchMedia('(max-width: 768px)').matches);
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, []);

    const fetchDepartmentTimesheet = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        setDepartmentTimesheetLoading(true);
        setDepartmentTimesheetError(null);
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, month: departmentTimesheetMonth }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setDepartmentTimesheetError(data.error || "Ошибка загрузки табеля");
                setDepartmentTimesheetAllDepartments(false);
                setDepartmentTimesheetEmployees([]);
                setDepartmentTimesheetAvailableEmployees([]);
                setDepartmentTimesheetHours({});
                setDepartmentTimesheetPayoutsByEmployee({});
                setDepartmentTimesheetPaidDayMarks({});
                setDepartmentTimesheetShiftRateOverrides({});
                return;
            }
            setDepartmentTimesheetDepartment(typeof data.department === "string" ? data.department : "");
            setDepartmentTimesheetAllDepartments(data?.allDepartments === true);
            setDepartmentTimesheetEmployees(Array.isArray(data.employees) ? data.employees : []);
            setDepartmentTimesheetAvailableEmployees(Array.isArray(data.availableEmployees) ? data.availableEmployees : []);
            const loadedEntries: Record<string, string> = {};
            if (data.entries && typeof data.entries === "object") {
                for (const [entryKey, entryValue] of Object.entries(data.entries as Record<string, string>)) {
                    const match = /^(\d+)__(\d{4}-\d{2})-(\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    if (match[2] !== departmentTimesheetMonth) continue;
                    const employeeId = Number(match[1]);
                    const day = Number(match[3]);
                    if (!Number.isFinite(employeeId) || !Number.isFinite(day)) continue;
                    loadedEntries[`${employeeId}:${day}`] = String(entryValue || "");
                }
            }
            setDepartmentTimesheetHours(loadedEntries);
            setDepartmentTimesheetPayoutsByEmployee(
                data?.payoutsByEmployee && typeof data.payoutsByEmployee === "object"
                    ? (data.payoutsByEmployee as Record<string, number>)
                    : {}
            );
            const paidDayMarks: Record<string, boolean> = {};
            if (data?.paidDatesByEmployee && typeof data.paidDatesByEmployee === "object") {
                for (const [employeeId, dates] of Object.entries(data.paidDatesByEmployee as Record<string, string[]>)) {
                    for (const date of Array.isArray(dates) ? dates : []) {
                        const match = /^\d{4}-\d{2}-(\d{2})$/.exec(String(date || ""));
                        if (!match) continue;
                        const day = Number(match[1]);
                        if (!Number.isFinite(day) || day <= 0) continue;
                        paidDayMarks[`${employeeId}:${day}`] = true;
                    }
                }
            }
            setDepartmentTimesheetPaidDayMarks(paidDayMarks);
            const loadedShiftRateOverrides: Record<string, number> = {};
            if (data?.shiftRateOverrides && typeof data.shiftRateOverrides === "object") {
                for (const [entryKey, entryValue] of Object.entries(data.shiftRateOverrides as Record<string, number>)) {
                    const match = /^(\d+)__(\d{4}-\d{2})-(\d{2})$/.exec(entryKey);
                    if (!match) continue;
                    if (match[2] !== departmentTimesheetMonth) continue;
                    const employeeId = Number(match[1]);
                    const day = Number(match[3]);
                    const rateValue = Number(entryValue);
                    if (!Number.isFinite(employeeId) || !Number.isFinite(day) || !Number.isFinite(rateValue)) continue;
                    loadedShiftRateOverrides[`${employeeId}:${day}`] = Number(rateValue);
                }
            }
            setDepartmentTimesheetShiftRateOverrides(loadedShiftRateOverrides);
        } catch {
            setDepartmentTimesheetError("Ошибка сети");
            setDepartmentTimesheetAllDepartments(false);
            setDepartmentTimesheetEmployees([]);
            setDepartmentTimesheetAvailableEmployees([]);
            setDepartmentTimesheetHours({});
            setDepartmentTimesheetPayoutsByEmployee({});
            setDepartmentTimesheetPaidDayMarks({});
            setDepartmentTimesheetShiftRateOverrides({});
        } finally {
            setDepartmentTimesheetLoading(false);
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth]);

    const saveDepartmentTimesheetCell = useCallback(async (employeeId: number, day: number, value: string) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего и предыдущего месяца');
            return;
        }
        const dayNormalized = String(day).padStart(2, "0");
        const dateIso = `${departmentTimesheetMonth}-${dayNormalized}`;
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                    date: dateIso,
                    value,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Ошибка сохранения табеля");
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || "Ошибка сохранения табеля");
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth]);
    const saveDepartmentTimesheetShiftRate = useCallback(async (employeeId: number, day: number, shiftRate: string) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!/^\d{4}-\d{2}$/.test(departmentTimesheetMonth)) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего и предыдущего месяца');
            return;
        }
        const dayNormalized = String(day).padStart(2, "0");
        const dateIso = `${departmentTimesheetMonth}-${dayNormalized}`;
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                    date: dateIso,
                    shiftRate: shiftRate.trim() === '' ? null : Number(shiftRate),
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || "Ошибка сохранения стоимости смены");
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || "Ошибка сохранения стоимости смены");
            await fetchDepartmentTimesheet();
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, fetchDepartmentTimesheet]);

    const removeDepartmentEmployeeFromMonth = useCallback(async (employeeId: number) => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего и предыдущего месяца');
            return;
        }
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        const confirmed = typeof window !== 'undefined' ? window.confirm('Удалить сотрудника из табеля выбранного месяца?') : true;
        if (!confirmed) return;
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    employeeId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка удаления сотрудника из месяца');
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка удаления сотрудника из месяца');
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, fetchDepartmentTimesheet]);

    const addExistingDepartmentTimesheetEmployee = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего и предыдущего месяца');
            return;
        }
        const selectedId = Number(departmentTimesheetSelectedEmployeeId);
        if (!Number.isFinite(selectedId) || selectedId <= 0) {
            setDepartmentTimesheetError('Выберите сотрудника из списка');
            return;
        }
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    existingEmployeeId: selectedId,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка добавления сотрудника');
            setDepartmentTimesheetSelectedEmployeeId("");
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка добавления сотрудника');
        } finally {
            setDepartmentTimesheetEmployeeSaving(false);
        }
    }, [activeAccount?.login, activeAccount?.password, departmentTimesheetMonth, departmentTimesheetIsEditableMonth, departmentTimesheetSelectedEmployeeId, fetchDepartmentTimesheet]);

    const addDepartmentTimesheetEmployee = useCallback(async () => {
        if (!activeAccount?.login || !activeAccount?.password) return;
        if (!departmentTimesheetIsEditableMonth) {
            setDepartmentTimesheetError('Редактирование доступно только для текущего и предыдущего месяца');
            return;
        }
        if (!departmentTimesheetEmployeeFullName.trim()) {
            setDepartmentTimesheetError('Укажите ФИО');
            return;
        }
        const rate = Number(departmentTimesheetEmployeeAccrualRate);
        if (!Number.isFinite(rate) || rate < 0) {
            setDepartmentTimesheetError('Укажите корректную ставку');
            return;
        }
        const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
        setDepartmentTimesheetEmployeeSaving(true);
        setDepartmentTimesheetError(null);
        try {
            const res = await fetch(`${origin}/api/my-department-timesheet`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    login: activeAccount.login,
                    password: activeAccount.password,
                    month: departmentTimesheetMonth,
                    fullName: departmentTimesheetEmployeeFullName.trim(),
                    department: departmentTimesheetDepartment,
                    position: departmentTimesheetEmployeePosition.trim(),
                    accrualType: departmentTimesheetEmployeeAccrualType,
                    accrualRate: rate,
                    cooperationType: departmentTimesheetEmployeeCooperationType,
                    employeeRole: 'employee',
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Ошибка добавления сотрудника');
            setDepartmentTimesheetEmployeeFullName("");
            setDepartmentTimesheetEmployeePosition("");
            setDepartmentTimesheetEmployeeAccrualType("hour");
            setDepartmentTimesheetEmployeeAccrualRate("0");
            setDepartmentTimesheetEmployeeCooperationType("staff");
            await fetchDepartmentTimesheet();
        } catch (e) {
            setDepartmentTimesheetError((e as Error)?.message || 'Ошибка добавления сотрудника');
        } finally {
            setDepartmentTimesheetEmployeeSaving(false);
        }
    }, [
        activeAccount?.login,
        activeAccount?.password,
        departmentTimesheetMonth,
        departmentTimesheetIsEditableMonth,
        departmentTimesheetEmployeeFullName,
        departmentTimesheetDepartment,
        departmentTimesheetEmployeePosition,
        departmentTimesheetEmployeeAccrualType,
        departmentTimesheetEmployeeAccrualRate,
        departmentTimesheetEmployeeCooperationType,
        fetchDepartmentTimesheet,
    ]);

    const checkTelegramLinkStatus = useCallback(async () => {
        if (!activeAccount?.login || !activeAccountId) return false;
        try {
            const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
            if (!res.ok) return false;
            const data = await res.json();
            const linked = !!data?.settings?.telegramLinked;
            setTwoFactorTelegramLinked(linked);
            onUpdateAccount(activeAccountId, { twoFactorTelegramLinked: linked });
            return linked;
        } catch {
            return false;
        }
    }, [activeAccount?.login, activeAccountId, onUpdateAccount]);

    const pollTelegramLink = useCallback(async () => {
        if (tgLinkChecking) return;
        setTgLinkChecking(true);
        try {
            let attempts = 0;
            let linked = false;
            while (attempts < 10 && !linked) {
                linked = await checkTelegramLinkStatus();
                if (linked) break;
                await new Promise((r) => setTimeout(r, 2000));
                attempts += 1;
            }
        } finally {
            setTgLinkChecking(false);
        }
    }, [checkTelegramLinkStatus, tgLinkChecking]);

    useEffect(() => {
        if (!activeAccount) return;
        setTwoFactorEnabled(!!activeAccount.twoFactorEnabled);
        setTwoFactorMethod(activeAccount.twoFactorMethod ?? "google");
        setTwoFactorTelegramLinked(!!activeAccount.twoFactorTelegramLinked);
    }, [activeAccount?.id]);

    useEffect(() => {
        if (!twoFactorEnabled || twoFactorMethod !== "telegram") return;
        if (twoFactorTelegramLinked) return;
        void checkTelegramLinkStatus();
    }, [twoFactorEnabled, twoFactorMethod, twoFactorTelegramLinked, checkTelegramLinkStatus]);

    useEffect(() => {
        if ((currentView === 'employees' || currentView === 'haulz') && activeAccount?.login) void fetchEmployeesAndPresets();
    }, [currentView, activeAccount?.login, fetchEmployeesAndPresets]);

    useEffect(() => {
        if (currentView === 'departmentTimesheet' && activeAccount?.login) void fetchDepartmentTimesheet();
    }, [currentView, activeAccount?.login, fetchDepartmentTimesheet]);

    // Настройки
    const settingsItems = [
        { 
            id: 'companies', 
            label: 'Мои компании', 
            icon: <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('companies')
        },
        { 
            id: 'roles', 
            label: 'Роли', 
            icon: <UserIcon className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('roles')
        },
        ...((activeAccount?.isSuperAdmin || activeAccount?.permissions?.haulz === true) ? [{
            id: 'haulz',
            label: 'HAULZ',
            icon: <LayoutGrid className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('haulz')
        }] : []),
        ...(activeAccount?.isRegisteredUser && activeAccount?.inCustomerDirectory === true ? [
        // Сотрудники доступны только если в админке включено право «Руководитель» для этого пользователя
        ...(activeAccount?.permissions?.supervisor === true && activeAccount?.permissions?.haulz === true ? [{
            id: 'employees',
            label: 'Справочник сотрудников',
            icon: <Users className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('employees')
        }] : [])
        ] : []),
        ...(!!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true ? [
        { 
            id: 'voiceAssistants', 
            label: 'Голосовые помощники', 
            icon: <Mic className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('voiceAssistants')
        },
        ] : []),
        { 
            id: 'notifications', 
            label: 'Уведомления', 
            icon: <Bell className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('notifications')
        },
    ];

    const faqItems = [
        // ——— Вход ———
        {
            q: "Как войти в приложение?",
            a: "Есть два способа. 1) Вход по email и паролю: введите логин (ваш email) и пароль от личного кабинета HAULZ. Перед первым входом нужно принять публичную оферту и согласие на обработку персональных данных. 2) Вход по логину и паролю от 1С: на экране входа нажмите «По логину и паролю» и введите учётные данные от системы 1С — после входа будут доступны компании, привязанные к этому логину. Выбор способа зависит от того, как вас зарегистрировали (email в HAULZ или доступ через 1С).",
            img: "/faq-account.svg",
            alt: "Вход в приложение"
        },
        {
            q: "Забыли пароль?",
            a: "На экране входа нажмите ссылку «Забыли пароль?». На вашу почту (email, указанный при регистрации) придёт письмо со ссылкой для восстановления. Перейдите по ссылке, задайте новый пароль на сайте HAULZ. После этого войдите в приложение с новым паролем. Если письмо не пришло — проверьте папку «Спам» или напишите в поддержку.",
            img: "/faq-account.svg",
            alt: "Восстановление пароля"
        },
        // ——— Присоединение компаний ———
        {
            q: "Где управлять списком компаний?",
            a: "Откройте вкладку «Профиль» внизу экрана, затем пункт «Мои компании». Там отображаются все добавленные компании (аккаунты). Чтобы добавить новую — нажмите «Добавить компанию» и выберите способ: по ИНН или по логину и паролю. Из этого же списка можно переключать активную компанию или удалить аккаунт, если он больше не нужен.",
            img: "/faq-account.svg",
            alt: "Мои компании"
        },
        {
            q: "Как добавить компанию по ИНН? (пошагово)",
            a: "Добавление по ИНН доступно только если вы вошли по email и паролю (зарегистрированный пользователь). Шаги: 1) Профиль → Мои компании → Добавить компанию. 2) Выберите «По ИНН». 3) Введите ИНН организации (10 или 12 цифр). 4) Нажмите отправить запрос — мы отправим письмо на контакты этой организации. 5) Ответственный в организации должен подтвердить доступ: в письме будет пин-код из 6 цифр. 6) Введите этот пин-код в приложении в поле «Введите пин-код из письма». 7) После успешной проверки компания появится в «Мои компании». Если организация не ответила или пин-код не пришёл — свяжитесь с ней отдельно или используйте способ «По логину и паролю», если у вас есть доступ в 1С.",
            img: "/faq-account.svg",
            alt: "Добавление по ИНН"
        },
        {
            q: "Как добавить компанию по логину и паролю?",
            a: "Подходит, если у вас есть логин и пароль от системы 1С (или личного кабинета) для нужной организации. Шаги: 1) Профиль → Мои компании → Добавить компанию. 2) Выберите «По логину и паролю». 3) Введите логин и пароль от 1С/ЛК. 4) Нажмите войти. После проверки приложение подтянет список заказчиков (компаний), привязанных к этому логину. Они появятся в «Мои компании», и вы сможете переключаться между ними в шапке экрана. Можно добавить несколько таких аккаунтов, если у вас доступ к разным организациям.",
            img: "/faq-account.svg",
            alt: "Добавление по логину и паролю"
        },
        {
            q: "Сколько компаний можно добавить?",
            a: "Ограничений по количеству компаний в списке нет. Вы можете добавить несколько организаций по ИНН (после подтверждения каждой) и несколько аккаунтов по логину и паролю. В шапке экрана в переключателе компаний выбирается одна или несколько активных — от этого зависят грузы и документы, которые вы видите.",
            img: "/faq-account.svg",
            alt: "Несколько компаний"
        },
        {
            q: "Как сменить активную компанию или выбрать несколько?",
            a: "В верхней части экрана «Грузы» или «Документы» отображается переключатель компаний (название текущей компании или «Выберите компанию»). Нажмите на него — откроется список всех ваших компаний. Выберите одну или отметьте несколько галочками — данные на экране обновятся под выбранный набор. Сотрудники, привязанные к одной компании, переключателя не видят: у них всегда отображается только их компания.",
            img: "/faq-account.svg",
            alt: "Переключение компаний"
        },
        {
            q: "Как удалить компанию из списка?",
            a: "Профиль → Мои компании. В списке найдите нужный аккаунт (компанию) и нажмите кнопку удаления (корзина) или «Удалить аккаунт». После подтверждения компания исчезнет из списка, грузы и документы по ней в приложении больше отображаться не будут. Данные в 1С и у HAULZ при этом не удаляются — при необходимости компанию можно добавить снова.",
            img: "/faq-account.svg",
            alt: "Удаление компании"
        },
        // ——— Сотрудники ———
        {
            q: "Кто может приглашать сотрудников?",
            a: "Приглашать сотрудников могут только пользователи, которые вошли по email и паролю (зарегистрированные в HAULZ). Если вы вошли «по логину и паролю» от 1С без отдельной регистрации email — раздел «Сотрудники» будет недоступен. Зарегистрируйте аккаунт по email в HAULZ (через админку или по приглашению), войдите им — тогда в Профиле появится пункт «Сотрудники» и форма приглашения.",
            img: "/faq-account.svg",
            alt: "Кто может приглашать"
        },
        {
            q: "Как пригласить сотрудника? (пошагово)",
            a: "1) Войдите по email и паролю. 2) Профиль → Сотрудники. 3) В блоке «Пригласить сотрудника» введите email будущего сотрудника (на него придёт пароль). 4) Выберите роль в выпадающем списке (Логист, Менеджер и т.д. — список ролей настраивается в админке). Если ролей нет — нажмите «Обновить» или попросите администратора создать пресеты в разделе «Пресеты ролей». 5) Нажмите «Пригласить». 6) На почту сотрудника отправится письмо с паролем для входа. 7) Сотрудник входит в приложение по этому email и паролю и видит только вашу компанию (без переключателя компаний). При необходимости вы можете отключить доступ переключателем «Вкл/Выкл» или удалить сотрудника из списка.",
            img: "/faq-account.svg",
            alt: "Приглашение сотрудника"
        },
        {
            q: "Что видит приглашённый сотрудник?",
            a: "Приглашённый сотрудник входит по email и паролю из письма. Ему доступна одна компания — та, к которой привязан пригласивший (ваш аккаунт). В шапке экрана отображается название этой компании, переключателя компаний нет. Сотрудник видит грузы и документы только по этой компании, в соответствии с выданной ролью (права на разделы и действия задаются пресетом). Дашборд, счета, УПД, поддержка — по тем же правилам, что и у вас, но в рамках одной организации.",
            img: "/faq-account.svg",
            alt: "Права сотрудника"
        },
        {
            q: "Что такое «роль» при приглашении сотрудника?",
            a: "Роль — это набор прав (пресет): какие разделы доступны (грузы, документы, дашборд, поддержка и т.д.) и есть ли, например, служебный режим или доступ в админку. Список ролей (пресетов) настраивается в админ-панели HAULZ в разделе «Пресеты ролей». При приглашении вы выбираете одну из этих ролей — сотрудник получает соответствующие права. Чтобы изменить права уже приглашённого — это делается в админке (редактирование пользователя) или путём отключения и повторного приглашения с другой ролью, если так предусмотрено у вас.",
            img: "/faq-account.svg",
            alt: "Роли сотрудников"
        },
        {
            q: "Как отключить или снова включить доступ сотрудника?",
            a: "Профиль → Сотрудники. В списке приглашённых найдите нужного человека. Рядом с ним переключатель «Вкл» / «Выкл». При выключении сотрудник не сможет войти в приложение (логин и пароль перестанут действовать). Его запись и привязка к компании сохраняются — вы можете снова включить доступ тем же переключателем, не приглашая заново.",
            img: "/faq-account.svg",
            alt: "Отключение доступа"
        },
        {
            q: "Как удалить сотрудника из списка?",
            a: "Профиль → Сотрудники → найдите сотрудника в списке и нажмите кнопку с иконкой корзины. Подтвердите удаление. Сотрудник будет полностью удалён из системы: он не сможет войти, запись в базе и привязки удалятся. Восстановить такого пользователя можно только новым приглашением.",
            img: "/faq-account.svg",
            alt: "Удаление сотрудника"
        },
        {
            q: "Сотрудник забыл пароль — что делать?",
            a: "Сотрудник может восстановить пароль сам: на экране входа в приложении нажать «Забыли пароль?» и указать свой email (тот, на который пришло приглашение). На почту придёт ссылка для смены пароля. После смены войти с новым паролем. Альтернатива — вы можете отключить его доступ и пригласить заново (ему придёт новый пароль), но тогда старый пароль перестанет действовать.",
            img: "/faq-account.svg",
            alt: "Пароль сотрудника"
        },
        // ——— Грузы ———
        {
            q: "Почему не вижу часть грузов или список пустой?",
            a: "Проверьте по порядку: 1) Выбранная компания в шапке — грузы показываются только по тем компаниям, которые выбраны. 2) Период дат — фильтр «Дата» может ограничивать диапазон; расширьте период или выберите «Все». 3) Остальные фильтры: Статус, Отправитель, Получатель — сбросьте на «Все» при необходимости. 4) Роли (Заказчик / Отправитель / Получатель) в Профиле → Роли — если отключена роль «Заказчик», части грузов может не быть. 5) Убедитесь, что перевозка действительно относится к выбранному заказчику в 1С. Если всё проверено и груза по-прежнему нет — напишите в поддержку с номером груза и периодом.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск грузов"
        },
        {
            q: "Как найти груз по номеру?",
            a: "На экране «Грузы» вверху есть строка поиска (иконка лупы). Введите номер перевозки полностью или часть номера — список отфильтруется автоматически. Поиск идёт по номерам грузов в выбранном периоде и по выбранным компаниям.",
            img: "/faq-troubleshoot.svg",
            alt: "Поиск по номеру"
        },
        {
            q: "Как настроить фильтры по датам, статусу, отправителю и получателю?",
            a: "На экране «Грузы» над списком расположены кнопки фильтров: Дата, Статус, Отправитель, Получатель и др. Нажмите нужный фильтр — откроется список значений. Выберите период дат, статус (например, «В пути») или конкретного отправителя/получателя. Данные на экране обновятся. Чтобы сбросить: снова откройте фильтр и выберите «Все» или другой период. Выбранные значения обычно отображаются на кнопке (например, «Дата: 09.02 – 15.02»).",
            img: "/faq-troubleshoot.svg",
            alt: "Фильтры грузов"
        },
        {
            q: "Что такое «служебный режим» и когда он доступен?",
            a: "Служебный режим — это возможность запрашивать перевозки без привязки к одной компании (по сути, по всем заказчикам). Он нужен логистам, которые работают с несколькими организациями. Включается переключателем «Служ.» в шапке экрана «Грузы». Доступен только если у вашего аккаунта есть соответствующее право (настраивается в админке в пресете роли). В служебном режиме фильтр по компании не применяется, отображаются перевозки по выбранному периоду и другим фильтрам.",
            img: "/faq-troubleshoot.svg",
            alt: "Служебный режим"
        },
        // ——— Документы ———
        {
            q: "Где взять счёт, УПД, АПП или ЭР по перевозке?",
            a: "Два способа. 1) Карточка груза: откройте нужную перевозку из списка «Грузы», нажмите кнопку «Поделиться» — в меню появятся пункты для скачивания или отправки документов (счёт, УПД и т.д.). 2) Раздел «Документы»: выберите тип документа (Счета, УПД и т.п.), при необходимости отфильтруйте по дате или номеру, найдите перевозку и откройте или скачайте документ. Если нужного документа нет в списке — напишите в поддержку, укажите номер груза и тип документа.",
            img: "/faq-docs.svg",
            alt: "Документы по перевозке"
        },
        {
            q: "Документ по ссылке не открывается",
            a: "Проверьте подключение к интернету и попробуйте открыть ссылку ещё раз. Часть документов открывается в браузере или в Telegram, если вы перешли из мессенджера. Если ссылка не работает — откройте раздел «Поддержка», напишите в чат и укажите номер груза и какой документ нужен (счёт, УПД и т.д.); оператор подскажет или пришлёт документ альтернативным способом.",
            img: "/faq-docs.svg",
            alt: "Открытие документов"
        },
        // ——— Роли и отображение грузов ———
        {
            q: "Как настроить роли «Заказчик», «Отправитель», «Получатель»?",
            a: "В «Профиле» откройте раздел «Роли». Там три переключателя: Заказчик, Отправитель, Получатель. Они определяют, в качестве кого вы хотите видеть перевозки. «Заказчик» — полные данные, включая стоимость и финансовую информацию. «Отправитель» и «Получатель» — перевозки, где вы указаны отправителем или получателем, без финансовых деталей. Включите нужные роли — список грузов обновится. Если какую-то роль отключить, соответствующие перевозки из списка исчезнут.",
            img: "/faq-troubleshoot.svg",
            alt: "Роли заказчик отправитель получатель"
        },
        // ——— Прочее ———
        {
            q: "Ошибка сети, пустой экран или приложение «висит»",
            a: "Проверьте подключение к интернету (Wi‑Fi или мобильная сеть). Закройте приложение полностью и откройте снова. Если ошибка повторяется — откройте раздел «Поддержка» и опишите, что произошло: в какое время, на каком экране (Грузы, Документы, Профиль и т.д.) и какое сообщение об ошибке видели. Это поможет быстрее найти причину.",
            img: "/faq-troubleshoot.svg",
            alt: "Ошибки и сеть"
        },
        {
            q: "Где контакты и информация о HAULZ?",
            a: "В «Профиле» откройте раздел «О компании». Там указаны контакты, адреса и краткая информация о компании HAULZ.",
            img: "/faq-account.svg",
            alt: "Информация о компании"
        },
    ];
    
    // Информация
    const infoItems = [
        { 
            id: 'about', 
            label: 'О компании', 
            icon: <Info className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('about')
        },
        { 
            id: 'faq', 
            label: 'FAQ', 
            icon: <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => setCurrentView('faq')
        },
        { 
            id: 'offer', 
            label: 'Публичная оферта', 
            icon: <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenOffer()
        },
        { 
            id: 'consent', 
            label: 'Согласие на обработку персональных данных', 
            icon: <Shield className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />,
            onClick: () => onOpenPersonalConsent()
        },
    ];
    
    if (currentView === 'companies') {
        return <CompaniesListPage 
            accounts={accounts}
            activeAccountId={activeAccountId}
            onSwitchAccount={onSwitchAccount}
            onRemoveAccount={onRemoveAccount}
            onUpdateAccount={onUpdateAccount}
            onBack={() => setCurrentView('main')}
            onAddCompany={() => setCurrentView('addCompanyMethod')}
        />;
    }

    if (currentView === 'roles') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Роли</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Включите роли, если хотите видеть перевозки, где вы выступаете в качестве заказчика, отправителя или получателя.
                </Typography.Body>
                {!activeAccountId || !activeAccount ? (
                    <Panel className="cargo-card" style={{ padding: '1rem', textAlign: 'center' }}>
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Сначала добавьте аккаунт в «Мои компании».</Typography.Body>
                    </Panel>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Заказчик</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleCustomer ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleCustomer: !(activeAccount.roleCustomer ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве заказчика (полные данные, включая стоимость).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Отправитель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleSender ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleSender: !(activeAccount.roleSender ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве отправителя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                        <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                            <Flex align="center" justify="space-between" style={{ marginBottom: '0.25rem' }}>
                                <Typography.Body style={{ fontWeight: 600 }}>Получатель</Typography.Body>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={activeAccount.roleReceiver ?? true}
                                        onToggle={() => onUpdateAccount(activeAccountId, { roleReceiver: !(activeAccount.roleReceiver ?? true) })}
                                    />
                                </span>
                            </Flex>
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                Включите, если хотите видеть перевозки, где вы выступаете в качестве получателя (без финансовой информации).
                            </Typography.Body>
                        </Panel>
                    </div>
                )}
            </div>
        );
    }

    if (currentView === 'haulz') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>HAULZ</Typography.Headline>
                </Flex>
                <Flex align="center" gap="0.6rem" wrap="wrap">
                    {activeAccount?.permissions?.supervisor === true && activeAccount?.permissions?.haulz === true ? (
                        <Button type="button" className="button-primary" onClick={() => setCurrentView('departmentTimesheet')}>
                            Табель учета рабочего времени
                        </Button>
                    ) : (
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>
                            Раздел табеля доступен только руководителю подразделения HAULZ.
                        </Typography.Body>
                    )}
                </Flex>
            </div>
        );
    }

    if (currentView === 'departmentTimesheet') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('haulz')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Табель учета рабочего времени</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Отображаются только сотрудники вашего подразделения HAULZ.
                </Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                    <Flex align="center" justify="space-between" wrap="wrap" gap="0.75rem">
                        <Typography.Body style={{ fontWeight: 600 }}>
                            Подразделение: {departmentTimesheetAllDepartments ? "Все подразделения" : (departmentTimesheetDepartment || "—")}
                        </Typography.Body>
                        <Flex align="center" gap="0.5rem">
                            <input
                                type="month"
                                value={departmentTimesheetMonth}
                                onChange={(e) => setDepartmentTimesheetMonth(e.target.value)}
                                style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '0.4rem 0.6rem', background: 'var(--color-bg)' }}
                            />
                            <Button type="button" className="filter-button" onClick={() => void fetchDepartmentTimesheet()}>
                                Обновить
                            </Button>
                        </Flex>
                    </Flex>
                    <Input
                        type="text"
                        className="admin-form-input"
                        value={departmentTimesheetSearch}
                        onChange={(e) => setDepartmentTimesheetSearch(e.target.value)}
                        placeholder="Поиск по сотруднику: ФИО, должность, логин"
                        style={{ width: "100%", marginTop: "0.55rem", minHeight: "2.4rem", boxSizing: "border-box" }}
                    />
                    {!departmentTimesheetIsEditableMonth ? (
                        <Typography.Body style={{ marginTop: '0.55rem', fontSize: '0.78rem', color: '#b45309' }}>
                            Редактирование доступно только для текущего и предыдущего месяца.
                        </Typography.Body>
                    ) : null}
                </Panel>
                <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить существующего сотрудника из подразделения</Typography.Body>
                    <Flex align="center" gap="0.5rem" wrap="wrap">
                        <select
                            value={departmentTimesheetSelectedEmployeeId}
                            onChange={(e) => { setDepartmentTimesheetSelectedEmployeeId(e.target.value); setDepartmentTimesheetError(null); }}
                            style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '18rem' }}
                            aria-label="Сотрудник подразделения"
                        >
                            <option value="">Выберите сотрудника</option>
                            {departmentTimesheetAvailableEmployees.map((emp) => (
                                <option key={`existing-dep-emp-${emp.id}`} value={String(emp.id)}>
                                    {(emp.fullName || emp.login) + (emp.position ? ` — ${emp.position}` : "")}
                                </option>
                            ))}
                        </select>
                        <Button
                            type="button"
                            className="filter-button"
                            disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving || !departmentTimesheetAvailableEmployees.length}
                            onClick={() => void addExistingDepartmentTimesheetEmployee()}
                            style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Добавить выбранного
                        </Button>
                        {!departmentTimesheetAvailableEmployees.length ? (
                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
                                Нет скрытых сотрудников для этого месяца.
                            </Typography.Body>
                        ) : null}
                    </Flex>
                </Panel>
                <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
                    <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Добавить сотрудника в табель</Typography.Body>
                    <Typography.Body style={{ marginBottom: '0.75rem', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        Новый сотрудник будет добавлен в ваше подразделение как сотрудник.
                    </Typography.Body>
                    <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="nowrap" align="center" style={{ overflowX: 'auto', paddingBottom: '0.1rem' }}>
                        <Input
                            type="text"
                            placeholder="ФИО"
                            value={departmentTimesheetEmployeeFullName}
                            onChange={(e) => { setDepartmentTimesheetEmployeeFullName(e.target.value); setDepartmentTimesheetError(null); }}
                            style={{ width: '14rem', minWidth: '12rem', height: '2.4rem', boxSizing: 'border-box' }}
                            className="admin-form-input"
                        />
                        <Input
                            type="text"
                            placeholder="Должность"
                            value={departmentTimesheetEmployeePosition}
                            onChange={(e) => { setDepartmentTimesheetEmployeePosition(e.target.value); setDepartmentTimesheetError(null); }}
                            style={{ width: '12rem', minWidth: '10rem', height: '2.4rem', boxSizing: 'border-box' }}
                            className="admin-form-input"
                        />
                        <select
                            value={departmentTimesheetEmployeeAccrualType}
                            onChange={(e) => setDepartmentTimesheetEmployeeAccrualType(normalizeDepartmentAccrualType(e.target.value))}
                            style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '9rem' }}
                            aria-label="Тип начисления"
                        >
                            <option value="hour">Почасовая</option>
                            <option value="shift">Сменная</option>
                            <option value="month">Месячная (21 раб. дн.)</option>
                        </select>
                        <select
                            value={departmentTimesheetEmployeeCooperationType}
                            onChange={(e) => setDepartmentTimesheetEmployeeCooperationType(
                                e.target.value === "self_employed" || e.target.value === "ip" ? e.target.value : "staff"
                            )}
                            style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.4rem', boxSizing: 'border-box', minWidth: '11rem' }}
                            aria-label="Тип занятости"
                        >
                            {COOPERATION_TYPE_OPTIONS.map((opt) => (
                                <option key={`cooperation-type-${opt.value}`} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <Input
                            type="number"
                            placeholder="Ставка"
                            min={0}
                            step={0.01}
                            value={departmentTimesheetEmployeeAccrualRate}
                            onChange={(e) => { setDepartmentTimesheetEmployeeAccrualRate(e.target.value); setDepartmentTimesheetError(null); }}
                            style={{ width: '5.2rem', minWidth: '4.6rem', height: '2.4rem', boxSizing: 'border-box' }}
                            className="admin-form-input"
                        />
                        <Button
                            type="button"
                            className="filter-button"
                            disabled={!departmentTimesheetIsEditableMonth || departmentTimesheetEmployeeSaving}
                            onClick={() => void addDepartmentTimesheetEmployee()}
                            style={{ height: '2.4rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                        >
                            {departmentTimesheetEmployeeSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            Добавить
                        </Button>
                    </Flex>
                    <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.4rem' }}>
                        За {departmentTimesheetEmployeeAccrualType === "month" ? "месяц" : (departmentTimesheetEmployeeAccrualType === 'shift' ? 'смену' : 'час')}: {Number(departmentTimesheetEmployeeAccrualRate || 0).toLocaleString('ru-RU')} ₽ ·
                        За месяц ({WORK_DAYS_IN_MONTH} раб. дн.): {Math.round(departmentTimesheetMonthlyEstimate).toLocaleString('ru-RU')} ₽
                    </Typography.Body>
                </Panel>
                {departmentTimesheetLoading ? (
                    <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                ) : departmentTimesheetError ? (
                    <Typography.Body style={{ color: 'var(--color-error)' }}>{departmentTimesheetError}</Typography.Body>
                ) : departmentTimesheetEmployees.length === 0 ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>В вашем подразделении пока нет сотрудников.</Typography.Body>
                    </Panel>
                ) : filteredDepartmentTimesheetEmployees.length === 0 ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>По вашему фильтру сотрудники не найдены.</Typography.Body>
                    </Panel>
                ) : (
                    <>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${340 + departmentTimesheetDays.length * 44 + SHIFT_MARK_CODES.length * 52}px` }}>
                            <thead>
                                <tr>
                                    <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 40, background: 'var(--color-bg-card, #fff)', textAlign: 'left', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', minWidth: '220px', boxShadow: '2px 0 0 var(--color-border)' }}>Сотрудник</th>
                                    {departmentTimesheetDays.map((day) => {
                                        const dayMeta = departmentTimesheetWeekdayByDay[day];
                                        const isWeekend = !!dayMeta?.isWeekend;
                                        return (
                                            <th key={day} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.3rem 0.2rem', minWidth: '44px', background: isWeekend ? 'var(--color-bg-hover)' : 'var(--color-bg-card, #fff)' }}>
                                                <div style={{ fontSize: '0.76rem', color: isWeekend ? '#d93025' : 'inherit', fontWeight: isWeekend ? 600 : 500 }}>{day}</div>
                                                <div style={{ fontSize: '0.68rem', color: isWeekend ? '#d93025' : 'var(--color-text-secondary)' }}>{dayMeta?.short || ''}</div>
                                            </th>
                                        );
                                    })}
                                    <th style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.4rem', minWidth: '120px', background: 'var(--color-bg-card, #fff)' }}>Итого</th>
                                    {SHIFT_MARK_CODES.map((code) => (
                                        <th key={`legend-col-${code}`} style={{ position: 'sticky', top: 0, zIndex: 20, textAlign: 'center', borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.25rem', minWidth: '52px', background: 'var(--color-bg-card, #fff)' }}>
                                            {code}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredDepartmentTimesheetEmployees.map((emp) => {
                                    const accrualType = normalizeDepartmentAccrualType(emp.accrualType);
                                    const isShift = accrualType === "shift";
                                    const isMarkAccrualType = accrualType === "shift" || accrualType === "month";
                                    const rate = Number(emp.accrualRate ?? 0);
                                    const totalShiftCount = departmentTimesheetDays.reduce((acc, day) => {
                                        const key = `${emp.id}:${day}`;
                                        return acc + (normalizeShiftMark(departmentTimesheetHours[key] || '') === 'Я' ? 1 : 0);
                                    }, 0);
                                    const totalHours = isMarkAccrualType
                                        ? totalShiftCount * 8
                                        : departmentTimesheetDays.reduce((acc, day) => {
                                            const key = `${emp.id}:${day}`;
                                            const value = (departmentTimesheetHours[key] || '').trim().replace(',', '.');
                                            const num = Number(value);
                                            return acc + (Number.isFinite(num) ? num : 0);
                                        }, 0);
                                    const totalMoney = isMarkAccrualType
                                        ? departmentTimesheetDays.reduce((acc, day) => {
                                            const key = `${emp.id}:${day}`;
                                            if (normalizeShiftMark(departmentTimesheetHours[key] || '') !== 'Я') return acc;
                                            const override = Number(departmentTimesheetShiftRateOverrides[key]);
                                            const dayRate = isShift
                                                ? (Number.isFinite(override) ? override : rate)
                                                : getDayRateByAccrualType(rate, accrualType);
                                            return acc + dayRate;
                                        }, 0)
                                        : totalHours * rate;
                                    const totalPaid = Number(departmentTimesheetPayoutsByEmployee[String(emp.id)] || 0);
                                    const totalOutstanding = Math.max(0, Number((totalMoney - totalPaid).toFixed(2)));
                                    const totalPrimaryText = isMarkAccrualType
                                        ? `${totalShiftCount} ${departmentTimesheetMobilePicker ? 'смены' : 'смен'}`
                                        : `${Number(totalHours.toFixed(2))} ${departmentTimesheetMobilePicker ? 'часы' : 'ч'}`;
                                    const legendCounts = SHIFT_MARK_CODES.reduce<Record<string, number>>((acc, code) => {
                                        acc[code] = 0;
                                        return acc;
                                    }, {});
                                    for (const day of departmentTimesheetDays) {
                                        const key = `${emp.id}:${day}`;
                                        const mark = normalizeShiftMark(departmentTimesheetHours[key] || '');
                                        if (mark) legendCounts[mark] = (legendCounts[mark] || 0) + 1;
                                    }

                                    return (
                                    <tr key={emp.id}>
                                        <td style={{ position: 'sticky', left: 0, zIndex: 30, minWidth: '220px', background: 'var(--color-bg-card, #fff)', borderBottom: '1px solid var(--color-border)', padding: '0.5rem', boxShadow: '2px 0 0 var(--color-border)' }}>
                                            <Flex align="center" justify="space-between" gap="0.35rem" style={{ alignItems: 'flex-start' }}>
                                                <div>
                                                    <Typography.Body style={{ display: 'block', fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: '0.1rem' }}>
                                                        {cooperationTypeLabel(emp.cooperationType)}
                                                    </Typography.Body>
                                                    <Typography.Body style={{ display: 'block', fontSize: '0.74rem', color: 'var(--color-text-secondary)' }}>
                                                        {accrualType === "month" ? "Месяц" : (isShift ? 'Смена' : 'Часы')}
                                                    </Typography.Body>
                                                </div>
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    disabled={!departmentTimesheetIsEditableMonth}
                                                    style={{ padding: '0.25rem' }}
                                                    aria-label="Удалить сотрудника из выбранного месяца"
                                                    title="Удалить из выбранного месяца"
                                                    onClick={() => void removeDepartmentEmployeeFromMonth(emp.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </td>
                                        {departmentTimesheetDays.map((day) => {
                                            const key = `${emp.id}:${day}`;
                                            const value = departmentTimesheetHours[key] || '';
                                            const isShift = accrualType === "shift";
                                            const isMarkAccrual = accrualType === "shift" || accrualType === "month";
                                            const shiftMark = normalizeShiftMark(value);
                                            const shiftMarkStyle = getShiftMarkStyle(shiftMark);
                                            const hourlyMark = isMarkAccrual ? shiftMark : getHourlyCellMark(value);
                                            const hourlyMarkStyle = getShiftMarkStyle(hourlyMark);
                                            const hourValue = parseHourValue(value);
                                            const hourInputValue = hourValue > 0 ? String(hourValue) : '';
                                            const hourPickerValue = toHalfHourValue(hourInputValue || '0');
                                            const hourlyHoursEnabled = isMarkAccrual ? false : hourlyMark === 'Я';
                                            const isPaidDate = departmentTimesheetPaidDayMarks[key] === true;
                                            const baseShiftRate = Number(emp.accrualRate || 0);
                                            const overrideShiftRate = Number(departmentTimesheetShiftRateOverrides[key]);
                                            const hasOverrideShiftRate = Number.isFinite(overrideShiftRate);
                                            const effectiveShiftRate = hasOverrideShiftRate ? overrideShiftRate : baseShiftRate;
                                            const shiftRateHint = isShift
                                                ? (hasOverrideShiftRate
                                                    ? `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽ · Ручная: ${overrideShiftRate.toLocaleString('ru-RU')} ₽`
                                                    : `База: ${baseShiftRate.toLocaleString('ru-RU')} ₽`)
                                                : `База за день: ${(baseShiftRate / WORK_DAYS_IN_MONTH).toLocaleString('ru-RU')} ₽`;
                                            return (
                                                <td key={key} style={{ borderBottom: '1px solid var(--color-border)', padding: isPaidDate ? '0.2rem 0.2rem 0.72rem 0.2rem' : '0.2rem' }}>
                                                    {isMarkAccrual ? (
                                                        <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTriggeredRef.current) {
                                                                        departmentShiftHoldTriggeredRef.current = false;
                                                                        return;
                                                                    }
                                                                    const nextValue = shiftMark === 'Я' ? '' : 'Я';
                                                                    setDepartmentTimesheetHours((prev) => ({
                                                                        ...prev,
                                                                        [key]: nextValue,
                                                                    }));
                                                                    if (isShift && nextValue !== 'Я') {
                                                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                            const next = { ...prev };
                                                                            delete next[key];
                                                                            return next;
                                                                        });
                                                                        void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                    }
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const { clientX, clientY } = e;
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift });
                                                                    }, 450);
                                                                }}
                                                                onMouseUp={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onMouseLeave={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onTouchStart={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const touch = e.touches[0];
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift });
                                                                    }, 450);
                                                                }}
                                                                onTouchEnd={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                style={{
                                                                    width: '2.2rem',
                                                                    height: '1.6rem',
                                                                    minWidth: '2.2rem',
                                                                    boxSizing: 'border-box',
                                                                    border: shiftMarkStyle.border,
                                                                    borderRadius: 999,
                                                                    background: shiftMarkStyle.background,
                                                                    color: shiftMarkStyle.color,
                                                                    padding: 0,
                                                                    lineHeight: '1.6rem',
                                                                    textAlign: 'center',
                                                                    fontWeight: 600,
                                                                    fontSize: shiftMark ? '0.82rem' : '1rem',
                                                                    WebkitAppearance: 'none',
                                                                    appearance: 'none',
                                                                    display: 'block',
                                                                    margin: '0 auto',
                                                                    position: 'relative',
                                                                    overflow: 'visible',
                                                                    cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                    opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                                }}
                                                                aria-label={shiftMark ? `Статус ${shiftMark}. Нажмите для Я/○, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                                title={isPaidDate ? `Этот день уже оплачен. ${shiftRateHint}` : (shiftMark ? `Статус: ${shiftMark}. ${shiftRateHint}` : `Нажмите для Я, удерживайте для выбора. ${shiftRateHint}`)}
                                                            >
                                                                {shiftMark || '○'}
                                                                {isPaidDate ? (
                                                                    <span
                                                                        style={{
                                                                            position: 'absolute',
                                                                            left: '50%',
                                                                            bottom: '-0.68rem',
                                                                            transform: 'translateX(-50%)',
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: 700,
                                                                            lineHeight: 1,
                                                                            padding: '0.07rem 0.22rem',
                                                                            borderRadius: 999,
                                                                            border: '1px solid #15803d',
                                                                            color: '#15803d',
                                                                            background: '#dcfce7',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        опл
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                            {isShift && shiftMark === 'Я' ? (
                                                                <input
                                                                    type="number"
                                                                    min={0}
                                                                    step={1}
                                                                    value={
                                                                        Number.isFinite(departmentTimesheetShiftRateOverrides[key])
                                                                            ? String(departmentTimesheetShiftRateOverrides[key])
                                                                            : ''
                                                                    }
                                                                    placeholder={String(Number(emp.accrualRate || 0))}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate || !departmentTimesheetIsEditableMonth) return;
                                                                        const nextRaw = e.target.value;
                                                                        if (nextRaw.trim() === '') {
                                                                            setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                                                const next = { ...prev };
                                                                                delete next[key];
                                                                                return next;
                                                                            });
                                                                            void saveDepartmentTimesheetShiftRate(emp.id, day, '');
                                                                            return;
                                                                        }
                                                                        const parsed = Number(nextRaw);
                                                                        if (!Number.isFinite(parsed) || parsed < 0) return;
                                                                        setDepartmentTimesheetShiftRateOverrides((prev) => ({
                                                                            ...prev,
                                                                            [key]: Number(parsed.toFixed(2)),
                                                                        }));
                                                                        void saveDepartmentTimesheetShiftRate(emp.id, day, String(parsed));
                                                                    }}
                                                                    style={{
                                                                        width: '3.4rem',
                                                                        minWidth: '3.4rem',
                                                                        boxSizing: 'border-box',
                                                                        border: '1px solid var(--color-border)',
                                                                        borderRadius: 6,
                                                                        background: 'var(--color-bg)',
                                                                        padding: '0.08rem 0.2rem',
                                                                        textAlign: 'center',
                                                                        fontSize: '0.68rem',
                                                                        lineHeight: 1.1,
                                                                    }}
                                                                    aria-label="Ручная стоимость смены"
                                                                    title={`Стоимость смены (переопределение). ${shiftRateHint}. Факт: ${effectiveShiftRate.toLocaleString('ru-RU')} ₽`}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'grid', justifyItems: 'center', rowGap: '0.12rem' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTriggeredRef.current) {
                                                                        departmentShiftHoldTriggeredRef.current = false;
                                                                        return;
                                                                    }
                                                                    const nextMark = hourlyMark === 'Я' ? 'В' : 'Я';
                                                                    const nextValue = nextMark === 'Я' ? (hourInputValue || 'Я') : 'В';
                                                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                    void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const { clientX, clientY } = e;
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: clientX, y: clientY, isShift: false });
                                                                    }, 450);
                                                                }}
                                                                onMouseUp={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onMouseLeave={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                onTouchStart={(e) => {
                                                                    if (isPaidDate) return;
                                                                    if (!departmentTimesheetIsEditableMonth) return;
                                                                    if (departmentShiftHoldTimerRef.current) window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                    departmentShiftHoldTriggeredRef.current = false;
                                                                    const touch = e.touches[0];
                                                                    departmentShiftHoldTimerRef.current = window.setTimeout(() => {
                                                                        departmentShiftHoldTriggeredRef.current = true;
                                                                        setDepartmentShiftPicker({ key, employeeId: emp.id, day, x: touch.clientX, y: touch.clientY, isShift: false });
                                                                    }, 450);
                                                                }}
                                                                onTouchEnd={() => {
                                                                    if (departmentShiftHoldTimerRef.current) {
                                                                        window.clearTimeout(departmentShiftHoldTimerRef.current);
                                                                        departmentShiftHoldTimerRef.current = null;
                                                                    }
                                                                }}
                                                                style={{
                                                                    width: '2.2rem',
                                                                    height: '1.6rem',
                                                                    minWidth: '2.2rem',
                                                                    boxSizing: 'border-box',
                                                                    border: hourlyMarkStyle.border,
                                                                    borderRadius: 999,
                                                                    background: hourlyMarkStyle.background,
                                                                    color: hourlyMarkStyle.color,
                                                                    padding: 0,
                                                                    lineHeight: '1.6rem',
                                                                    textAlign: 'center',
                                                                    fontWeight: 600,
                                                                    fontSize: hourlyMark ? '0.82rem' : '1rem',
                                                                    WebkitAppearance: 'none',
                                                                    appearance: 'none',
                                                                    display: 'block',
                                                                    margin: '0 auto',
                                                                    position: 'relative',
                                                                    overflow: 'visible',
                                                                    cursor: departmentTimesheetIsEditableMonth && !isPaidDate ? 'pointer' : 'default',
                                                                    opacity: departmentTimesheetIsEditableMonth && !isPaidDate ? 1 : 0.85,
                                                                }}
                                                                aria-label={hourlyMark ? `Статус ${hourlyMark}. Нажмите для Я/В, удерживайте для выбора` : 'Нажмите для Я, удерживайте для выбора статуса'}
                                                                title={isPaidDate ? 'Этот день уже оплачен' : (hourlyMark ? `Статус: ${hourlyMark}` : 'Сначала отметьте статус')}
                                                            >
                                                                {hourlyMark || 'В'}
                                                                {isPaidDate ? (
                                                                    <span
                                                                        style={{
                                                                            position: 'absolute',
                                                                            left: '50%',
                                                                            bottom: '-0.68rem',
                                                                            transform: 'translateX(-50%)',
                                                                            fontSize: '0.58rem',
                                                                            fontWeight: 700,
                                                                            lineHeight: 1,
                                                                            padding: '0.07rem 0.22rem',
                                                                            borderRadius: 999,
                                                                            border: '1px solid #15803d',
                                                                            color: '#15803d',
                                                                            background: '#dcfce7',
                                                                            whiteSpace: 'nowrap',
                                                                        }}
                                                                    >
                                                                        опл
                                                                    </span>
                                                                ) : null}
                                                            </button>
                                                            {departmentTimesheetMobilePicker ? (
                                                                <select
                                                                    value={hourPickerValue}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate) return;
                                                                        if (!departmentTimesheetIsEditableMonth) return;
                                                                        if (!hourlyHoursEnabled) return;
                                                                        const nextValue = e.target.value;
                                                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                        void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                    }}
                                                                    style={{ width: '4.3rem', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0 0.2rem', textAlign: 'center', display: 'block', margin: '0 auto' }}
                                                                    aria-label="Количество часов за день"
                                                                >
                                                                    {departmentTimesheetHalfHourOptions.map((opt) => (
                                                                        <option key={`${key}-opt-${opt.value}`} value={opt.value}>{opt.label}</option>
                                                                    ))}
                                                                </select>
                                                            ) : (
                                                                <input
                                                                    value={hourInputValue}
                                                                    disabled={!departmentTimesheetIsEditableMonth || isPaidDate || !hourlyHoursEnabled}
                                                                    onChange={(e) => {
                                                                        if (isPaidDate) return;
                                                                        if (!departmentTimesheetIsEditableMonth) return;
                                                                        if (!hourlyHoursEnabled) return;
                                                                        const nextRaw = e.target.value;
                                                                        const next = nextRaw.replace(/[^0-9.,]/g, '').replace(',', '.');
                                                                        const nextValue = next.trim() === '' ? 'Я' : next;
                                                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [key]: nextValue }));
                                                                        void saveDepartmentTimesheetCell(emp.id, day, nextValue);
                                                                    }}
                                                                    placeholder="0"
                                                                    style={{ width: '100%', minWidth: 36, boxSizing: 'border-box', border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-bg)', padding: '0.2rem 0.25rem', textAlign: 'center' }}
                                                                />
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td style={{ borderBottom: '1px solid var(--color-border)', padding: '0.35rem 0.4rem', textAlign: 'center' }}>
                                            <Typography.Body style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', lineHeight: 1.2 }}>
                                                {totalPrimaryText}
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.15rem', fontSize: '0.76rem', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
                                                {Number(totalMoney.toFixed(2))} ₽
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.12rem', fontSize: '0.72rem', color: '#065f46', lineHeight: 1.2 }}>
                                                Выплачено: {Number(totalPaid.toFixed(2)).toLocaleString('ru-RU')} ₽
                                            </Typography.Body>
                                            <Typography.Body style={{ display: 'block', marginTop: '0.08rem', fontSize: '0.72rem', color: '#15803d', lineHeight: 1.2 }}>
                                                Остаток: {Number(totalOutstanding.toFixed(2)).toLocaleString('ru-RU')} ₽
                                            </Typography.Body>
                                        </td>
                                        {SHIFT_MARK_CODES.map((code) => (
                                            <td key={`${emp.id}-legend-${code}`} style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'center', padding: '0.35rem 0.2rem' }}>
                                                <Typography.Body style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                                                    {legendCounts[code] || 0}
                                                </Typography.Body>
                                            </td>
                                        ))}
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <Flex align="center" gap="0.5rem" wrap="wrap" style={{ marginTop: '0.65rem' }}>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Я - Явка</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ПР - прогул</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>Б - Болезнь</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>В - Выходной</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОГ - Отгул</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>ОТ - отпуск</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>УВ - Уволен</Typography.Body>
                    </Flex>
                    {(departmentTimesheetAllDepartments
                        ? departmentTimesheetDepartmentSummaries
                        : [{
                            departmentName: departmentTimesheetDepartment || "—",
                            ...departmentTimesheetSummary,
                        }]
                    ).map((summary, idx) => (
                        <Panel key={`department-summary-${summary.departmentName}`} className="cargo-card" style={{ marginTop: idx === 0 ? '0.7rem' : '0.45rem', padding: '0.7rem' }}>
                            <Typography.Body style={{ fontWeight: 600 }}>
                                Итого по подразделению: {summary.departmentName} · {summary.totalShifts} смен · {summary.totalHours} ч
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                                {summary.totalMoney.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                                Выплачено: {summary.totalPaid.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                                Остаток: {summary.totalOutstanding.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                        </Panel>
                    ))}
                    {activeAccount?.permissions?.analytics === true ? (
                        <Panel className="cargo-card" style={{ marginTop: '0.45rem', padding: '0.7rem' }}>
                            <Typography.Body style={{ fontWeight: 600 }}>
                                Итого по компании: {companyTimesheetSummary.totalShifts} смен · {companyTimesheetSummary.totalHours} ч
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.12rem', color: 'var(--color-text-secondary)' }}>
                                {companyTimesheetSummary.totalMoney.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#065f46', fontSize: '0.84rem' }}>
                                Выплачено: {companyTimesheetSummary.totalPaid.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                            <Typography.Body style={{ marginTop: '0.08rem', color: '#15803d', fontSize: '0.84rem' }}>
                                Остаток: {companyTimesheetSummary.totalOutstanding.toLocaleString('ru-RU')} ₽
                            </Typography.Body>
                        </Panel>
                    ) : null}
                    </>
                )}
                {departmentShiftPicker ? (
                    <div
                        style={{ position: 'fixed', inset: 0, zIndex: 10000 }}
                        onClick={() => setDepartmentShiftPicker(null)}
                    >
                        <div
                            style={{
                                position: 'fixed',
                                top: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.y + 8, window.innerHeight - 220) : departmentShiftPicker.y + 8,
                                left: typeof window !== 'undefined' ? Math.min(departmentShiftPicker.x - 80, window.innerWidth - 190) : departmentShiftPicker.x - 80,
                                width: 180,
                                background: 'var(--color-bg-card, #fff)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 10,
                                padding: '0.4rem',
                                boxShadow: '0 10px 24px rgba(0,0,0,0.15)',
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {SHIFT_MARK_OPTIONS.map((opt) => (
                                <button
                                    key={`dept-shift-mark-${opt.code}`}
                                    type="button"
                                    onClick={() => {
                                        const currentValue = departmentTimesheetHours[departmentShiftPicker.key] || '';
                                        const currentHours = parseHourValue(currentValue);
                                        const nextValue = opt.code === 'Я' && !departmentShiftPicker.isShift
                                            ? (currentHours > 0 ? String(currentHours) : 'Я')
                                            : opt.code;
                                        setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: nextValue }));
                                        if (departmentShiftPicker.isShift && nextValue !== 'Я') {
                                            setDepartmentTimesheetShiftRateOverrides((prev) => {
                                                const next = { ...prev };
                                                delete next[departmentShiftPicker.key];
                                                return next;
                                            });
                                            void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                        }
                                        void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, nextValue);
                                        setDepartmentShiftPicker(null);
                                    }}
                                    style={{
                                        width: '100%',
                                        marginBottom: '0.25rem',
                                        padding: '0.35rem 0.5rem',
                                        borderRadius: 8,
                                        border: `1px solid ${opt.border}`,
                                        background: opt.bg,
                                        color: opt.color,
                                        textAlign: 'left',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {opt.code} - {opt.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => {
                                    setDepartmentTimesheetHours((prev) => ({ ...prev, [departmentShiftPicker.key]: '' }));
                                    if (departmentShiftPicker.isShift) {
                                        setDepartmentTimesheetShiftRateOverrides((prev) => {
                                            const next = { ...prev };
                                            delete next[departmentShiftPicker.key];
                                            return next;
                                        });
                                        void saveDepartmentTimesheetShiftRate(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                    }
                                    void saveDepartmentTimesheetCell(departmentShiftPicker.employeeId, departmentShiftPicker.day, '');
                                    setDepartmentShiftPicker(null);
                                }}
                                style={{
                                    width: '100%',
                                    padding: '0.3rem 0.5rem',
                                    borderRadius: 8,
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg)',
                                    color: 'var(--color-text-secondary)',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                ○ - очистить
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    if (currentView === 'employees') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Справочник сотрудников</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.9rem' }}>
                    Регистрируйте сотрудников с указанием ФИО, структурного подразделения и роли. Пароль для входа отправляется на email.
                </Typography.Body>
                {!activeAccount?.isRegisteredUser ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Доступно только зарегистрированным пользователям (вход по email и паролю).</Typography.Body>
                    </Panel>
                ) : !activeAccount?.login || !activeAccount?.password ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нужны логин и пароль текущего аккаунта для управления сотрудниками.</Typography.Body>
                    </Panel>
                ) : activeAccount.permissions?.supervisor !== true ? (
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Раздел «Сотрудники» доступен только при включённом праве «Руководитель» в админке.</Typography.Body>
                    </Panel>
                ) : activeAccount.inCustomerDirectory === false ? (
                    <>
                        <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Приглашать сотрудников могут только пользователи, чья компания есть в справочнике заказчиков.</Typography.Body>
                        </Panel>
                        <div style={{ marginTop: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Справочник сотрудников</Typography.Body>
                            {employeesLoading ? (
                                <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                            ) : employeesError ? (
                                <Typography.Body style={{ color: 'var(--color-error)' }}>{employeesError}</Typography.Body>
                            ) : employeesList.length === 0 ? (
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Пока никого не приглашали.</Typography.Body>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {employeesList.map((emp) => (
                                    <Panel key={emp.id} className="cargo-card" style={{ padding: '0.75rem' }}>
                                        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                                            <div>
                                                <Typography.Body style={{ fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                    {employeeRoleLabel(emp.employeeRole)} · {emp.department || '—'} · {emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
                                                </Typography.Body>
                                            </div>
                                            <Flex align="center" gap="0.5rem" wrap="wrap">
                                                <select
                                                    className="admin-form-input invite-role-select"
                                                    value={rolePresets.find((p) => p.label === emp.presetLabel)?.id ?? rolePresets[0]?.id ?? ''}
                                                    disabled={rolePresets.length === 0 || employeePresetLoadingId === emp.id}
                                                    onChange={async (e) => {
                                                        const presetId = e.target.value;
                                                        if (!presetId || !activeAccount?.login || !activeAccount?.password) return;
                                                        setEmployeePresetLoadingId(emp.id);
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, presetId }),
                                                            });
                                                            const data = await res.json().catch(() => ({}));
                                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                                            const newLabel = rolePresets.find((p) => p.id === presetId)?.label ?? emp.presetLabel;
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, presetLabel: newLabel } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить роль');
                                                        } finally {
                                                            setEmployeePresetLoadingId(null);
                                                        }
                                                    }}
                                                    style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.85rem', minWidth: '8rem' }}
                                                    aria-label="Роль (пресет)"
                                                    title="Изменить роль"
                                                >
                                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                                <Typography.Body style={{ fontSize: '0.85rem' }}>{emp.active ? 'Вкл' : 'Выкл'}</Typography.Body>
                                                <TapSwitch
                                                    checked={emp.active}
                                                    onToggle={async () => {
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, active: !emp.active }),
                                                            });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Не удалось изменить доступ');
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, active: !e.active } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить доступ');
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    style={{ padding: '0.35rem' }}
                                                    aria-label="Удалить сотрудника"
                                                    onClick={() => setEmployeeDeleteId(emp.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </Flex>
                                    </Panel>
                                ))}
                                {employeeDeleteId != null && (() => {
                                    const emp = employeesList.find((e) => e.id === employeeDeleteId);
                                    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
                                    return (
                                        <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="employee-delete-title" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>
                                            <div className="modal-content" style={{ maxWidth: '22rem', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
                                                <Typography.Body id="employee-delete-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Удалить сотрудника?</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                                    {(emp?.fullName || emp?.login || '')} будет удалён из списка и не сможет войти в приложение.
                                                </Typography.Body>
                                                <Flex gap="0.5rem" wrap="wrap">
                                                    <Button
                                                        type="button"
                                                        disabled={employeeDeleteLoading}
                                                        style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
                                                        onClick={async () => {
                                                            if (!activeAccount?.login || !activeAccount?.password || employeeDeleteLoading) return;
                                                            setEmployeeDeleteLoading(true);
                                                            try {
                                                                const res = await fetch(`${origin}/api/my-employees?id=${encodeURIComponent(employeeDeleteId)}`, {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
                                                                });
                                                                if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error);
                                                                setEmployeesList((prev) => prev.filter((e) => e.id !== employeeDeleteId));
                                                                setEmployeeDeleteId(null);
                                                            } finally {
                                                                setEmployeeDeleteLoading(false);
                                                            }
                                                        }}
                                                    >
                                                        {employeeDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Удалить'}
                                                    </Button>
                                                    <Button type="button" className="filter-button" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>Отмена</Button>
                                                </Flex>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Регистрация сотрудника</Typography.Body>
                            <Flex className="form-row-same-height invite-form-row" gap="0.5rem" wrap="wrap" align="center" style={{ marginBottom: '0.5rem' }}>
                                <input
                                    type="text"
                                    placeholder="Email сотрудника"
                                    value={inviteEmail}
                                    onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); setInviteSuccess(null); }}
                                    style={{ width: '12rem', minWidth: '10rem', height: '2.5rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                    autoComplete="off"
                                />
                                <Input
                                    type="text"
                                    placeholder="ФИО"
                                    value={inviteFullName}
                                    onChange={(e) => { setInviteFullName(e.target.value); setInviteError(null); setInviteSuccess(null); }}
                                    style={{ width: '14rem', minWidth: '12rem', height: '2.5rem', boxSizing: 'border-box' }}
                                    className="admin-form-input"
                                />
                                <select
                                    className="admin-form-input invite-role-select"
                                    value={inviteDepartment}
                                    onChange={(e) => { setInviteDepartment(e.target.value); setInviteError(null); }}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '12rem' }}
                                    aria-label="Структурное подразделение"
                                >
                                    <option value="">Структурное подразделение</option>
                                    {DEPARTMENT_OPTIONS.map((dep) => <option key={dep} value={dep}>{dep}</option>)}
                                </select>
                                <select
                                    className="admin-form-input invite-role-select"
                                    value={inviteEmployeeRole}
                                    onChange={(e) => setInviteEmployeeRole(e.target.value as 'employee' | 'department_head')}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '12rem' }}
                                    aria-label="Роль сотрудника"
                                >
                                    <option value="employee">Сотрудник</option>
                                    <option value="department_head">Руководитель подразделения</option>
                                </select>
                                <select
                                    className="admin-form-input invite-role-select"
                                    value={invitePresetId}
                                    onChange={(e) => { setInvitePresetId(e.target.value); setInviteError(null); }}
                                    style={{ padding: '0 0.6rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.9rem', height: '2.5rem', boxSizing: 'border-box', minWidth: '10rem' }}
                                    aria-label="Выберите роль"
                                    title={rolePresets.length === 0 ? 'Роли загружаются или не настроены' : undefined}
                                >
                                    <option value="">{rolePresets.length === 0 ? 'Нет ролей' : 'Выберите роль'}</option>
                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                                <Button type="button" className="filter-button" onClick={() => void fetchEmployeesAndPresets()} disabled={employeesLoading} title="Обновить список ролей и сотрудников" style={{ height: '2.5rem', padding: '0 1rem', boxSizing: 'border-box' }}>
                                    Обновить
                                </Button>
                                <Button
                                    type="button"
                                    className="button-primary"
                                    style={{ height: '2.5rem', padding: '0 1rem', boxSizing: 'border-box' }}
                                    disabled={inviteLoading || !inviteEmail.trim() || !inviteFullName.trim() || !inviteDepartment || !invitePresetId}
                                    onClick={async () => {
                                        setInviteError(null); setInviteSuccess(null); setInviteLoading(true);
                                        try {
                                            const res = await fetch('/api/my-employees', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({
                                                    login: activeAccount.login,
                                                    password: activeAccount.password,
                                                    email: inviteEmail.trim(),
                                                    fullName: inviteFullName.trim(),
                                                    department: inviteDepartment,
                                                    employeeRole: inviteEmployeeRole,
                                                    presetId: invitePresetId
                                                }),
                                            });
                                            const data = await res.json().catch(() => ({}));
                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                            setInviteSuccess(data.message || 'Готово');
                                            setInviteEmail(''); setInviteFullName(''); setInviteDepartment(''); setInviteEmployeeRole('employee'); setInvitePresetId('');
                                            fetchEmployeesAndPresets();
                                        } catch (e) {
                                            setInviteError((e as Error)?.message || 'Ошибка приглашения');
                                        } finally {
                                            setInviteLoading(false);
                                        }
                                    }}
                                >
                                    {inviteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Пригласить'}
                                </Button>
                            </Flex>
                            {rolePresets.length === 0 && (
                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>
                                    Роли не загружены. Создайте пресеты в админ-панели (раздел «Пресеты ролей») или нажмите «Обновить».
                                </Typography.Body>
                            )}
                            {inviteError && <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{inviteError}</Typography.Body>}
                            {inviteSuccess && <Typography.Body style={{ color: 'var(--color-success-status)', fontSize: '0.85rem' }}>{inviteSuccess}</Typography.Body>}
                        </Panel>
                        <div style={{ marginTop: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, marginBottom: '0.5rem', display: 'block' }}>Справочник сотрудников</Typography.Body>
                            {employeesLoading ? (
                                <Flex align="center" gap="0.5rem"><Loader2 className="w-4 h-4 animate-spin" /><Typography.Body>Загрузка...</Typography.Body></Flex>
                            ) : employeesError ? (
                                <Typography.Body style={{ color: 'var(--color-error)' }}>{employeesError}</Typography.Body>
                            ) : employeesList.length === 0 ? (
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Пока никого не приглашали.</Typography.Body>
                            ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {employeesList.map((emp) => (
                                    <Panel key={emp.id} className="cargo-card" style={{ padding: '0.75rem' }}>
                                        <Flex align="center" justify="space-between" wrap="wrap" gap="0.5rem">
                                            <div>
                                                <Typography.Body style={{ fontWeight: 600 }}>{emp.fullName || emp.login}</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                    {employeeRoleLabel(emp.employeeRole)} · {emp.department || '—'} · {emp.presetLabel} · {emp.active ? 'Доступ включён' : 'Отключён'}
                                                </Typography.Body>
                                            </div>
                                            <Flex align="center" gap="0.5rem" wrap="wrap">
                                                <select
                                                    className="admin-form-input invite-role-select"
                                                    value={rolePresets.find((p) => p.label === emp.presetLabel)?.id ?? rolePresets[0]?.id ?? ''}
                                                    disabled={rolePresets.length === 0 || employeePresetLoadingId === emp.id}
                                                    onChange={async (e) => {
                                                        const presetId = e.target.value;
                                                        if (!presetId || !activeAccount?.login || !activeAccount?.password) return;
                                                        setEmployeePresetLoadingId(emp.id);
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, presetId }),
                                                            });
                                                            const data = await res.json().catch(() => ({}));
                                                            if (!res.ok) throw new Error(data.error || 'Ошибка');
                                                            const newLabel = rolePresets.find((p) => p.id === presetId)?.label ?? emp.presetLabel;
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, presetLabel: newLabel } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить роль');
                                                        } finally {
                                                            setEmployeePresetLoadingId(null);
                                                        }
                                                    }}
                                                    style={{ padding: '0.35rem 0.5rem', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', fontSize: '0.85rem', minWidth: '8rem' }}
                                                    aria-label="Роль (пресет)"
                                                    title="Изменить роль"
                                                >
                                                    {rolePresets.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                                                </select>
                                                <Typography.Body style={{ fontSize: '0.85rem' }}>{emp.active ? 'Вкл' : 'Выкл'}</Typography.Body>
                                                <TapSwitch
                                                    checked={emp.active}
                                                    onToggle={async () => {
                                                        setEmployeesError(null);
                                                        try {
                                                            const res = await fetch(`/api/my-employees?id=${emp.id}`, {
                                                                method: 'PATCH',
                                                                headers: { 'Content-Type': 'application/json' },
                                                                body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, active: !emp.active }),
                                                            });
                                                            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Не удалось изменить доступ');
                                                            setEmployeesList((prev) => prev.map((e) => e.id === emp.id ? { ...e, active: !e.active } : e));
                                                        } catch (e) {
                                                            setEmployeesError((e as Error)?.message || 'Не удалось изменить доступ');
                                                        }
                                                    }}
                                                />
                                                <Button
                                                    type="button"
                                                    className="filter-button"
                                                    style={{ padding: '0.35rem' }}
                                                    aria-label="Удалить сотрудника"
                                                    onClick={() => setEmployeeDeleteId(emp.id)}
                                                >
                                                    <Trash2 className="w-4 h-4" style={{ color: 'var(--color-error)' }} />
                                                </Button>
                                            </Flex>
                                        </Flex>
                                    </Panel>
                                    ))}
                                {employeeDeleteId != null && (() => {
                                    const emp = employeesList.find((e) => e.id === employeeDeleteId);
                                    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '';
                                    return (
                                        <div className="modal-overlay" style={{ zIndex: 10000 }} role="dialog" aria-modal="true" aria-labelledby="employee-delete-title" onClick={() => !employeeDeleteLoading && setEmployeeDeleteId(null)}>
                                            <div className="modal-content" style={{ maxWidth: '22rem', padding: '1.25rem' }} onClick={(e) => e.stopPropagation()}>
                                                <Typography.Body id="employee-delete-title" style={{ fontWeight: 600, marginBottom: '0.5rem' }}>Удалить сотрудника?</Typography.Body>
                                                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                                                    {(emp?.fullName || emp?.login || '')} будет удалён из списка и не сможет войти в приложение.
                                                </Typography.Body>
                                                <Flex gap="0.5rem" wrap="wrap">
                                                    <Button
                                                        type="button"
                                                        disabled={employeeDeleteLoading}
                                                        style={{ background: 'var(--color-error)', color: '#fff', border: 'none' }}
                                                        onClick={async () => {
                                                            if (!activeAccount?.login || !activeAccount?.password || employeeDeleteLoading) return;
                                                            setEmployeeDeleteLoading(true);
                                                            try {
                                                                const res = await fetch(`${origin}/api/my-employees?id=${encodeURIComponent(employeeDeleteId)}`, {
                                                                    method: 'DELETE',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password }),
                                                                });
                                                                const data = await res.json().catch(() => ({}));
                                                                if (!res.ok) throw new Error(data?.error || 'Ошибка удаления');
                                                                setEmployeesList((prev) => prev.filter((e) => e.id !== employeeDeleteId));
                                                                setEmployeeDeleteId(null);
                                                            } catch (e) {
                                                                setEmployeesError((e as Error)?.message ?? 'Ошибка удаления');
                                                            } finally {
                                                                setEmployeeDeleteLoading(false);
                                                            }
                                                        }}
                                                    >
                                                        {employeeDeleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                                        {employeeDeleteLoading ? ' Удаление…' : 'Удалить'}
                                                    </Button>
                                                    <Button type="button" className="filter-button" disabled={employeeDeleteLoading} onClick={() => setEmployeeDeleteId(null)}>
                                                        Отмена
                                                    </Button>
                                                </Flex>
                                            </div>
                                        </div>
                                    );
                                })()}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }
    
    if (currentView === 'addCompanyMethod') {
        return <CompaniesPage onBack={() => setCurrentView('companies')} onSelectMethod={(method) => {
            if (method === 'inn') {
                setCurrentView('addCompanyByINN');
            } else {
                setCurrentView('addCompanyByLogin');
            }
        }} />;
    }
    
    if (currentView === 'addCompanyByINN') {
        return <AddCompanyByINNPage 
            activeAccount={activeAccount}
            onBack={() => setCurrentView('addCompanyMethod')} 
            onSuccess={() => setCurrentView('companies')}
        />;
    }
    
    if (currentView === 'addCompanyByLogin') {
        return <AddCompanyByLoginPage 
            onBack={() => setCurrentView('addCompanyMethod')} 
            onAddAccount={onAddAccount}
            onSuccess={() => setCurrentView('companies')}
        />;
    }

    if (currentView === 'tinyurl-test') {
        return <TinyUrlTestPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'about') {
        return <AboutCompanyPage onBack={() => setCurrentView('main')} />;
    }

    if (currentView === 'voiceAssistants') {
        const serviceModeAllowed = !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;
        if (!serviceModeAllowed) {
            return (
                <div className="w-full">
                    <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                        <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                            <ArrowLeft className="w-4 h-4" />
                        </Button>
                        <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                    </Flex>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Доступно только при включённом служебном режиме.</Typography.Body>
                    </Panel>
                </div>
            );
        }
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Алиса</Typography.Body>
                <Panel
                    className="cargo-card"
                    style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                    <Typography.Body style={{ fontSize: '0.9rem' }}>
                        Скажите Алисе: «Запусти навык Холз» и назовите код ниже. После привязки Алиса подтвердит компанию. Голосом можно узнавать перевозки в пути, счета на оплату, краткий статус «что в работе», сводку за день или за период, статус по номеру перевозки; при ответе «подробнее» Алиса скажет «Написал в чат» и отправит таблицу в чат мини‑приложения (номер / дата / кол-во / плат вес / сумма). Номера перевозок произносятся по три цифры (135200 — «сто тридцать пять двести»). Если привязано несколько компаний — можно переключиться голосом или отвязать навык фразой «Отвяжи компанию».
                    </Typography.Body>
                    <Button
                        className="button-primary"
                        type="button"
                        disabled={!activeAccount?.login || !activeAccount?.password || aliceLoading}
                        onClick={async () => {
                            if (!activeAccount?.login || !activeAccount?.password) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                setAliceLoading(true);
                                const res = await fetch("/api/alice-link", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        login: activeAccount.login,
                                        password: activeAccount.password,
                                        customer: activeAccount.customer || null,
                                        inn: activeAccount.activeCustomerInn ?? undefined,
                                    }),
                                });
                                if (!res.ok) {
                                    const err = await res.json().catch(() => ({}));
                                    throw new Error(err?.error || "Не удалось получить код");
                                }
                                const data = await res.json();
                                setAliceCode(String(data?.code || ""));
                                setAliceExpiresAt(Date.now() + (Number(data?.ttl || 0) * 1000));
                            } catch (e: any) {
                                setAliceError(e?.message || "Не удалось получить код");
                            } finally {
                                setAliceLoading(false);
                            }
                        }}
                    >
                        {aliceLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код для Алисы"}
                    </Button>
                    {aliceCode && (
                        <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                            Код: {aliceCode}
                        </Typography.Body>
                    )}
                    {aliceExpiresAt && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                            Код действует до {new Date(aliceExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                        </Typography.Body>
                    )}
                    {aliceError && (
                        <Flex align="center" className="login-error">
                            <AlertTriangle className="w-4 h-4 mr-2" />
                            <Typography.Body style={{ fontSize: '0.85rem' }}>{aliceError}</Typography.Body>
                        </Flex>
                    )}
                    {aliceSuccess && (
                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success, #22c55e)' }}>
                            {aliceSuccess}
                        </Typography.Body>
                    )}
                    <Typography.Body style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        Чтобы отключить навык от аккаунта, нажмите кнопку ниже.
                    </Typography.Body>
                    <Button
                        className="filter-button"
                        type="button"
                        disabled={!activeAccount?.login}
                        onClick={async () => {
                            if (!activeAccount?.login) return;
                            try {
                                setAliceError(null);
                                setAliceSuccess(null);
                                const res = await fetch("/api/alice-unlink", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ login: activeAccount.login.trim().toLowerCase() }),
                                });
                                const data = await res.json().catch(() => ({}));
                                if (res.ok && data?.ok) {
                                    setAliceCode(null);
                                    setAliceExpiresAt(null);
                                    setAliceSuccess(data?.message || "Алиса отвязана от аккаунта.");
                                } else {
                                    setAliceError(data?.error || "Не удалось отвязать.");
                                }
                            } catch (e: any) {
                                setAliceError(e?.message || "Ошибка сети.");
                            }
                        }}
                        style={{ marginTop: '0.25rem' }}
                    >
                        Отвязать от Алисы
                    </Button>
                </Panel>

                <Typography.Body style={{ marginTop: '1.25rem', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Описание навыков</Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                        «Запусти навык Холз» → назовите код из приложения → Алиса подтвердит компанию. Ниже — фразы и сценарии.
                    </Typography.Body>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Перевозки и оплаты</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие перевозки в пути?» — кратко номера (по три цифры). «Подробнее» — Алиса скажет «Написал в чат» и отправит таблицу в чат (номер / дата / кол-во / плат вес / сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Какие счета на оплату?» — то же: кратко, по «подробнее» — таблица в чат.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Что в работе?» / «Что у меня в работе?» — одна фраза: в пути N перевозок, к оплате M.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сводка за день» / «Сводка за сегодня» / «Сводка на сегодня» — ответ принято, в пути, на доставке, доставлено, счета на оплату (кол-во и сумма).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Сколько перевозок за сегодня?» / «на этой неделе?» / «за неделю?» — число перевозок за период.</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Статус перевозки 135702» / «Перевозка 135702» / «Груз 135702» — детали по одной перевозке.</Typography.Body>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <Typography.Body style={{ fontSize: '0.8rem', fontWeight: 600 }}>Управление</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Работай от имени компании [название]» / «Переключись на компанию [название]» — переключить компанию (если привязано несколько).</Typography.Body>
                        <Typography.Body style={{ fontSize: '0.8rem' }}>• «Отвяжи компанию» / «Отвяжи заказчика» / «Отвяжи» — отвязать навык; новый код — в приложении.</Typography.Body>
                    </div>
                    <Typography.Body style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                        Другие вопросы (контакты, груз по номеру) Алиса передаёт в чат поддержки с контекстом вашей компании.
                    </Typography.Body>
                </Panel>
            </div>
        );
    }

    if (currentView === 'notifications') {
        return (
            <NotificationsPage
                activeAccount={activeAccount}
                activeAccountId={activeAccountId}
                onBack={() => setCurrentView('main')}
                onOpenDeveloper={() => {}}
                onOpenTelegramBot={onOpenTelegramBot}
                onOpenMaxBot={undefined}
                onUpdateAccount={onUpdateAccount}
            />
        );
    }

    if (currentView === 'faq') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '0.5rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>FAQ</Typography.Headline>
                </Flex>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                    Подробные ответы: вход и пароль, присоединение компаний (по ИНН и по логину/паролю), приглашение и управление сотрудниками, грузы, фильтры, документы и поддержка.
                </Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {faqItems.map((item, idx) => (
                        <Panel
                            key={`${item.q}-${idx}`}
                            className="cargo-card"
                            style={{
                                padding: '1rem',
                                display: 'flex',
                                gap: '0.75rem',
                                alignItems: 'flex-start'
                            }}
                        >
                            <img
                                src={item.img}
                                alt={item.alt}
                                style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }}
                                loading="lazy"
                            />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                                    {item.q}
                                </Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                    {item.a}
                                </Typography.Body>
                            </div>
                        </Panel>
                    ))}
                </div>
            </div>
        );
    }

    if (currentView === '2fa' && activeAccountId && activeAccount) {
        const googleSecretSet = !!activeAccount.twoFactorGoogleSecretSet;
        const showGoogleSetup = twoFactorEnabled && twoFactorMethod === 'google' && !googleSecretSet;
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}>
                        <ArrowLeft className="w-4 h-4" />
                    </Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Двухфакторная аутентификация (2FA)</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between">
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Google Authenticator</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'google'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'google') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('telegram');
                                        setGoogleSetupData(null);
                                        setGoogleSetupStep('idle');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('google');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {showGoogleSetup && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {googleSetupStep === 'idle' && !googleSetupData && (
                                    <>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Отсканируйте QR-код в приложении Google Authenticator или введите ключ вручную.
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            disabled={googleSetupLoading}
                                            onClick={async () => {
                                                if (!activeAccount?.login) return;
                                                setGoogleSetupError(null);
                                                setGoogleSetupLoading(true);
                                                try {
                                                    const res = await fetch('/api/2fa-google', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ login: activeAccount.login, action: 'setup' }),
                                                    });
                                                    const data = await res.json();
                                                    if (!res.ok) throw new Error(data?.error || 'Ошибка настройки');
                                                    setGoogleSetupData({ otpauthUrl: data.otpauthUrl, secret: data.secret });
                                                    setGoogleSetupStep('qr');
                                                } catch (e: any) {
                                                    setGoogleSetupError(e?.message || 'Не удалось начать настройку');
                                                } finally {
                                                    setGoogleSetupLoading(false);
                                                }
                                            }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            {googleSetupLoading ? 'Загрузка…' : 'Настроить Google Authenticator'}
                                        </Button>
                                    </>
                                )}
                                {(googleSetupStep === 'qr' || googleSetupData) && googleSetupData && googleSetupStep !== 'verify' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <img
                                                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(googleSetupData.otpauthUrl)}`}
                                                alt="QR для Google Authenticator"
                                                style={{ width: 200, height: 200 }}
                                            />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                            Ключ для ручного ввода: <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{googleSetupData.secret}</code>
                                        </Typography.Body>
                                        <Button
                                            className="filter-button"
                                            size="small"
                                            onClick={() => { setGoogleSetupStep('verify'); setGoogleVerifyCode(''); setGoogleSetupError(null); }}
                                            style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}
                                        >
                                            Добавил в приложение
                                        </Button>
                                    </>
                                )}
                                {googleSetupStep === 'verify' && googleSetupData && (
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!activeAccount?.login || !googleVerifyCode.trim()) return;
                                            setGoogleSetupError(null);
                                            setGoogleSetupLoading(true);
                                            try {
                                                const res = await fetch('/api/2fa-google', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, action: 'verify', code: googleVerifyCode.trim() }),
                                                });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data?.error || 'Неверный код');
                                                await fetch('/api/2fa', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ login: activeAccount.login, enabled: true, method: 'google', telegramLinked: false }),
                                                });
                                                onUpdateAccount(activeAccountId, { twoFactorEnabled: true, twoFactorMethod: 'google', twoFactorGoogleSecretSet: true });
                                                setGoogleSetupData(null);
                                                setGoogleSetupStep('idle');
                                                setGoogleVerifyCode('');
                                            } catch (err: any) {
                                                setGoogleSetupError(err?.message || 'Неверный код');
                                            } finally {
                                                setGoogleSetupLoading(false);
                                            }
                                        }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
                                    >
                                        <Typography.Body style={{ fontSize: '0.85rem' }}>Введите 6-значный код из приложения</Typography.Body>
                                        <input
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            maxLength={6}
                                            placeholder="000000"
                                            value={googleVerifyCode}
                                            onChange={(e) => setGoogleVerifyCode(e.target.value.replace(/\D/g, ''))}
                                            style={{ padding: '0.5rem', fontSize: '1rem', textAlign: 'center', letterSpacing: '0.25em' }}
                                        />
                                        <Button type="submit" className="button-primary" disabled={googleVerifyCode.length !== 6 || googleSetupLoading} style={{ alignSelf: 'flex-start' }}>
                                            {googleSetupLoading ? 'Проверка…' : 'Подтвердить'}
                                        </Button>
                                        {googleSetupError && (
                                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-error-status)' }}>{googleSetupError}</Typography.Body>
                                        )}
                                    </form>
                                )}
                            </div>
                        )}
                        {twoFactorEnabled && twoFactorMethod === 'google' && googleSecretSet && (
                            <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', marginTop: '0.5rem' }}>
                                Google Authenticator настроен
                            </Typography.Body>
                        )}
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: twoFactorMethod === 'telegram' && !twoFactorTelegramLinked && onOpenTelegramBot ? '0.5rem' : 0 }}>
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Telegram</Typography.Body>
                            <TapSwitch
                                checked={twoFactorEnabled && twoFactorMethod === 'telegram'}
                                onToggle={() => {
                                    if (twoFactorEnabled && twoFactorMethod === 'telegram') {
                                        setTwoFactorEnabled(false);
                                        setTwoFactorMethod('google');
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: false });
                                    } else {
                                        setTwoFactorMethod('telegram');
                                        setTwoFactorEnabled(true);
                                        onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: true });
                                    }
                                }}
                            />
                        </Flex>
                        {twoFactorEnabled && twoFactorMethod === 'telegram' && (
                            <>
                                {twoFactorTelegramLinked ? (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)' }}>
                                        Telegram привязан
                                    </Typography.Body>
                                ) : onOpenTelegramBot ? (
                                    <Button
                                        className="filter-button"
                                        size="small"
                                        disabled={tgLinkChecking}
                                        onClick={async () => {
                                            setTgLinkError(null);
                                            try {
                                                await onOpenTelegramBot();
                                                void pollTelegramLink();
                                            } catch (e: any) {
                                                setTgLinkError(e?.message || 'Не удалось открыть бота.');
                                            }
                                        }}
                                        style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}
                                    >
                                        {tgLinkChecking ? 'Проверка…' : 'Привязать Telegram'}
                                    </Button>
                                ) : (
                                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                        Откройте бота для привязки
                                    </Typography.Body>
                                )}
                            </>
                        )}
                    </Panel>
                </div>
            </div>
        );
    }
    
    return (
        <div className="w-full">
            {/* Настройки */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Настройки</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {settingsItems
                        .map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>

            {/* Безопасность */}
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Безопасность</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {/* 2FA — переход на отдельную страницу */}
                    {activeAccountId && activeAccount && (
                        <Panel
                            className="cargo-card"
                            onClick={() => setCurrentView('2fa')}
                            style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>
                                    <Shield className="w-5 h-5" />
                                </div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>Двухфакторная аутентификация (2FA)</Typography.Body>
                            </Flex>
                        </Panel>
                    )}
                    {/* Пароль — смена пароля для входа по email/паролю */}
                    {activeAccountId && activeAccount?.isRegisteredUser && (
                        <>
                            <Panel
                                className="cargo-card"
                                onClick={() => setShowPasswordForm((v) => !v)}
                                style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}
                            >
                                <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                    <div style={{ color: 'var(--color-primary)' }}>
                                        <Lock className="w-5 h-5" />
                                    </div>
                                    <Typography.Body style={{ fontSize: '0.9rem' }}>Пароль</Typography.Body>
                                </Flex>
                            </Panel>
                            {showPasswordForm && (
                                <Panel className="cargo-card" style={{ padding: '1rem' }} onClick={(e) => e.stopPropagation()}>
                                    <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>Смена пароля</Typography.Body>
                                    <form
                                        onSubmit={async (e) => {
                                            e.preventDefault();
                                            if (!activeAccount?.login || !passwordNew || passwordNew !== passwordConfirm) {
                                                setPasswordError(passwordNew !== passwordConfirm ? 'Пароли не совпадают' : 'Заполните все поля');
                                                return;
                                            }
                                            if (passwordNew.length < 8) {
                                                setPasswordError('Новый пароль не менее 8 символов');
                                                return;
                                            }
                                            setPasswordError(null);
                                            setPasswordLoading(true);
                                            try {
                                                const res = await fetch('/api/change-password', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({
                                                        login: activeAccount.login,
                                                        currentPassword: passwordCurrent,
                                                        newPassword: passwordNew,
                                                    }),
                                                });
                                                const data = await res.json().catch(() => ({}));
                                                if (!res.ok) throw new Error((data?.error as string) || 'Ошибка смены пароля');
                                                setPasswordSuccess(true);
                                                onUpdateAccount(activeAccountId, { password: passwordNew });
                                                setPasswordCurrent('');
                                                setPasswordNew('');
                                                setPasswordConfirm('');
                                                setTimeout(() => { setShowPasswordForm(false); setPasswordSuccess(false); }, 1500);
                                            } catch (err: unknown) {
                                                setPasswordError((err as Error)?.message || 'Ошибка смены пароля');
                                            } finally {
                                                setPasswordLoading(false);
                                            }
                                        }}
                                        style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                                    >
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Текущий пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Текущий пароль"
                                                value={passwordCurrent}
                                                onChange={(e) => setPasswordCurrent(e.target.value)}
                                                autoComplete="current-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Новый пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Не менее 8 символов"
                                                value={passwordNew}
                                                onChange={(e) => setPasswordNew(e.target.value)}
                                                autoComplete="new-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.85rem' }}>Подтвердите новый пароль</Typography.Body>
                                            <Input
                                                type="password"
                                                className="login-input"
                                                placeholder="Повторите новый пароль"
                                                value={passwordConfirm}
                                                onChange={(e) => setPasswordConfirm(e.target.value)}
                                                autoComplete="new-password"
                                                style={{ width: '100%' }}
                                            />
                                        </div>
                                        {passwordError && (
                                            <Typography.Body style={{ color: 'var(--color-error)', fontSize: '0.85rem' }}>{passwordError}</Typography.Body>
                                        )}
                                        {passwordSuccess && (
                                            <Typography.Body style={{ color: 'var(--color-success-status, #22c55e)', fontSize: '0.85rem' }}>Пароль успешно изменён.</Typography.Body>
                                        )}
                                        <Flex gap="0.5rem">
                                            <Button type="submit" className="button-primary" disabled={passwordLoading}>
                                                {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Сохранить'}
                                            </Button>
                                            <Button
                                                type="button"
                                                className="filter-button"
                                                onClick={() => { setShowPasswordForm(false); setPasswordError(null); setPasswordCurrent(''); setPasswordNew(''); setPasswordConfirm(''); }}
                                            >
                                                Отмена
                                            </Button>
                                        </Flex>
                                    </form>
                                </Panel>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Информация */}
            <div>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Информация</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {infoItems.map((item) => (
                        <Panel
                            key={item.id}
                            className="cargo-card"
                            onClick={item.onClick}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                padding: '1rem',
                                cursor: 'pointer'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}>
                                <div style={{ color: 'var(--color-primary)' }}>{item.icon}</div>
                                <Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body>
                            </Flex>
                        </Panel>
                    ))}
                </div>
            </div>
        </div>
    );
}

// --- SHARED COMPONENTS ---

/** Нормализация названия этапа из API для сопоставления */
const normalizeStageKey = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/** Маппинг этапов хронологии на отображаемые подписи (места подставляются из item) */
function mapTimelineStageLabel(raw: string, item: CargoItem): string {
    const key = normalizeStageKey(raw);
    const from = cityToCode(item.CitySender) || '—';
    const to = cityToCode(item.CityReceiver) || '—';
    if (/полученаинформация|получена\s*информация/.test(key)) return 'Получена информация';
    if (/полученаотзаказчика|получена\s*от\s*заказчика/.test(key)) return `Получена в ${from}`;
    if (/упакована/.test(key)) return 'Измерена';
    if (/консолидация/.test(key)) return 'Консолидация';
    if (/отправленаваэропорт|отправлена\s*в\s*аэропорт|загружена/.test(key)) return 'Загружена в ТС';
    if (/улетела/.test(key)) return 'Отправлена';
    if (/квручению|к\s*вручению/.test(key)) return `Прибыла в ${to}`;
    if (/поставленанадоставку|поставлена\s*на\s*доставку|в\s*месте\s*прибытия/.test(key)) return 'Запланирована доставка';
    if (/доставлена/.test(key)) return 'Доставлена';
    return raw;
}

function getTimelineStepColor(label: string): 'success' | 'warning' | 'danger' | 'purple' | 'default' {
    const lower = (label || '').toLowerCase();
    if (lower.includes('доставлен') || lower.includes('заверш')) return 'success';
    if (lower.includes('доставке')) return 'purple';
    if (lower.includes('пути') || lower.includes('отправлен') || lower.includes('готов')) return 'warning';
    if (lower.includes('отменен') || lower.includes('аннулирован')) return 'danger';
    return 'default';
}

/** Результат запроса Getperevozka: статусы и табличная часть номенклатуры */
type PerevozkaDetailsResult = {
    steps: PerevozkaTimelineStep[] | null;
    nomenclature: Record<string, unknown>[];
};

const STEPS_KEYS = ['items', 'Steps', 'stages', 'Statuses'];
const NOMENCLATURE_KEYS = ['Packages', 'Nomenclature', 'Goods', 'CargoNomenclature', 'ПринятыйГруз', 'Номенклатура', 'TablePart', 'CargoItems', 'Items', 'GoodsList', 'Nomenklatura'];

function extractNomenclatureFromPerevozka(data: any): Record<string, unknown>[] {
    const tryExtract = (obj: any): Record<string, unknown>[] => {
        if (!obj || typeof obj !== 'object') return [];
        for (const key of NOMENCLATURE_KEYS) {
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null) {
                return val as Record<string, unknown>[];
            }
        }
        for (const key of Object.keys(obj)) {
            if (STEPS_KEYS.includes(key)) continue;
            const val = obj[key];
            if (Array.isArray(val) && val.length > 0 && typeof val[0] === 'object' && val[0] !== null && !Array.isArray(val[0])) {
                return val as Record<string, unknown>[];
            }
        }
        return [];
    };
    const fromRoot = tryExtract(data);
    if (fromRoot.length > 0) return fromRoot;
    for (const nest of ['Response', 'Data', 'Result', 'result', 'data']) {
        const fromNest = tryExtract(data?.[nest]);
        if (fromNest.length > 0) return fromNest;
    }
    return [];
}

/** Загрузка статусов перевозки и номенклатуры принятого груза (один запрос Getperevozka) */
async function fetchPerevozkaDetails(auth: AuthData, number: string, item: CargoItem): Promise<PerevozkaDetailsResult> {
    const res = await fetch(PROXY_API_GETPEREVOZKA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            login: auth.login,
            password: auth.password,
            number,
            ...(auth.inn ? { inn: auth.inn } : {}),
            ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || err?.details || `Ошибка ${res.status}`);
    }
    const data = await res.json();
    const raw = Array.isArray(data) ? data : (data?.items ?? data?.Steps ?? data?.stages ?? data?.Statuses ?? []);
    const steps: PerevozkaTimelineStep[] = Array.isArray(raw)
        ? raw.map((el: any) => {
            const rawLabel = el?.Stage ?? el?.Name ?? el?.Status ?? el?.label ?? String(el);
            const labelStr = typeof rawLabel === 'string' ? rawLabel : String(rawLabel);
            const date = el?.Date ?? el?.date ?? el?.DatePrih ?? el?.DateVr;
            const displayLabel = mapTimelineStageLabel(labelStr, item);
            return { label: displayLabel, date, completed: true };
        })
        : [];
    const fromCity = cityToCode(item.CitySender) || '—';
    const toCity = cityToCode(item.CityReceiver) || '—';
    const senderLabel = `Получена в ${fromCity}`;
    const arrivedAtDestLabel = `Прибыла в ${toCity}`;
    const orderOf = (l: string, i: number): number => {
        if (l === 'Получена информация') return 1;
        if (l === senderLabel) return 2;
        if (l === 'Измерена') return 3;
        if (l === 'Консолидация') return 4;
        if (l === 'Загружена в ТС') return 5;
        if (l === 'Отправлена') return 6;
        if (l === arrivedAtDestLabel) return 7;
        if (l === 'Запланирована доставка') return 8;
        if (l === 'Доставлена') return 9;
        return 10 + i;
    };
    const sorted = steps.map((s, i) => ({ s, key: orderOf(s.label, i) }))
        .sort((a, b) => a.key - b.key)
        .map((x) => x.s);
    const nomenclature = extractNomenclatureFromPerevozka(data);
    return { steps: sorted.length ? sorted : null, nomenclature };
}

/** Загрузка только таймлайна (для дашборда — обратная совместимость) */
async function fetchPerevozkaTimeline(auth: AuthData, number: string, item: CargoItem): Promise<PerevozkaTimelineStep[] | null> {
    const { steps } = await fetchPerevozkaDetails(auth, number, item);
    return steps;
}

function CargoDetailsModal({
    item,
    isOpen,
    onClose,
    auth,
    onOpenChat,
    isFavorite,
    onToggleFavorite,
    showSums = true,
    useServiceRequest = false,
}: {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
    auth: AuthData;
    onOpenChat: (cargoNumber?: string) => void | Promise<void>;
    isFavorite: (cargoNumber: string | undefined) => boolean;
    onToggleFavorite: (cargoNumber: string | undefined) => void;
    showSums?: boolean;
    useServiceRequest?: boolean;
}) {
    const [downloading, setDownloading] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<string | null>(null);
    const [pdfViewer, setPdfViewer] = useState<{ url: string; name: string; docType: string; blob?: Blob; downloadFileName?: string } | null>(null);
    const [perevozkaTimeline, setPerevozkaTimeline] = useState<PerevozkaTimelineStep[] | null>(null);
    const [perevozkaNomenclature, setPerevozkaNomenclature] = useState<Record<string, unknown>[]>([]);
    const [nomenclatureOpen, setNomenclatureOpen] = useState(false);
    const [perevozkaLoading, setPerevozkaLoading] = useState(false);
    const [perevozkaError, setPerevozkaError] = useState<string | null>(null);

    // Загрузка статусов и номенклатуры перевозки при открытии карточки (один запрос Getperevozka)
    useEffect(() => {
        if (!isOpen || !item?.Number || !auth?.login || !auth?.password) {
            setPerevozkaTimeline(null);
            setPerevozkaNomenclature([]);
            setPerevozkaError(null);
            return;
        }
        let cancelled = false;
        setPerevozkaLoading(true);
        setPerevozkaError(null);
        fetchPerevozkaDetails(auth, item.Number, item)
            .then(({ steps, nomenclature }) => {
                if (!cancelled) {
                    setPerevozkaTimeline(steps);
                    setPerevozkaNomenclature(nomenclature || []);
                }
            })
            .catch((e: any) => { if (!cancelled) setPerevozkaError(e?.message || 'Не удалось загрузить статусы'); })
            .finally(() => { if (!cancelled) setPerevozkaLoading(false); });
        return () => { cancelled = true; };
    }, [isOpen, item?.Number, auth?.login, auth?.password]);

    // По умолчанию номенклатура свернута при каждом открытии карточки/смене перевозки.
    useEffect(() => {
        if (isOpen) setNomenclatureOpen(false);
    }, [isOpen, item?.Number]);

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

    // SLA и итого время в пути: от «получена в месте отправления» (Получена в [город отправления]) до текущего МСК / до «Доставлена»
    const fromCity = cityToCode(item.CitySender) || '—';
    const receivedAtSender = perevozkaTimeline?.find(s => s.label === `Получена в ${fromCity}`);
    const deliveredStep = perevozkaTimeline?.find(s => s.label === 'Доставлена');
    const slaPlanEndMs = receivedAtSender?.date
        ? new Date(receivedAtSender.date).getTime() + getPlanDays(item) * 24 * 60 * 60 * 1000
        : null;
    const isTimelineStepOutOfSla = (stepDate?: string) => {
        if (!slaPlanEndMs || !stepDate) return false;
        const stepMs = new Date(stepDate).getTime();
        if (!Number.isFinite(stepMs)) return false;
        return stepMs > slaPlanEndMs;
    };
    const slaFromTimeline = (receivedAtSender?.date && deliveredStep?.date)
        ? (() => {
            const startMs = new Date(receivedAtSender.date).getTime();
            const endMs = new Date(deliveredStep.date).getTime();
            const actualDays = Math.round((endMs - startMs) / (24 * 60 * 60 * 1000));
            const planDays = getPlanDays(item);
            return { planDays, actualDays, onTime: actualDays <= planDays, delayDays: Math.max(0, actualDays - planDays) };
        })()
        : null;

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
        const metod = DOCUMENT_METHODS[docType] ?? docType;
        setDownloading(docType); setDownloadError(null);
        try {
            const res = await fetch(PROXY_API_DOWNLOAD_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    login: auth.login,
                    password: auth.password,
                    metod,
                    number: item.Number,
                    ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
                }),
            });
            if (!res.ok) {
                // Человеческие сообщения вместо "Ошибка 404/500"
                let message =
                    res.status === 404
                        ? "Документ не обнаружен"
                        : res.status >= 500
                            ? "Ошибка сервера. Попробуйте позже"
                            : "Не удалось получить документ";
                try {
                    const errData = await res.json();
                    if (errData?.message && res.status !== 404 && res.status < 500) {
                        message = String(errData.message);
                    }
                } catch {
                    // ignore parsing errors
                }
                throw new Error(message);
            }

            const data = await res.json();

            if (!data?.data || !data.name) {
                throw new Error("Документ не обнаружен");
            }

            // Декодируем base64 в бинарный файл
            const byteCharacters = atob(data.data);
            const byteNumbers = new Array(byteCharacters.length).fill(0).map((_, i) => byteCharacters.charCodeAt(i));
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "application/pdf" });
            const fileName = data.name || `${docType}_${item.Number}.pdf`;
            const fileNameTranslit = transliterateFilename(fileName);

            // Сначала открываем встроенный просмотр (метод 4), затем запускаем скачивание.
            const url = URL.createObjectURL(blob);
            setPdfViewer({
                url,
                name: fileNameTranslit,
                docType,
                blob, // Сохраняем blob для скачивания
                downloadFileName: fileNameTranslit
            });
            setTimeout(() => {
                downloadFile(blob, fileNameTranslit);
            }, 350);
        } catch (e: any) { setDownloadError(e.message); } finally { setDownloading(null); }
    };


    // Список явно отображаемых полей (из API примера). INN скрыт — используется для БД и проверки дублей, не показываем в карточке.
    const EXCLUDED_KEYS = ['Number', 'DatePrih', 'DateVr', 'State', 'Mest', 'PW', 'W', 'Value', 'Sum', 'StateBill', 'Sender', 'Customer', 'Receiver', 'AK', 'DateDoc', 'OG', 'TypeOfTranzit', 'TypeOfTransit', 'INN', 'Inn', 'inn', 'SenderINN', 'ReceiverINN', '_role', 'Driver', 'AutoType', 'DateArrival'];
    const isCustomerRole = item._role === "Customer";
    const FIELD_LABELS: Record<string, string> = {
        CitySender: 'Место отправления',
        CityReceiver: 'Место получения',
        Order: 'Номер заявки заказчика',
        AutoReg: 'Транспортное средство',
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <Flex align="center" justify="space-between" style={{ width: '100%', minWidth: 0 }}>
                        <Flex align="center" gap="0.5rem" style={{ flexShrink: 1, minWidth: 0, maxWidth: '55%' }}>
                            {/* Иконка типа перевозки */}
                            {(() => {
                                const isFerry = item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1;
                                return isFerry ? <Ship className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Паром" /> : <Truck className="modal-header-transport-icon" style={{ color: 'var(--color-primary-blue)', width: 24, height: 24, flexShrink: 0 }} title="Авто" />;
                            })()}
                            {/* Бейдж роли: Заказчик / Отправитель / Получатель */}
                            {item._role && (
                                <span className="role-badge" style={{ fontSize: '0.7rem', fontWeight: 600, padding: '0.2rem 0.5rem', borderRadius: '999px', background: 'var(--color-panel-secondary)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item._role === 'Customer' ? 'Заказчик' : item._role === 'Sender' ? 'Отправитель' : 'Получатель'}
                                </span>
                            )}
                        </Flex>
                        <Flex align="center" gap="0.25rem" style={{ flexShrink: 0 }}>
                        <button
                            type="button"
                            className="modal-header-icon-btn"
                            onClick={async () => {
                                if (!item.Number) return;
                                setDownloading("share");
                                try {
                                    const lines: string[] = [];
                                    lines.push(`Перевозка: ${item.Number}`);
                                    if (item.State) lines.push(`Статус: ${normalizeStatus(item.State)}`);
                                    if (item.DatePrih) lines.push(`Приход: ${formatDate(item.DatePrih)}`);
                                    lines.push(`Доставка: ${getFilterKeyByStatus(item.State) === 'delivered' && item.DateVr ? formatDate(item.DateVr) : '-'}`);
                                    if (item.Sender) lines.push(`Отправитель: ${stripOoo(item.Sender)}`);
                                    if (item.Customer) lines.push(`Заказчик: ${stripOoo(item.Customer)}`);
                                    if (item.Receiver ?? item.receiver) lines.push(`Получатель: ${stripOoo(item.Receiver ?? item.receiver)}`);
                                    lines.push(`Тип перевозки: ${item?.AK === true || item?.AK === 'true' || item?.AK === '1' || item?.AK === 1 ? 'Паром' : 'Авто'}`);
                                    const fromCity = cityToCode(item.CitySender);
                                    const toCity = cityToCode(item.CityReceiver);
                                    lines.push(`Место отправления: ${fromCity || '-'}`);
                                    lines.push(`Место получения: ${toCity || '-'}`);
                                    if (item.Mest !== undefined) lines.push(`Мест: ${item.Mest}`);
                                    if (item._role === 'Customer') {
                                        if (item.PW !== undefined) lines.push(`Плат. вес: ${item.PW} кг`);
                                        if (item.Sum !== undefined) lines.push(`Стоимость: ${formatCurrency(item.Sum as any)}`);
                                        if (item.StateBill) lines.push(`Статус счета: ${item.StateBill}`);
                                    }
                                    const text = lines.join("\n");
                                    if (typeof navigator !== "undefined" && (navigator as any).share) {
                                        await (navigator as any).share({
                                            title: `HAULZ — перевозка ${item.Number}`,
                                            text,
                                        });
                                    } else if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                        await navigator.clipboard.writeText(text);
                                        alert("Информация скопирована в буфер обмена");
                                    } else {
                                        alert(text);
                                    }
                                } catch (e: any) {
                                    console.error("Share error:", e);
                                    alert("Ошибка при попытке поделиться");
                                } finally {
                                    setDownloading(null);
                                }
                            }}
                            title="Поделиться"
                        >
                            {downloading === "share" ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-text-secondary)' }} /> : <Share2 className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />}
                        </button>
                        <Button
                            style={{
                                padding: '0.25rem',
                                minWidth: 'auto',
                                background: 'transparent',
                                border: 'none',
                                boxShadow: 'none',
                                outline: 'none',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                            onClick={() => onToggleFavorite(item.Number)}
                            title={isFavorite(item.Number) ? "Удалить из избранного" : "Добавить в избранное"}
                        >
                            <Heart
                                className="w-4 h-4"
                                style={{
                                    fill: isFavorite(item.Number) ? '#ef4444' : 'transparent',
                                    color: isFavorite(item.Number) ? '#ef4444' : 'var(--color-text-secondary)',
                                    transition: 'all 0.2s',
                                }}
                            />
                        </Button>
                        <Button className="modal-close-button" onClick={onClose} aria-label="Закрыть" style={{ background: 'transparent', border: 'none', boxShadow: 'none', outline: 'none' }}><X size={20} style={{ color: 'var(--color-text-secondary)' }} /></Button>
                        </Flex>
                    </Flex>
                </div>
                {/* Явно отображаемые поля (из API примера) */}
                <div className="details-grid-modal">
                    <DetailItem label="Номер" value={item.Number || '—'} />
                    <DetailItem label="Статус" value={<StatusBadge status={item.State} />} />
                    <DetailItem label="Приход" value={<DateText value={item.DatePrih} />} />
                    <DetailItem label="Доставка" value={(() => {
                        // Показываем дату доставки только если груз доставлен
                        const status = normalizeStatus(item.State);
                        const lower = status.toLowerCase();
                        if (lower.includes('доставлен') || lower.includes('заверш')) {
                            return <DateText value={item.DateVr} />;
                        }
                        return '-';
                    })()} /> {/* Используем DateVr */}
                    <DetailItem label="Отправитель" value={stripOoo(item.Sender) || '-'} />
                    <DetailItem label="Получатель" value={stripOoo(item.Receiver ?? item.receiver) || '-'} />
                    <DetailItem label="Мест" value={renderValue(item.Mest)} icon={<Layers className="w-4 h-4 mr-1 text-theme-primary"/>} />
                    <DetailItem label="Плат. вес" value={renderValue(item.PW, 'кг')} icon={<Scale className="w-4 h-4 mr-1 text-theme-primary"/>} highlighted />
                    {isCustomerRole && (
                        <>
                            <DetailItem label="Вес" value={renderValue(item.W, 'кг')} icon={<Weight className="w-4 h-4 mr-1 text-theme-primary"/>} />
                            <DetailItem label="Объем" value={renderValue(item.Value, 'м³')} icon={<List className="w-4 h-4 mr-1 text-theme-primary"/>} />
                            {showSums && <DetailItem label="Стоимость" value={formatCurrency(item.Sum)} textColor={getSumColorByPaymentStatus(item.StateBill)} />}
                            {showSums && <DetailItem label="Статус Счета" value={<StatusBillBadge status={item.StateBill} />} highlighted />}
                        </>
                    )}
                </div>
                
                {/* ДОПОЛНИТЕЛЬНЫЕ поля из API - УДАЛЕН ЗАГОЛОВОК "Прочие данные из API" */}
                
                <div className="details-grid-modal">
                    {Object.entries(item)
                        .filter(([key]) => !EXCLUDED_KEYS.includes(key))
                        .sort(([a], [b]) => {
                            const pos = (k: string) => {
                                if (k === 'CitySender') return 1;
                                if (k === 'CityReceiver') return 2;
                                if (k === 'Order') return 999;
                                if (k === 'AutoReg') return 1000; // Транспортное средство всегда последним
                                return 0;
                            };
                            return pos(a) - pos(b);
                        })
                        .map(([key, val]) => {
                            // Пропускаем, если значение пустое
                            if (val === undefined || val === null || val === "" || (typeof val === 'string' && val.trim() === "") || (typeof val === 'object' && val !== null && Object.keys(val).length === 0)) return null; 
                            // Пропускаем, если значение - 0
                            if (val === 0 && key.toLowerCase().includes('date') === false) return null;
                            // AutoReg показываем только в служебном режиме
                            if (key === 'AutoReg' && !useServiceRequest) return null;
                            const isFerry =
                                item?.AK === true ||
                                item?.AK === "true" ||
                                item?.AK === "1" ||
                                item?.AK === 1;
                            const label = FIELD_LABELS[key] || key;
                            const value =
                                (key === 'TypeOfTranzit' || key === 'TypeOfTransit') && isFerry
                                    ? 'Паром'
                                    : (key === 'CitySender' || key === 'CityReceiver')
                                        ? (cityToCode(val) || renderValue(val))
                                        : renderValue(val);

                            return <DetailItem key={key} label={label} value={value} />;
                        })}
                </div>

                {/* Вертикальный таймлайн статусов перевозки */}
                {(perevozkaLoading || perevozkaTimeline || perevozkaError) && (
                    <div className="perevozka-timeline-wrap" style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <Typography.Headline style={{ marginBottom: '0.75rem', fontSize: '0.9rem', fontWeight: 600 }}>
                            Статусы перевозки
                        </Typography.Headline>
                        {perevozkaLoading && (
                            <Flex align="center" gap="0.5rem" style={{ padding: '0.5rem 0' }}>
                                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--color-primary-blue)' }} />
                                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Загрузка...</Typography.Body>
                            </Flex>
                        )}
                        {perevozkaError && (
                            <Typography.Body style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{perevozkaError}</Typography.Body>
                        )}
                        {!perevozkaLoading && perevozkaTimeline && perevozkaTimeline.length > 0 && (() => {
                            // Итого время в пути: от получения в городе отправления до доставки (если доставлена), иначе до текущего времени.
                            const totalHours = (() => {
                                if (!receivedAtSender?.date) return null;
                                const startMs = new Date(receivedAtSender.date).getTime();
                                if (!Number.isFinite(startMs)) return null;
                                const deliveredMs = deliveredStep?.date ? new Date(deliveredStep.date).getTime() : NaN;
                                const endMs = Number.isFinite(deliveredMs) ? deliveredMs : Date.now();
                                return Math.max(0, Math.round((endMs - startMs) / (1000 * 60 * 60)));
                            })();
                            return (
                            <div>
                                <div className="perevozka-timeline">
                                    <div
                                        className="perevozka-timeline-track-fill"
                                        style={{ height: `${(perevozkaTimeline.length / Math.max(perevozkaTimeline.length, 1)) * 100}%` }}
                                    />
                                    {perevozkaTimeline.map((step, index) => {
                                        const colorKey = getTimelineStepColor(step.label);
                                        const outOfSlaFromThisStep = isTimelineStepOutOfSla(step.date);
                                        return (
                                            <div key={index} className="perevozka-timeline-item">
                                                <div className={`perevozka-timeline-dot perevozka-timeline-dot-${colorKey}`} />
                                                <div className="perevozka-timeline-content" style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                                    <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem', color: outOfSlaFromThisStep ? '#ef4444' : undefined }}>{step.label}</Typography.Body>
                                                    {step.date && (
                                                        <Typography.Body style={{ fontSize: '0.8rem', color: outOfSlaFromThisStep ? '#ef4444' : 'var(--color-text-secondary)' }}>
                                                            <DateText value={step.date} />
                                                        </Typography.Body>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {totalHours != null && (
                                    <Flex align="center" gap="0.35rem" style={{ marginTop: '0.75rem' }}>
                                        <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                            Итого время в пути — {totalHours} ч
                                        </Typography.Body>
                                        <span
                                            role="button"
                                            tabIndex={0}
                                            onClick={(e) => { e.stopPropagation(); }}
                                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); }}
                                            title="Срок не учитывает день получения груза"
                                            style={{ display: 'inline-flex', cursor: 'help', color: 'var(--color-text-secondary)' }}
                                        >
                                            <Info className="w-4 h-4" />
                                        </span>
                                    </Flex>
                                )}
                            </div>
                            );
                        })()}
                    </div>
                )}

                {/* Табличная часть номенклатуры принятого груза */}
                {!perevozkaLoading && perevozkaNomenclature.length > 0 && (
                    <div style={{ marginTop: '1rem', marginBottom: '1rem' }}>
                        <div
                            role="button"
                            tabIndex={0}
                            onClick={() => setNomenclatureOpen((v) => !v)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setNomenclatureOpen((v) => !v);
                                }
                            }}
                            style={{ cursor: 'pointer', userSelect: 'none', marginBottom: nomenclatureOpen ? '0.75rem' : 0 }}
                            title={nomenclatureOpen ? 'Свернуть номенклатуру' : 'Показать номенклатуру'}
                        >
                            <Typography.Headline style={{ marginBottom: 0, fontSize: '0.9rem', fontWeight: 600 }}>
                                {nomenclatureOpen ? '▼' : '▶'} Номенклатура принятого груза
                            </Typography.Headline>
                        </div>
                        {nomenclatureOpen && (
                            <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ backgroundColor: 'var(--color-bg-hover)' }}>
                                            {Object.keys(perevozkaNomenclature[0]).map((col) => (
                                                <th
                                                    key={col}
                                                    style={{
                                                        padding: '0.5rem 0.75rem',
                                                        textAlign: 'left',
                                                        fontWeight: 600,
                                                        borderBottom: '1px solid var(--color-border)',
                                                    }}
                                                >
                                                    {col === 'Package' ? 'Штрихкод' : col === 'SKUs' ? 'Номенклатура' : col}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perevozkaNomenclature.map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: idx < perevozkaNomenclature.length - 1 ? '1px solid var(--color-border)' : undefined }}>
                                                {Object.keys(perevozkaNomenclature[0]).map((col) => (
                                                    <td
                                                        key={col}
                                                        style={{ padding: '0.5rem 0.75rem', verticalAlign: 'top' }}
                                                    >
                                                        {(() => {
                                                            const val = row[col];
                                                            if (val === undefined || val === null) return '—';
                                                            if (Array.isArray(val)) {
                                                                if (val.length === 0) return '—';
                                                                const first = val[0];
                                                                if (typeof first === 'object' && first !== null && ('SKU' in first || 'sku' in first)) {
                                                                    const list = val.map((it: any) => it?.SKU ?? it?.sku ?? '').filter((s: string) => String(s).trim());
                                                                    return list.length === 0 ? '—' : (
                                                                        <span style={{ display: 'block', maxHeight: '12em', overflowY: 'auto' }}>
                                                                            {list.map((sku: string, i: number) => (
                                                                                <span key={i} style={{ display: 'block', marginBottom: i < list.length - 1 ? '0.25rem' : 0 }}>{sku}</span>
                                                                            ))}
                                                                        </span>
                                                                    );
                                                                }
                                                                return val.map((v: any) => String(v)).join(', ');
                                                            }
                                                            if (typeof val === 'object') return JSON.stringify(val);
                                                            const s = String(val).trim();
                                                            return s !== '' ? s : '—';
                                                        })()}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* SLA: только статус В срок / Опоздание, без указания дней */}
                {(() => {
                    const sla = slaFromTimeline;
                    if (!sla) return null;
                    return (
                        <div style={{ marginTop: '0.5rem', marginBottom: '1rem' }}>
                            <Typography.Body style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                                {sla.onTime
                                    ? <span style={{ color: 'var(--color-success-status)' }}>В срок</span>
                                    : <span style={{ color: '#ef4444' }}>Опоздание</span>
                                }
                            </Typography.Body>
                        </div>
                    );
                })()}

                {downloadError && <Typography.Body className="login-error mb-2">{downloadError}</Typography.Body>}
                <Typography.Headline style={{marginTop: '1rem', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 600}}>
                    Документы
                </Typography.Headline>
                
                {/* Умные сценарии документов */}
                {(() => {
                    const isPaid = item.StateBill?.toLowerCase().includes('оплачен') || 
                                  item.StateBill?.toLowerCase().includes('paid') ||
                                  item.StateBill === 'Оплачен';
                    
                    // Для отправителя и получателя доступен только АПП
                    const isCustomerRole = item._role === 'Customer';
                    const availableDocs = isCustomerRole ? ['ЭР', 'АПП', 'СЧЕТ', 'УПД'] : ['АПП'];
                    
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
                        </>
                    );
                })()}

                {/* Встроенный просмотрщик PDF (метод 4: object/embed) */}
                {pdfViewer && (
                    <div style={{ marginTop: '1rem', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                        <div style={{ padding: '0.5rem', background: 'var(--color-bg-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                            <Typography.Label style={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfViewer.name}</Typography.Label>
                            <Flex align="center" gap="0.25rem">
                                {pdfViewer.blob && (
                                    <Button size="small" onClick={() => downloadFile(pdfViewer.blob!, pdfViewer.downloadFileName || pdfViewer.name)} title="Скачать">
                                        <Download className="w-4 h-4" />
                                    </Button>
                                )}
                                <Button size="small" onClick={() => { URL.revokeObjectURL(pdfViewer.url); setPdfViewer(null); }}>
                                    <X size={16} />
                                </Button>
                            </Flex>
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

// УДАЛЕНО: function StubPage({ title }: { title: string }) { return <div className="w-full p-8 text-center"><h2 className="title">{title}</h2><p className="subtitle">Раздел в разработке</p></div>; }

/** Модальное окно деталей счёта: табличная часть номенклатуры */
function InvoiceDetailModal({ item, isOpen, onClose, onOpenCargo }: { item: any; isOpen: boolean; onClose: () => void; onOpenCargo?: (cargoNumber: string) => void }) {
    if (!isOpen) return null;
    const list: Array<{ Name?: string; Operation?: string; Quantity?: string | number; Price?: string | number; Sum?: string | number }> = Array.isArray(item?.List) ? item.List : [];
    const num = item?.Number ?? item?.number ?? '—';
    const renderServiceCell = (raw: string) => {
        const s = stripOoo(raw || '—');
        const parts = parseCargoNumbersFromText(s);
        return (
            <>
                {parts.map((p, k) =>
                    p.type === 'cargo' ? (
                        <span
                            key={k}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onOpenCargo?.(p.value); }}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCargo?.(p.value); } }}
                            style={{ color: 'var(--color-primary)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 600 }}
                            title="Открыть карточку перевозки"
                        >{p.value}</span>
                    ) : (
                        <span key={k}>{p.value}</span>
                    )
                )}
            </>
        );
    };
    return createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 9998, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
            <Panel className="cargo-card" style={{ maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', padding: '1rem' }} onClick={e => e.stopPropagation()}>
            <Flex justify="space-between" align="center" style={{ marginBottom: '1rem' }}>
                <Typography.Headline style={{ fontSize: '1.1rem' }}>Счёт {formatInvoiceNumber(num)}</Typography.Headline>
                <Button className="filter-button" onClick={onClose} style={{ padding: '0.35rem' }}><X className="w-5 h-5" /></Button>
            </Flex>
            {list.length > 0 ? (
                <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: 'var(--color-bg-hover)' }}>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'left', fontWeight: 600 }}>Услуга</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Кол-во</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Цена</th>
                                <th style={{ padding: '0.5rem 0.4rem', textAlign: 'right', fontWeight: 600 }}>Сумма</th>
                            </tr>
                        </thead>
                        <tbody>
                            {list.map((row, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <td style={{ padding: '0.5rem 0.4rem', maxWidth: 220 }} title={stripOoo(String(row.Operation ?? row.Name ?? ''))}>{renderServiceCell(String(row.Operation ?? row.Name ?? '—'))}</td>
                                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Quantity ?? '—'}</td>
                                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Price != null ? formatCurrency(row.Price, true) : '—'}</td>
                                    <td style={{ padding: '0.5rem 0.4rem', textAlign: 'right' }}>{row.Sum != null ? formatCurrency(row.Sum, true) : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Нет номенклатуры</Typography.Body>
            )}
            </Panel>
        </div>,
        document.body
    );
}

/** Значения статуса счёта для фильтра */
const INVOICE_STATUS_OPTIONS = ['Оплачен', 'Не оплачен', 'Оплачен частично'] as const;
const normalizeInvoiceStatus = (s: string | undefined): string => {
    if (!s) return '';
    const lower = s.toLowerCase().trim();
    if (lower.includes('оплачен') && !lower.includes('не') && !lower.includes('частично')) return 'Оплачен';
    if (lower.includes('частично')) return 'Оплачен частично';
    if (lower.includes('не') || lower.includes('неоплачен')) return 'Не оплачен';
    return s;
};

/** Эмоции Грузика: под каждую можно положить gruzik-{emotion}.gif / .webm / .png в public */
export type GruzikEmotion = 'default' | 'typing' | 'thinking' | 'happy' | 'sad' | 'error' | 'wave' | 'ok' | string;

/** Аватар Грузика: приоритет GIF, затем WebM, затем PNG (или JPG). Для анимации нужен файл gruzik.gif или gruzik.webm в public/ */
function GruzikAvatar({
    size = 40,
    typing = false,
    emotion: emotionProp,
    className = '',
}: {
    size?: number;
    typing?: boolean;
    /** Эмоция/вариант анимации: default, typing, thinking, happy, sad, error, wave, ok или свой ключ — ищутся файлы /gruzik-{emotion}.gif */
    emotion?: GruzikEmotion;
    className?: string;
}) {
    const emotion = typing ? 'typing' : (emotionProp ?? 'default');
    const base = emotion === 'default' ? '' : `-${emotion}`;
    const [source, setSource] = useState<'gif' | 'webm' | 'png' | 'jpg'>('gif');
    const [currentBase, setCurrentBase] = useState(base);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        setCurrentBase(base);
        setSource('gif');
    }, [base]);

    const gifSrc = `/gruzik${currentBase || ''}.gif`;
    const webmSrc = `/gruzik${currentBase || ''}.webm`;
    const pngSrc = `/gruzik${currentBase || ''}.png`;
    const defaultGif = '/gruzik.gif';
    const defaultWebm = '/gruzik.webm';
    const defaultPng = '/gruzik.png';
    const defaultJpg = '/gruzik.jpg';

    const onGifError = () => {
        if (currentBase) {
            setCurrentBase('');
        } else {
            setSource('webm');
        }
    };
    const onWebmError = () => {
        if (currentBase) {
            setCurrentBase('');
            setSource('webm');
        } else {
            setSource('png');
        }
    };
    const onPngError = () => {
        if (currentBase) {
            setCurrentBase('');
            setSource('png');
        } else {
            setSource('jpg');
        }
    };

    useEffect(() => {
        if (source !== 'webm') return;
        const video = videoRef.current;
        if (!video) return;
        const play = () => {
            video.play().catch(() => setSource('png'));
        };
        play();
        video.addEventListener('loadeddata', play);
        video.addEventListener('canplay', play);
        return () => {
            video.removeEventListener('loadeddata', play);
            video.removeEventListener('canplay', play);
        };
    }, [source]);

    return (
        <div
            className={`gruzik-avatar ${typing ? 'typing' : ''} ${className}`.trim()}
            style={{
                width: size,
                height: size,
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--color-bg-primary)',
            }}
            aria-hidden
        >
            {source === 'png' || source === 'jpg' ? (
                <img
                    src={source === 'jpg' ? defaultJpg : (currentBase ? pngSrc : defaultPng)}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={source === 'jpg' ? undefined : onPngError}
                />
            ) : source === 'webm' ? (
                <video
                    ref={videoRef}
                    src={currentBase ? webmSrc : defaultWebm}
                    autoPlay
                    loop
                    muted
                    playsInline
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={onWebmError}
                />
            ) : (
                <img
                    key={currentBase || 'default'}
                    src={currentBase ? gifSrc : defaultGif}
                    alt="Грузик"
                    width={size}
                    height={size}
                    style={{ width: size, height: size, objectFit: 'contain', display: 'block' }}
                    title="Грузик"
                    onError={onGifError}
                />
            )}
        </div>
    );
}

/** По тексту ответа ассистента подбираем эмоцию Грузика (для анимации) */
function deriveEmotionFromReply(text: string): GruzikEmotion {
    if (!text || typeof text !== 'string') return 'default';
    const t = text.toLowerCase();
    if (/\b(ошибка|не удалось|не получилось|проблема|к сожалению)\b/.test(t)) return 'sad';
    if (/\b(готово|успешно|отлично|сделано|принято)\b/.test(t)) return 'happy';
    if (/\b(думаю|сейчас проверю|ищу|подождите)\b/.test(t)) return 'thinking';
    return 'default';
}

function ChatPage({ 
    prefillMessage, 
    onClearPrefill,
    auth,
    cargoItems,
    sessionOverride,
    userIdOverride,
    customerOverride,
    onOpenCargo,
    clearChatRef,
    onChatCustomerState
}: { 
    prefillMessage?: string; 
    onClearPrefill?: () => void;
    auth?: AuthData;
    cargoItems?: CargoItem[];
    sessionOverride?: string;
    userIdOverride?: string;
    customerOverride?: string;
    onOpenCargo?: (cargoNumber: string) => void;
    /** ref для вызова очистки чата из родителя (кнопка «Очистить чат») */
    clearChatRef?: React.MutableRefObject<(() => void) | null>;
    /** вызывается при смене заказчика/отвязке в чате — для отображения в шапке */
    onChatCustomerState?: (state: { customer: string | null; unlinked: boolean }) => void;
}) {
    const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; emotion?: GruzikEmotion }[]>([]);
    const [inputValue, setInputValue] = useState("");
    const [isTyping, setIsReady] = useState(false);
    const [hasLoadedHistory, setHasLoadedHistory] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [sessionId, setSessionId] = useState<string>(() => {
        if (sessionOverride) return sessionOverride;
        if (typeof window === "undefined") return "server";
        const key = "haulz.chat.sessionId";
        const existing = window.localStorage.getItem(key);
        if (existing) return existing;
        const sid =
            typeof crypto !== "undefined" && "randomUUID" in crypto
                ? crypto.randomUUID()
                : `s_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        window.localStorage.setItem(key, sid);
        return sid;
    });
    const [sessionUnlinked, setSessionUnlinked] = useState(false);
    /** Отладка на экране: последний статус ответа API и текст ошибки */
    const [chatStatus, setChatStatus] = useState<{ status?: number; error?: string } | null>(null);
    /** Отдельная строка: какие запросы по API выполнялись (перевозки, чат) */
    const [apiRequestInfo, setApiRequestInfo] = useState<{ context?: string; chat?: string } | null>(null);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // После отвязки в чате не отправляем заказчика, пока пользователь снова не выберет компанию
    useEffect(() => {
        if (customerOverride) setSessionUnlinked(false);
    }, [customerOverride]);

    const effectiveCustomer = sessionUnlinked ? null : customerOverride ?? null;
    useEffect(() => {
        onChatCustomerState?.({ customer: effectiveCustomer ?? null, unlinked: sessionUnlinked });
    }, [effectiveCustomer, sessionUnlinked, onChatCustomerState]);
    const recorderRef = React.useRef<MediaRecorder | null>(null);
    const chunksRef = React.useRef<Blob[]>([]);
    const streamRef = React.useRef<MediaStream | null>(null);
    const ffmpegRef = React.useRef<FFmpeg | null>(null);
    const ffmpegLoadingRef = React.useRef<Promise<FFmpeg> | null>(null);

    const renderLineWithLinks = (line: string) => {
        const parts: React.ReactNode[] = [];
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const cargoRegex = /№\s*\d{4,}|\b\d{6,}\b/g;
        const combined = new RegExp(`${urlRegex.source}|${cargoRegex.source}`, "g");
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        let keyIndex = 0;
        const openChatLink = (url: string) => {
            const webApp = (window as any)?.Telegram?.WebApp || (window as any)?.MaxWebApp;
            if (webApp && typeof webApp.openLink === "function") {
                webApp.openLink(url);
                return;
            }
            window.open(url, "_blank", "noopener,noreferrer");
        };

        while ((match = combined.exec(line)) !== null) {
            const start = match.index;
            const rawValue = match[0];
            if (start > lastIndex) {
                parts.push(line.slice(lastIndex, start));
            }

            if (rawValue.startsWith("http")) {
                parts.push(
                    <button
                        key={`url-${keyIndex}`}
                        type="button"
                        onClick={() => openChatLink(rawValue)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit",
                            textAlign: "left"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else if (onOpenCargo) {
                const cargoNumber = rawValue.replace(/\D+/g, "");
                parts.push(
                    <button
                        key={`cargo-${keyIndex}`}
                        type="button"
                        onClick={() => onOpenCargo(cargoNumber)}
                        style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            margin: 0,
                            cursor: "pointer",
                            color: "inherit",
                            textDecoration: "underline",
                            font: "inherit"
                        }}
                    >
                        {rawValue}
                    </button>
                );
            } else {
                parts.push(rawValue);
            }

            lastIndex = start + rawValue.length;
            keyIndex += 1;
        }

        if (lastIndex < line.length) {
            parts.push(line.slice(lastIndex));
        }

        return parts;
    };

    const renderMessageContent = (text: string) => {
        const blocks = String(text || "").split(/\n{2,}/).filter(Boolean);
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {blocks.map((block, blockIndex) => {
                    const lines = block.split(/\n/).filter(Boolean);
                    const isBulleted = lines.length > 0 && lines.every(line => /^[-•]\s+/.test(line));
                    const isNumbered = lines.length > 0 && lines.every(line => /^\d+[.)]\s+/.test(line));

                    if (isBulleted) {
                        return (
                            <ul key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem', listStyleType: 'disc' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^[-•]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ul>
                        );
                    }

                    if (isNumbered) {
                        return (
                            <ol key={blockIndex} style={{ margin: 0, paddingLeft: '1.25rem' }}>
                                {lines.map((line, lineIndex) => (
                                    <li key={lineIndex}>
                                        <Typography.Body style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0 }}>
                                            {renderLineWithLinks(line.replace(/^\d+[.)]\s+/, ""))}
                                        </Typography.Body>
                                    </li>
                                ))}
                            </ol>
                        );
                    }

                    return (
                        <Typography.Body
                            key={blockIndex}
                            style={{ color: 'inherit', fontSize: '0.95rem', lineHeight: '1.4', margin: 0, whiteSpace: 'pre-wrap' }}
                        >
                            {renderLineWithLinks(block)}
                        </Typography.Body>
                    );
                })}
            </div>
        );
    };

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
    };

    const loadFfmpeg = async () => {
        if (ffmpegRef.current) return ffmpegRef.current;
        if (!ffmpegLoadingRef.current) {
            const ffmpeg = new FFmpeg();
            const baseUrl = "https://unpkg.com/@ffmpeg/core@0.12.6/dist";
            ffmpegLoadingRef.current = (async () => {
                await ffmpeg.load({
                    coreURL: `${baseUrl}/ffmpeg-core.js`,
                    wasmURL: `${baseUrl}/ffmpeg-core.wasm`,
                    workerURL: `${baseUrl}/ffmpeg-core.worker.js`
                });
                ffmpegRef.current = ffmpeg;
                return ffmpeg;
            })();
        }
        return ffmpegLoadingRef.current;
    };

    const convertAacToMp4 = async (inputBlob: Blob) => {
        const ffmpeg = await loadFfmpeg();
        const inputName = "input.aac";
        const outputName = "output.mp4";
        try {
            await ffmpeg.writeFile(inputName, await fetchFile(inputBlob));
            await ffmpeg.exec(["-i", inputName, "-c:a", "aac", "-b:a", "128k", outputName]);
            const data = await ffmpeg.readFile(outputName);
            return new Blob([data], { type: "audio/mp4" });
        } finally {
            try { await ffmpeg.deleteFile(inputName); } catch { /* ignore */ }
            try { await ffmpeg.deleteFile(outputName); } catch { /* ignore */ }
        }
    };

    const encodeWav = (audioBuffer: AudioBuffer) => {
        const channelCount = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;
        const buffer = new ArrayBuffer(44 + length * 2 * channelCount);
        const view = new DataView(buffer);
        let offset = 0;

        const writeString = (s: string) => {
            for (let i = 0; i < s.length; i += 1) {
                view.setUint8(offset++, s.charCodeAt(i));
            }
        };

        writeString("RIFF");
        view.setUint32(offset, 36 + length * 2 * channelCount, true); offset += 4;
        writeString("WAVE");
        writeString("fmt ");
        view.setUint32(offset, 16, true); offset += 4; // PCM chunk size
        view.setUint16(offset, 1, true); offset += 2; // PCM format
        view.setUint16(offset, channelCount, true); offset += 2;
        view.setUint32(offset, sampleRate, true); offset += 4;
        view.setUint32(offset, sampleRate * channelCount * 2, true); offset += 4;
        view.setUint16(offset, channelCount * 2, true); offset += 2;
        view.setUint16(offset, 16, true); offset += 2;
        writeString("data");
        view.setUint32(offset, length * 2 * channelCount, true); offset += 4;

        for (let i = 0; i < length; i += 1) {
            for (let ch = 0; ch < channelCount; ch += 1) {
                const sample = audioBuffer.getChannelData(ch)[i];
                const clamped = Math.max(-1, Math.min(1, sample));
                view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
                offset += 2;
            }
        }

        return new Blob([buffer], { type: "audio/wav" });
    };

    const convertAacToWav = async (blob: Blob) => {
        const arrayBuffer = await blob.arrayBuffer();
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        try {
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            return encodeWav(audioBuffer);
        } finally {
            audioContext.close().catch(() => {});
        }
    };

    const getAudioFileName = (mimeType: string) => {
        if (mimeType.includes("webm")) return "voice.webm";
        if (mimeType.includes("ogg")) return "voice.ogg";
        if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "voice.mp3";
        if (mimeType.includes("wav")) return "voice.wav";
        if (mimeType.includes("mp4")) return "voice.mp4";
        if (mimeType.includes("m4a")) return "voice.m4a";
        return "voice.webm";
    };

    const transcribeAndSend = async (blob: Blob) => {
        setIsTranscribing(true);
        try {
            if (!blob || blob.size < 256) {
                throw new Error("Запись слишком короткая");
            }
            const rawType = blob.type || recorderRef.current?.mimeType || "audio/webm";
            let baseType = rawType.split(";")[0];
            if (baseType === "audio/aac" || baseType === "audio/x-aac") {
                // iOS can return raw AAC (ADTS). Convert to MP4 (AAC) via ffmpeg.wasm.
                try {
                    blob = await convertAacToMp4(blob);
                    baseType = "audio/mp4";
                } catch (err) {
                    // Fallback to WAV if ffmpeg fails to load or convert.
                    blob = await convertAacToWav(blob);
                    baseType = "audio/wav";
                }
            }
            const fileName = getAudioFileName(baseType);
            const file = new File([blob], fileName, { type: baseType });
            const formData = new FormData();
            formData.append("audio", file);

            const res = await fetch("/api/transcribe", {
                method: "POST",
                body: formData
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data?.error || `Ошибка ${res.status}`);
            }
            const text = String(data?.text || "").trim();
            if (text) {
                await handleSend(text);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось распознать речь." }]);
            }
        } catch (e: any) {
            const msg = e?.message || "Не удалось распознать речь";
            setMessages(prev => [...prev, { role: 'assistant', content: `Ошибка распознавания: ${msg}` }]);
        } finally {
            setIsTranscribing(false);
        }
    };

    const startRecording = async () => {
        if (isRecording || isTranscribing) return;
        if (typeof MediaRecorder === "undefined") {
            setMessages(prev => [...prev, { role: 'assistant', content: "Запись голоса не поддерживается в этом браузере." }]);
            return;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            const preferredTypes = [
                "audio/webm;codecs=opus",
                "audio/ogg;codecs=opus",
                "audio/webm",
                "audio/ogg",
                "audio/mp4",
                "audio/mpeg"
            ];
            const mimeType = preferredTypes.find(type => MediaRecorder.isTypeSupported(type));
            const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
            chunksRef.current = [];

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    chunksRef.current.push(event.data);
                }
            };

            recorder.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
                stopStream();
                await transcribeAndSend(blob);
            };

            recorderRef.current = recorder;
            recorder.start();
            setIsRecording(true);
        } catch (e) {
            stopStream();
            setMessages(prev => [...prev, { role: 'assistant', content: "Не удалось получить доступ к микрофону." }]);
        }
    };

    const stopRecording = () => {
        if (!recorderRef.current) return;
        recorderRef.current.stop();
        recorderRef.current = null;
        setIsRecording(false);
    };

    useEffect(() => {
        return () => {
            if (recorderRef.current && recorderRef.current.state !== "inactive") {
                try { recorderRef.current.stop(); } catch { /* ignore */ }
            }
            stopStream();
        };
    }, []);

    useEffect(() => {
        if (!sessionOverride) return;
        setSessionId(sessionOverride);
        setMessages([]);
        setInputValue("");
        setHasLoadedHistory(false);
    }, [sessionOverride]);

    useEffect(() => {
        let isActive = true;
        const loadHistory = async () => {
            if (!sessionId) return;
            try {
                const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId, action: "history" })
                });
                if (!res.ok) return;
                const data = await res.json().catch(() => ({}));
                if (!isActive) return;
                if (Array.isArray(data?.history)) {
                    setMessages(
                        data.history
                            .filter((item: any) => item?.role === "user" || item?.role === "assistant")
                            .map((item: any) => ({ role: item.role, content: String(item.content || ""), emotion: item.emotion }))
                    );
                }
            } finally {
                if (isActive) setHasLoadedHistory(true);
            }
        };

        loadHistory();
        return () => {
            isActive = false;
        };
    }, [sessionId]);

    // Начальное приветствие
    useEffect(() => {
        if (hasLoadedHistory && messages.length === 0) {
            setMessages([
                { role: 'assistant', content: "Здравствуйте! Меня зовут Грузик, я AI-помощник HAULZ. Как я могу вам помочь?" }
            ]);
        }
    }, [hasLoadedHistory, messages.length]);

    const clearChat = useCallback(async () => {
        try {
            await fetch('/api/chat-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId }),
            });
        } catch {
            // ignore
        }
        setMessages([]);
    }, [sessionId]);

    useEffect(() => {
        if (clearChatRef) clearChatRef.current = clearChat;
        return () => { if (clearChatRef) clearChatRef.current = null; };
    }, [clearChatRef, clearChat]);

    // Автоматическая прокрутка вниз
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    // Обработка предзаполненного сообщения
    useEffect(() => {
        if (prefillMessage && prefillMessage.trim()) {
            handleSend(prefillMessage);
            if (onClearPrefill) onClearPrefill();
        }
    }, [prefillMessage]);

    const handleSend = async (text: string) => {
        const messageText = text || inputValue.trim();
        if (!messageText || isTyping) return;

        const newMessages = [...messages, { role: 'user' as const, content: messageText }];
        setMessages(newMessages);
        setInputValue("");
        setIsReady(true);
        setChatStatus(null);
        setApiRequestInfo(null);

        let fetchedCargo: CargoItem[] = [];
        let contextApiLabel = '';
        try {
            if (auth?.login && auth?.password) {
                const now = new Date();
                const today = now.toISOString().split("T")[0];
                const t = (messageText || '').toLowerCase();
                let dateFrom = today;
                let dateTo = today;
                if (/\b(недел|за неделю|на неделю)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 7);
                    dateFrom = from.toISOString().split('T')[0];
                } else if (/\b(месяц|за месяц|на месяц)\b/.test(t)) {
                    const from = new Date(now);
                    from.setDate(from.getDate() - 30);
                    dateFrom = from.toISOString().split('T')[0];
                }
                const perevozkiRes = await fetch('/api/perevozki', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        login: auth.login,
                        password: auth.password,
                        dateFrom,
                        dateTo,
                        ...(customerOverride ? { customer: customerOverride } : {}),
                        ...(auth.inn ? { inn: auth.inn } : {}),
                    }),
                });
                if (perevozkiRes.ok) {
                    const data = await perevozkiRes.json().catch(() => ({}));
                    const list = Array.isArray(data) ? data : (data?.items ?? []);
                    const count = Array.isArray(list) ? list.length : 0;
                    contextApiLabel = `POST /api/perevozki (${count} перевозок)`;
                    fetchedCargo = (list as any[]).slice(0, 30).map((i: any) => ({
                        Number: i.Number,
                        DatePrih: i.DatePrih,
                        DateVr: i.DateVr,
                        State: i.State,
                        StateBill: i.StateBill,
                        Mest: i.Mest,
                        PW: i.PW,
                        Sum: i.Sum,
                        Sender: i.Sender,
                        Receiver: i.Receiver,
                        Customer: i.Customer ?? i.customer,
                    }));
                } else {
                    contextApiLabel = `POST /api/perevozki (код ${perevozkiRes.status})`;
                }
            } else {
                contextApiLabel = 'POST /api/perevozki не вызывался (нет авторизации)';
            }
        } catch {
            contextApiLabel = 'POST /api/perevozki (ошибка или таймаут)';
        }
        setApiRequestInfo(prev => ({ ...prev, context: contextApiLabel || undefined }));

        const cargoForContext = fetchedCargo.length > 0 ? fetchedCargo : (cargoItems ?? []);
        const recentCargoList = cargoForContext.slice(0, 35).map(i => {
            const from = cityToCode(i.CitySender);
            const to = cityToCode(i.CityReceiver);
            const route = from === 'MSK' && to === 'KGD' ? 'MSK-KGD' : from === 'KGD' && to === 'MSK' ? 'KGD-MSK' : 'other';
            return {
                number: i.Number,
                status: normalizeStatus(i.State),
                statusKey: getFilterKeyByStatus(i.State),
                datePrih: i.DatePrih,
                dateVr: i.DateVr,
                stateBill: i.StateBill,
                paymentKey: getPaymentFilterKey(i.StateBill),
                sum: i.Sum,
                sender: i.Sender,
                receiver: i.Receiver ?? (i as any).receiver,
                customer: i.Customer ?? (i as any).customer,
                type: isFerry(i) ? 'ferry' : 'auto',
                route,
            };
        });

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const todayLabel = now.toLocaleDateString('ru-RU');
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        const weekStartStr = weekAgo.toISOString().split('T')[0];
        const monthAgo = new Date(now);
        monthAgo.setDate(monthAgo.getDate() - 30);
        const monthStartStr = monthAgo.toISOString().split('T')[0];
        // Подготавливаем контекст: данные перевозок из API или переданный cargoItems
        const context = {
            userLogin: auth?.login,
            customer: customerOverride,
            todayDate: todayStr,
            todayLabel,
            weekStartDate: weekStartStr,
            weekEndDate: todayStr,
            monthStartDate: monthStartStr,
            monthEndDate: todayStr,
            activeCargoCount: cargoForContext.length,
            cargoList: recentCargoList,
        };

        const CHAT_DEBUG = typeof window !== 'undefined' && window.localStorage?.getItem('haulz.chatDebug') === '1';

        try {
            if (CHAT_DEBUG) console.log('[chat] send start', { sessionId, messageLen: messageText.length });
            const effectiveCustomer = sessionUnlinked ? null : customerOverride;
            let preloadedCargo: unknown = undefined;
            if (typeof window !== "undefined") {
                try {
                    const stored = window.sessionStorage.getItem("haulz.chat.cargoPreload");
                    if (stored) {
                        preloadedCargo = JSON.parse(stored);
                        window.sessionStorage.removeItem("haulz.chat.cargoPreload");
                    }
                } catch (_) {}
            }
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    sessionId,
                    userId: userIdOverride || auth?.login,
                    message: messageText,
                    context: { ...context, customer: effectiveCustomer },
                    customer: effectiveCustomer,
                    ...(preloadedCargo != null ? { preloadedCargo } : {}),
                    auth: auth?.login && auth?.password ? { login: auth.login, password: auth.password, ...(auth.inn ? { inn: auth.inn } : {}), ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}) } : undefined
                }),
            });
            const data = await res.json().catch((parseErr) => {
                if (CHAT_DEBUG) console.warn('[chat] response json parse failed', parseErr);
                return {};
            });
            if (CHAT_DEBUG) console.log('[chat] response', { status: res.status, ok: res.ok, hasReply: !!data?.reply, replyLen: data?.reply?.length });
            if (!res.ok) {
                const msg = data?.reply || data?.error || data?.message || `Код ${res.status}`;
                setChatStatus({ status: res.status, error: msg });
                setApiRequestInfo(prev => ({ ...prev, chat: `POST /api/chat (${res.status})` }));
                throw new Error(msg);
            }
            setChatStatus({ status: 200 });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (200)' }));
            if (data?.unlinked === true) {
                setSessionUnlinked(true);
            }
            if (!sessionOverride && data?.sessionId && typeof data.sessionId === "string" && data.sessionId !== sessionId) {
                setSessionId(data.sessionId);
                if (typeof window !== "undefined") {
                    window.localStorage.setItem("haulz.chat.sessionId", data.sessionId);
                }
            }
            const replyText = typeof data?.reply === "string" ? data.reply : "";
            const emotion = typeof data?.emotion === "string" ? data.emotion : deriveEmotionFromReply(replyText);
            setMessages(prev => [...prev, { role: 'assistant', content: replyText || "(Нет ответа от сервера. Попробуйте ещё раз.)", emotion }]);
        } catch (e: any) {
            const isAbort = e?.name === 'AbortError';
            const msg = isAbort ? 'Ответ занял слишком много времени. Попробуйте ещё раз.' : (e?.message || 'Не удалось получить ответ');
            setChatStatus({ error: msg });
            setApiRequestInfo(prev => ({ ...prev, chat: 'POST /api/chat (ошибка)' }));
            setMessages(prev => [...prev, { 
                role: 'assistant', 
                content: `Ошибка: ${msg}`,
                emotion: 'error'
            }]);
        } finally {
            setIsReady(false);
        }
    };

    return (
        <div className="chat-shell" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%' }}>
            {/* Окно сообщений — скролл сверху вниз */}
            <div 
                ref={scrollRef}
                className="chat-messages"
                style={{ 
                    flex: 1, 
                    minHeight: 0,
                    overflowY: 'auto', 
                    overflowX: 'hidden',
                    padding: '1rem', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '1rem',
                    scrollBehavior: 'smooth' 
                }}
            >
                {messages.map((msg, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        {msg.role === 'assistant' && <GruzikAvatar size={40} emotion={msg.emotion} />}
                        <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble-user' : 'chat-bubble-assistant'}`} style={{ 
                            maxWidth: '85%', 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                            backgroundColor: msg.role === 'user' ? 'var(--color-theme-primary)' : 'var(--color-panel-secondary)',
                            color: msg.role === 'user' ? '#fff' : 'inherit',
                            borderBottomRightRadius: msg.role === 'user' ? '0' : '1rem',
                            borderBottomLeftRadius: msg.role === 'user' ? '1rem' : '0',
                            border: msg.role === 'user' ? 'none' : '1px solid var(--color-border)'
                        }}>
                            {renderMessageContent(msg.content)}
                        </div>
                    </div>
                ))}
                {isTyping && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'flex-end', gap: '0.5rem' }}>
                        <GruzikAvatar size={52} typing />
                        <div className="chat-bubble chat-bubble-assistant" style={{ 
                            padding: '0.75rem 1rem', 
                            borderRadius: '1rem', 
                            backgroundColor: 'var(--color-panel-secondary)',
                            border: '1px solid var(--color-border)',
                            borderBottomLeftRadius: '0',
                            maxWidth: '85%'
                        }}>
                            <span className="chat-typing-text">печатает</span>
                            <span className="chat-typing-dots">
                                <span>.</span><span>.</span><span>.</span>
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Поле ввода — прижато к низу, без линии сверху */}
            <div className="chat-input-bar" style={{ padding: '0.75rem', background: 'var(--color-bg-primary)', width: '100%', boxSizing: 'border-box', flexShrink: 0 }}>
                <form 
                    onSubmit={(e) => { e.preventDefault(); handleSend(inputValue); }}
                    style={{ display: 'flex', gap: '0.5rem', height: '44px', width: '100%', minWidth: 0 }}
                >
                    <Input
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(inputValue);
                            }
                        }}
                        placeholder="Напишите ваш вопрос..."
                        className="chat-input"
                        style={{ flex: 1, minWidth: 0, height: '44px' }}
                        disabled={isTyping || isRecording || isTranscribing}
                    />
                    <Button 
                        type="submit" 
                        disabled={!inputValue.trim() || isTyping || isRecording || isTranscribing}
                        className="chat-action-button chat-send-button"
                        style={{ padding: '0.5rem', minWidth: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                        <ArrowUp size={20} />
                    </Button>
                </form>
            </div>
        </div>
    );
}

// ----------------- MAIN APP -----------------

const EMPTY_AUTH_STATE: { accounts: Account[]; activeAccountId: string | null; selectedAccountIds: string[] } = { accounts: [], activeAccountId: null, selectedAccountIds: [] };
let initialAuthStateCache: typeof EMPTY_AUTH_STATE | undefined = undefined;
function getInitialAuthState(): typeof EMPTY_AUTH_STATE {
    if (initialAuthStateCache !== undefined) return initialAuthStateCache;
    if (typeof window === "undefined") return EMPTY_AUTH_STATE;
    try {
        // Сначала восстанавливаем из haulz.accounts (полные данные, включая компанию сотрудника)
        const savedAccounts = window.localStorage.getItem("haulz.accounts");
        if (savedAccounts) {
            let parsedAccounts = JSON.parse(savedAccounts) as unknown;
            if (!Array.isArray(parsedAccounts)) parsedAccounts = [];
            parsedAccounts = (parsedAccounts as Account[]).filter(
                (acc): acc is Account => acc != null && typeof acc === "object" && typeof (acc as Account).login === "string" && typeof (acc as Account).password === "string"
            );
            if (parsedAccounts.length > 0) {
                parsedAccounts = (parsedAccounts as Account[]).map((acc) => {
                    const withCustomer = acc.customers?.length && !acc.customer ? { ...acc, customer: acc.customers[0].name } : acc;
                    return { ...withCustomer, inCustomerDirectory: undefined as boolean | undefined };
                });
                const savedActiveId = window.localStorage.getItem("haulz.activeAccountId");
                const activeId = (savedActiveId && parsedAccounts.find((acc) => acc.id === savedActiveId)) ? savedActiveId : parsedAccounts[0].id;
                let selectedIds: string[] = [];
                const savedSelectedIds = window.localStorage.getItem("haulz.selectedAccountIds");
                if (savedSelectedIds) {
                    try {
                        const ids = JSON.parse(savedSelectedIds) as string[];
                        if (Array.isArray(ids) && ids.length > 0) {
                            const valid = ids.filter((id) => parsedAccounts.some((acc) => acc.id === id));
                            if (valid.length > 0) selectedIds = valid;
                        }
                    } catch {
                        // ignore
                    }
                }
                if (selectedIds.length === 0) selectedIds = activeId ? [activeId] : [];
                initialAuthStateCache = { accounts: parsedAccounts, activeAccountId: activeId, selectedAccountIds: selectedIds };
                return initialAuthStateCache;
            }
        }
        // Иначе — миграция со старого формата haulz.auth (только логин/пароль)
        const saved = window.localStorage.getItem("haulz.auth");
        if (saved) {
            const parsed = JSON.parse(saved) as AuthData;
            if (parsed?.login && parsed?.password) {
                const accountId = parsed.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const account: Account = { login: parsed.login, password: parsed.password, id: accountId };
                initialAuthStateCache = { accounts: [account], activeAccountId: accountId, selectedAccountIds: [accountId] };
                return initialAuthStateCache;
            }
        }
    } catch {
        // ignore
    }
    return EMPTY_AUTH_STATE;
}

export default function App() {
    // Тема и состояние — объявляем первыми, т.к. используются в первом useEffect (избегаем TDZ при минификации)
    const [theme, setTheme] = useState<'dark' | 'light'>(() => {
        if (typeof window === 'undefined') return 'dark';
        const saved = window.localStorage.getItem('haulz.theme');
        return (saved === 'dark' || saved === 'light') ? saved : 'dark';
    });

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
                // Для MAX не используем автоматическую тему из colorScheme; приоритет — сохранённая тема
                const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("haulz.theme") : null;
                if (savedTheme === "dark" || savedTheme === "light") {
                    setTheme(savedTheme);
                } else if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
                    setTheme(webApp.colorScheme);
                }
            } catch {
                // Игнорируем, если WebApp API частично недоступен
            }

            const themeHandler = () => {
                const savedTheme = typeof window !== "undefined" ? window.localStorage.getItem("haulz.theme") : null;
                if (savedTheme === "dark" || savedTheme === "light") {
                    setTheme(savedTheme);
                } else if (!isMaxWebApp() && typeof webApp.colorScheme === "string") {
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

    // Множественные аккаунты (синхронное восстановление из localStorage — избегаем пустой страницы при первом входе)
    const [accounts, setAccounts] = useState<Account[]>(() => getInitialAuthState().accounts);
    const [activeAccountId, setActiveAccountId] = useState<string | null>(() => getInitialAuthState().activeAccountId);
    /** Выбранные компании для отображения перевозок (можно несколько) */
    const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(() => getInitialAuthState().selectedAccountIds);
    const [useServiceRequest, setUseServiceRequest] = useState(false);
    const [serviceRefreshSpinning, setServiceRefreshSpinning] = useState(false);
    // Вычисляем текущий активный аккаунт
    const auth = useMemo(() => {
        if (!activeAccountId) return null;
        const account = accounts.find(acc => acc.id === activeAccountId);
        if (!account || typeof account.login !== "string" || typeof account.password !== "string") return null;
        const inn = account.activeCustomerInn ?? account.customers?.[0]?.inn ?? "";
        const forceInn = !!account.isRegisteredUser && !account.accessAllInns && !!inn;
        return {
            login: account.login,
            password: account.password,
            ...((forceInn || account.activeCustomerInn || inn) ? { inn: inn || account.activeCustomerInn || undefined } : {}),
            ...(account.isRegisteredUser ? { isRegisteredUser: true } : {}),
        };
    }, [accounts, activeAccountId]);
    const activeAccount = useMemo(() => {
        if (!activeAccountId) return null;
        return accounts.find(acc => acc.id === activeAccountId) || null;
    }, [accounts, activeAccountId]);

    /** Аккаунты для отображения перевозок (один или несколько). У сотрудников без доступа ко всем заказчикам всегда передаём ИНН — фильтрация по компании. */
    const selectedAuths = useMemo((): AuthData[] => {
        const ids = selectedAccountIds.length > 0
            ? selectedAccountIds
            : (activeAccountId && accounts.some((a) => a.id === activeAccountId) ? [activeAccountId] : []);
        return ids
            .map((id) => accounts.find((acc) => acc.id === id))
            .filter((acc): acc is Account => !!acc)
            .map((acc) => {
                const inn = acc.activeCustomerInn ?? acc.customers?.[0]?.inn ?? "";
                return {
                    login: acc.login,
                    password: acc.password,
                    ...(inn || acc.activeCustomerInn ? { inn: inn || acc.activeCustomerInn || undefined } : {}),
                    ...(acc.isRegisteredUser ? { isRegisteredUser: true } : {}),
                };
            });
    }, [accounts, selectedAccountIds, activeAccountId]);

    // Если выбранных компаний нет, но есть активный аккаунт — подставляем его
    useEffect(() => {
        if (accounts.length > 0 && selectedAccountIds.length === 0 && activeAccountId && accounts.some((a) => a.id === activeAccountId)) {
            setSelectedAccountIds([activeAccountId]);
        }
    }, [accounts.length, activeAccountId, selectedAccountIds.length]);

    // Режим сквозной выборки без жёсткой привязки к ИНН:
    // переключатель доступен только тем, у кого в админке включён «Служебный режим» (service_mode).
    const serviceModeUnlocked = useMemo(() => {
        return !!activeAccount?.isRegisteredUser && activeAccount?.permissions?.service_mode === true;
    }, [activeAccount?.isRegisteredUser, activeAccount?.permissions?.service_mode]);
    useEffect(() => {
        if (!serviceModeUnlocked && useServiceRequest) {
            setUseServiceRequest(false);
        }
    }, [serviceModeUnlocked, useServiceRequest]);
    const [authMethods, setAuthMethods] = useState<AuthMethodsConfig>({
        api_v1: true,
        api_v2: true,
        cms: true,
    });
    useEffect(() => {
        let cancelled = false;
        const loadConfig = async () => {
            try {
                const res = await fetch("/api/auth-config");
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data?.error || "Ошибка загрузки способов авторизации");
                if (cancelled) return;
                const config = data?.config || {};
                setAuthMethods({
                    api_v1: config.api_v1 ?? true,
                    api_v2: config.api_v2 ?? true,
                    cms: config.cms ?? true,
                });
            } catch (err) {
                if (!cancelled) {
                    console.warn("Failed to load auth config", err);
                }
            }
        };
        loadConfig();
        return () => {
            cancelled = true;
        };
    }, []);
    const persistTwoFactorSettings = useCallback(async (account: Account, patch: Partial<Account>) => {
        const login = account.login;
        if (!login) return;
        const enabled = patch.twoFactorEnabled ?? account.twoFactorEnabled ?? false;
        const method = patch.twoFactorMethod ?? account.twoFactorMethod ?? "google";
        const telegramLinked = patch.twoFactorTelegramLinked ?? account.twoFactorTelegramLinked ?? false;
        try {
            await fetch("/api/2fa", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login, enabled, method, telegramLinked })
            });
        } catch {
            // silent: server storage is best-effort
        }
    }, []);

    useEffect(() => {
        if (!activeAccount?.login) return;
        let cancelled = false;
        const load = async () => {
            try {
                const res = await fetch(`/api/2fa?login=${encodeURIComponent(activeAccount.login)}`);
                if (!res.ok) return;
                const data = await res.json();
                const settings = data?.settings;
                if (!settings || cancelled) return;
                setAccounts(prev =>
                    prev.map(acc =>
                                acc.id === activeAccount.id
                            ? {
                                ...acc,
                                twoFactorEnabled: !!settings.enabled,
                                twoFactorMethod: settings.method === "telegram" ? "telegram" : "google",
                                twoFactorTelegramLinked: !!settings.telegramLinked,
                                twoFactorGoogleSecretSet: !!settings.googleSecretSet
                            }
                            : acc
                    )
                );
            } catch {
                // ignore load errors
            }
        };
        load();
        return () => {
            cancelled = true;
        };
    }, [activeAccount?.id, activeAccount?.login]);
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        if (typeof window === "undefined") return "cargo";
        try {
            const url = new URL(window.location.href);
            const t = (url.searchParams.get("tab") || "").toLowerCase();
            if (t === "profile") return "profile";
            if (t === "cargo") return "cargo";
            if (t === "home" || t === "dashboard") return "dashboard";
            if (t === "docs") return "docs";
        } catch {
            // ignore
        }
        // Первый запуск: "Грузы"
        return "cargo";
    });
    const [showDashboard, setShowDashboard] = useState(false);
    const [showPinModal, setShowPinModal] = useState(false);
    const [pinCode, setPinCode] = useState('');
    const [pinError, setPinError] = useState(false);
    const hasRestoredTabRef = React.useRef(false);
    const hasUrlTabOverrideRef = React.useRef(false);

    const updateActiveAccountCustomer = useCallback((customer: string) => {
        if (!activeAccountId || !customer) return;
        setAccounts(prev => {
            const current = prev.find(acc => acc.id === activeAccountId);
            if (!current || current.customer === customer) {
                return prev;
            }
            return prev.map(acc =>
                acc.id === activeAccountId ? { ...acc, customer } : acc
            );
        });
    }, [activeAccountId]);
    
    const openSecretPinModal = () => {
        setShowPinModal(true);
        setPinCode('');
        setPinError(false);
    };
    
    // Проверка пин-кода (для входа и выхода)
    const handlePinSubmit = (e?: FormEvent) => {
        if (e) e.preventDefault();
        if (pinCode === '1984') {
            // Переключаем состояние секретного режима
            if (showDashboard) {
                // Выход из секретного режима
                setShowDashboard(false);
                setActiveTab("cargo");
            } else {
                // Вход в секретный режим
                setShowDashboard(true);
                setActiveTab("dashboard");
            }
            setShowPinModal(false);
            setPinCode('');
            setPinError(false);
        } else {
            setPinError(true);
            setPinCode('');
        }
    }; 
    const [startParam, setStartParam] = useState<string | null>(null);
    const [contextCargoNumber, setContextCargoNumber] = useState<string | null>(null);
    const [overlayCargoNumber, setOverlayCargoNumber] = useState<string | null>(null);
    const [overlayCargoItem, setOverlayCargoItem] = useState<CargoItem | null>(null);
    const [overlayCargoLoading, setOverlayCargoLoading] = useState(false);
    const [overlayFavVersion, setOverlayFavVersion] = useState(0);
    
    // ИНИЦИАЛИЗАЦИЯ ПУСТЫМИ СТРОКАМИ (данные берутся с фронта)
    const [login, setLogin] = useState(""); 
    const [password, setPassword] = useState(""); 
    
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 
    const [twoFactorPending, setTwoFactorPending] = useState(false);
    const [twoFactorCode, setTwoFactorCode] = useState("");
    const [showForgotPage, setShowForgotPage] = useState(() => {
        try {
            if (typeof window === "undefined") return false;
            return new URL(window.location.href).searchParams.get("forgot") === "1";
        } catch {
            return false;
        }
    });
    const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
    const [twoFactorLoading, setTwoFactorLoading] = useState(false);
    const [pendingLogin, setPendingLogin] = useState<{ login: string; loginKey: string; password: string; customer?: string | null; customers?: CustomerOption[]; perevozkiInn?: string } | null>(null);
    
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [debugMenuOpen, setDebugMenuOpen] = useState(false);
    const debugMenuRef = useRef<HTMLDivElement>(null);
    const [searchText, setSearchText] = useState('');
    const [isOfferOpen, setIsOfferOpen] = useState(false);
    const [isPersonalConsentOpen, setIsPersonalConsentOpen] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        document.body.className = `${theme}-mode`;
        try {
            window.localStorage.setItem('haulz.theme', theme);
        } catch {
            // ignore
        }
        // Для MAX всегда белый фон при изменении темы
        if (isMaxWebApp()) {
            const webApp = getWebApp();
            if (webApp && typeof webApp.setBackgroundColor === "function") {
                webApp.setBackgroundColor('#ffffff');
            }
        }
    }, [theme]);

    useEffect(() => {
        if (!debugMenuOpen) return;
        const onOutside = (e: MouseEvent) => {
            if (debugMenuRef.current && !debugMenuRef.current.contains(e.target as Node)) setDebugMenuOpen(false);
        };
        document.addEventListener("click", onOutside);
        return () => document.removeEventListener("click", onOutside);
    }, [debugMenuOpen]);

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
            } else if (param.startsWith('haulz_n_')) {
                // Обработка нашего нового формата: haulz_n_[номер](_c_[chatId])
                const parts = param.split('_');
                const number = parts[2]; // haulz(0)_n(1)_NUMBER(2)
                if (number) {
                    setContextCargoNumber(number);
                    setActiveTab('cargo');
                }
            }
        }
    }, []);

    // Загрузка аккаунтов из localStorage
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            // Если tab задан в URL — не перетираем восстановлением из localStorage
            try {
                const url = new URL(window.location.href);
                const t = (url.searchParams.get("tab") || "").toLowerCase();
                if (t) hasUrlTabOverrideRef.current = true;
            } catch {
                // ignore
            }

            // Загружаем массив аккаунтов (новый формат) — приоритет над haulz.auth
            const savedAccounts = window.localStorage.getItem("haulz.accounts");
            const savedActiveId = window.localStorage.getItem("haulz.activeAccountId");
            const savedTab = window.localStorage.getItem("haulz.lastTab");
            if (savedAccounts) {
                try {
                    let parsedAccounts = JSON.parse(savedAccounts) as Account[];
                    if (Array.isArray(parsedAccounts) && parsedAccounts.length > 0) {
                        // При загрузке: подставить customer по первому заказчику; не доверять inCustomerDirectory из кэша — подтянем с бэкенда
                        parsedAccounts = parsedAccounts.map((acc) => {
                            const withCustomer = acc.customers?.length && !acc.customer ? { ...acc, customer: acc.customers[0].name } : acc;
                            return { ...withCustomer, inCustomerDirectory: undefined as boolean | undefined };
                        });
                        setAccounts(parsedAccounts);
                        if (savedActiveId && parsedAccounts.find(acc => acc.id === savedActiveId)) {
                            setActiveAccountId(savedActiveId);
                        } else {
                            setActiveAccountId(parsedAccounts[0].id);
                        }
                        const savedSelectedIds = window.localStorage.getItem("haulz.selectedAccountIds");
                        let didSetSelected = false;
                        if (savedSelectedIds) {
                            try {
                                const ids = JSON.parse(savedSelectedIds) as string[];
                                if (Array.isArray(ids) && ids.length > 0) {
                                    const valid = ids.filter((id) => parsedAccounts.some((acc) => acc.id === id));
                                    if (valid.length > 0) {
                                        setSelectedAccountIds(valid);
                                        didSetSelected = true;
                                    }
                                }
                            } catch {
                                // ignore
                            }
                        }
                        if (!didSetSelected) {
                            const firstId = (savedActiveId && parsedAccounts.find(acc => acc.id === savedActiveId) ? savedActiveId : parsedAccounts[0].id) ?? null;
                            setSelectedAccountIds(firstId ? [firstId] : []);
                        }
                        // Восстанавливаем последнюю вкладку (без сохранения секретного режима)
                        if (savedTab && !hasUrlTabOverrideRef.current) {
                            const allowed: Tab[] = ["home", "cargo", "profile", "dashboard", "docs"];
                            const t = savedTab as Tab;
                            if (allowed.includes(t)) {
                                if (t === "docs") {
                                    setActiveTab("docs");
                                } else if (t === "home") {
                                    setActiveTab("dashboard");
                                } else {
                                    setActiveTab(t);
                                }
                            }
                        }
                        hasRestoredTabRef.current = true;
                    }
                } catch {
                    // Игнорируем ошибки парсинга
                }
            }
            // Если нет сохранённых аккаунтов — миграция со старого формата haulz.auth
            if (!savedAccounts) {
                const saved = window.localStorage.getItem("haulz.auth");
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved) as AuthData;
                        if (parsed?.login && parsed?.password) {
                            const accountId = parsed.id || `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                            const account: Account = { login: parsed.login, password: parsed.password, id: accountId };
                            setAccounts([account]);
                            setActiveAccountId(accountId);
                            setSelectedAccountIds([accountId]);
                        }
                    } catch {
                        // ignore
                    }
                }
            }
        } catch {
            // игнорируем ошибки чтения
        }
    }, []);

    // Сохраняем последнюю вкладку, чтобы при следующем запуске открыть на ней
    useEffect(() => {
        if (!hasRestoredTabRef.current) return;
        try {
            window.localStorage.setItem("haulz.lastTab", activeTab);
        } catch {
            // игнорируем ошибки записи
        }
    }, [activeTab]);

    // Синхронизируем URL. Не трогаем ?tab=cms — это админка.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const url = new URL(window.location.href);
            const tabInUrl = url.searchParams.get("tab");
            if (tabInUrl === "cms") return; // админка — URL не меняем
            url.searchParams.delete("tab");
            window.history.replaceState(null, "", url.toString());
        } catch {
            // ignore
        }
    }, [activeTab]);
    
    // Сохранение аккаунтов и выбранных компаний в localStorage
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        try {
            window.localStorage.setItem("haulz.accounts", JSON.stringify(accounts));
            if (activeAccountId) {
                window.localStorage.setItem("haulz.activeAccountId", activeAccountId);
            }
            if (selectedAccountIds.length > 0) {
                window.localStorage.setItem("haulz.selectedAccountIds", JSON.stringify(selectedAccountIds));
            }
        } catch {
            // игнорируем ошибки записи
        }
    }, [accounts, activeAccountId, selectedAccountIds]);

    // Подтянуть данные зарегистрированного пользователя с бэкенда (в т.ч. inCustomerDirectory из справочника заказчиков в БД)
    useEffect(() => {
        if (typeof window === "undefined" || accounts.length === 0) return;
        const needRefresh = accounts.filter(
            (acc) =>
                acc.isRegisteredUser &&
                acc.password &&
                (!acc.customers?.length || !acc.activeCustomerInn || acc.inCustomerDirectory === undefined)
        );
        if (needRefresh.length === 0) return;
        let cancelled = false;
        (async () => {
            const updates: { id: string; customers: CustomerOption[]; activeCustomerInn: string | null; customer: string | null; accessAllInns: boolean; inCustomerDirectory?: boolean; permissions?: Record<string, boolean>; financialAccess?: boolean }[] = [];
            for (const acc of needRefresh) {
                try {
                    const res = await fetch("/api/auth-registered-login", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: acc.login.trim().toLowerCase(), password: acc.password }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (cancelled || !res.ok || !data?.ok || !data?.user) continue;
                    const u = data.user;
                    const customers: CustomerOption[] = u.inn ? [{ name: u.companyName || u.inn, inn: u.inn }] : [];
                    updates.push({
                        id: acc.id,
                        customers,
                        activeCustomerInn: u.inn ?? null,
                        customer: u.companyName ?? null,
                        accessAllInns: !!u.accessAllInns,
                        inCustomerDirectory: !!u.inCustomerDirectory,
                        permissions: u.permissions,
                        financialAccess: u.financialAccess,
                    });
                } catch {
                    // ignore
                }
            }
            if (cancelled || updates.length === 0) return;
            setAccounts((prev) =>
                prev.map((a) => {
                    const up = updates.find((u) => u.id === a.id);
                    if (!up) return a;
                    const hadCustomers = (a.customers?.length ?? 0) > 0;
                    return {
                        ...a,
                        customers: hadCustomers ? (a.customers ?? up.customers) : up.customers,
                        // Не перезаписывать activeCustomerInn, если пользователь уже выбрал компанию в шапке (CustomerSwitcher)
                        activeCustomerInn: a.activeCustomerInn ?? up.activeCustomerInn ?? undefined,
                        customer: hadCustomers ? (a.customer ?? up.customer ?? undefined) : (up.customer ?? undefined),
                        accessAllInns: up.accessAllInns,
                        inCustomerDirectory: up.inCustomerDirectory,
                        ...(up.permissions != null ? { permissions: up.permissions } : {}),
                        ...(up.financialAccess != null ? { financialAccess: up.financialAccess } : {}),
                    };
                })
            );
        })();
        return () => { cancelled = true; };
    }, [accounts]);
    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const handleSearch = (text: string) => setSearchText(text.toLowerCase().trim());

    const MAX_SUPPORT_BOT_URL = "https://max.ru/id9706037094_bot";
    const TG_SUPPORT_BOT_URL = "https://t.me/HAULZinfobot";

    const openExternalLink = (url: string) => {
        const webApp = getWebApp();
        if (webApp && typeof (webApp as any).openLink === "function") {
            (webApp as any).openLink(url);
        } else {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    const openTelegramBotWithAccount = async () => {
        const url = new URL(TG_SUPPORT_BOT_URL);
        const webApp = getWebApp();
        if (webApp && typeof webApp.openTelegramLink === "function") {
            webApp.openTelegramLink(url.toString());
        } else {
            openExternalLink(url.toString());
        }
    };

    const openMaxBotWithAccount = async () => {
        const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
        if (!activeAccount) {
            throw new Error("Сначала выберите компанию.");
        }
        const res = await fetch("/api/max-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                customer: activeAccount.customer || null,
                inn: activeAccount.activeCustomerInn ?? null,
                accountId: activeAccount.id,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.token) {
            throw new Error(data?.error || "Не удалось создать ссылку для MAX.");
        }
        // По доке MAX диплинк бота: https://max.ru/<botName>?start=<payload> (именно start, не startapp)
        const url = new URL(MAX_SUPPORT_BOT_URL);
        url.searchParams.set("start", `haulz_auth_${data.token}`);
        openMaxBotLink(url.toString());
    };

    const openMaxBotLink = (url: string) => {
        const webApp = getWebApp();
        const isMobile = typeof window !== "undefined" && (window.innerWidth < 768 || /Android|iPhone|iPad/i.test(navigator.userAgent || ""));
        // Сначала пробуем Bridge.openLink (в MAX может передать ссылку в приложение)
        if (webApp && typeof webApp.openLink === "function") {
            try {
                webApp.openLink(url);
            } catch (e) {
                console.warn("[openMaxBotLink] openLink failed:", e);
            }
        }
        // На телефоне openLink часто не срабатывает — через 100 мс пробуем открыть в этом же окне (уход из мини-аппа на диплинк)
        if (isMobile) {
            setTimeout(() => {
                const w = window.open(url, "_blank", "noopener,noreferrer");
                if (!w || w.closed) window.location.href = url;
            }, 100);
            return;
        }
        if (!webApp || typeof webApp.openLink !== "function") {
            window.open(url, "_blank", "noopener,noreferrer");
        }
    };

    const openAiChatDeepLink = (cargoNumber?: string) => {
        if (typeof window !== "undefined" && cargoNumber) {
            window.sessionStorage.setItem(
                "haulz.chat.prefill",
                `Интересует информация по перевозке номер ${cargoNumber}`
            );
            if (activeAccount?.login && activeAccount?.password) {
                const inn = activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
                fetch(PROXY_API_GETPEREVOZKA_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        login: activeAccount.login,
                        password: activeAccount.password,
                        number: cargoNumber,
                        ...(inn ? { inn } : {}),
                        ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
                    }),
                })
                    .then((r) => r.json())
                    .then((data) => {
                        try {
                            window.sessionStorage.setItem("haulz.chat.cargoPreload", JSON.stringify(data));
                        } catch (_) {}
                    })
                    .catch(() => {});
            }
        }
        setActiveTab("cargo");
    };

    const openCargoFromChat = (cargoNumber: string) => {
        if (!cargoNumber) return;
        const num = String(cargoNumber).trim();
        setSearchText(num);
        handleSearch(num);
        setContextCargoNumber(num);
        setActiveTab("cargo");
    };

    const [overlayCargoInn, setOverlayCargoInn] = useState<string | null>(null);

    const openCargoInPlace = (cargoNumber: string, inn?: string) => {
        if (!cargoNumber) return;
        setOverlayCargoNumber(cargoNumber);
        setOverlayCargoItem(null);
        setOverlayCargoInn(inn ?? null);
    };

    useEffect(() => {
        if (!overlayCargoNumber || !activeAccount?.login || !activeAccount?.password) {
            if (!overlayCargoNumber) {
                setOverlayCargoItem(null);
                setOverlayCargoInn(null);
            }
            return;
        }
        let cancelled = false;
        setOverlayCargoLoading(true);
        const inn = overlayCargoInn ?? activeAccount.activeCustomerInn ?? activeAccount.customers?.[0]?.inn ?? undefined;
        const numberRaw = String(overlayCargoNumber).replace(/^0+/, '') || overlayCargoNumber;
        const numberForApi = /^\d{5,9}$/.test(numberRaw) ? numberRaw.padStart(9, '0') : overlayCargoNumber;
        fetch(PROXY_API_GETPEREVOZKA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                login: activeAccount.login,
                password: activeAccount.password,
                number: numberForApi,
                ...(inn ? { inn } : {}),
                ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}),
            }),
        })
            .then((r) => r.json())
            .then((data) => {
                if (cancelled) return;
                const raw = Array.isArray(data) ? data[0] : data;
                const statuses = raw?.Statuses ?? raw?.statuses;
                const lastStatus = Array.isArray(statuses) && statuses.length > 0 ? statuses[statuses.length - 1] : null;
                const stateFromStatuses = lastStatus?.Status ?? lastStatus?.status ?? null;
                const item: CargoItem = raw ? {
                    ...raw,
                    Number: raw?.Number ?? raw?.number ?? overlayCargoNumber,
                    DatePrih: raw?.DatePrih ?? raw?.datePrih,
                    DateVr: raw?.DateVr ?? raw?.dateVr,
                    State: raw?.State ?? raw?.state ?? stateFromStatuses ?? undefined,
                    Mest: raw?.Mest ?? raw?.mest,
                    PW: raw?.PW ?? raw?.pw,
                    W: raw?.W ?? raw?.w,
                    Value: raw?.Value ?? raw?.value,
                    Sum: raw?.Sum ?? raw?.sum,
                    StateBill: raw?.StateBill ?? raw?.stateBill,
                    Sender: raw?.Sender ?? raw?.sender,
                    Customer: raw?.Customer ?? raw?.customer,
                    Receiver: raw?.Receiver ?? raw?.receiver,
                    _role: 'Customer',
                } : { Number: overlayCargoNumber, _role: 'Customer' as PerevozkiRole };
                setOverlayCargoItem(item);
            })
            .catch(() => { if (!cancelled) setOverlayCargoItem(null); })
            .finally(() => { if (!cancelled) setOverlayCargoLoading(false); });
        return () => { cancelled = true; };
    }, [overlayCargoNumber, overlayCargoInn, activeAccount?.login, activeAccount?.password, activeAccount?.activeCustomerInn, activeAccount?.customers]);

    const openCargoWithFilters = (filters: { status?: StatusFilter; search?: string }) => {
        if (filters.search) {
            setSearchText(filters.search);
            handleSearch(filters.search);
        }
        setActiveTab("cargo");
    };
    const chatIdentity = (() => {
        const webApp = getWebApp();
        const userId = webApp?.initDataUnsafe?.user?.id;
        const chatId = webApp?.initDataUnsafe?.chat?.id;
        if (userId) return String(userId);
        if (chatId) return String(chatId);
        return null;
    })();

    const upsertRegisteredAccount = (user: any, loginKey: string, password: string): string => {
        const customers: CustomerOption[] = user.inn ? [{ name: user.companyName || user.inn, inn: user.inn }] : [];
        const existingAccount = accounts.find(acc => acc.login === loginKey);
        const normalizedPermissions =
            user.permissions && typeof user.permissions === "object"
                ? user.permissions
                : {
                    cargo: true,
                    doc_invoices: true,
                    doc_acts: true,
                    doc_orders: false,
                    doc_claims: false,
                    doc_contracts: false,
                    doc_acts_settlement: false,
                    doc_tariffs: false,
                    haulz: false,
                    chat: true,
                };

        if (existingAccount) {
            setAccounts(prev =>
                prev.map(acc =>
                    acc.id === existingAccount.id
                        ? {
                            ...acc,
                            password,
                            customers,
                            // Не перезаписывать activeCustomerInn, если пользователь уже выбрал компанию
                            activeCustomerInn: acc.activeCustomerInn ?? user.inn ?? undefined,
                            customer: user.companyName ?? acc.customer,
                            isRegisteredUser: true,
                            permissions: normalizedPermissions,
                            financialAccess: user.financialAccess ?? acc.financialAccess,
                        }
                        : acc
                )
            );
            return existingAccount.id;
        }

        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
            login: loginKey,
            password,
            id: accountId,
            customers,
            activeCustomerInn: user.inn ?? undefined,
            customer: user.companyName ?? undefined,
            isRegisteredUser: true,
            permissions: normalizedPermissions,
            financialAccess: user.financialAccess ?? false,
        };
        setAccounts(prev => [...prev, newAccount]);
        return accountId;
    };

    const handleLoginSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        setTwoFactorError(null);
        if (!login || !password) return setError("Введите логин и пароль");
        if (!agreeOffer || !agreePersonal) return setError("Подтвердите согласие с условиями");
        if (!authMethods.cms && !authMethods.api_v2 && !authMethods.api_v1) {
            setError("Недоступны способы авторизации");
            return;
        }

        try {
            setLoading(true);
            const loginKey = login.trim().toLowerCase();

            const attemptCmsAuth = async (): Promise<true | string> => {
                const regRes = await fetch("/api/auth-registered-login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: loginKey, password }),
                });
                const regData = await regRes.json().catch(() => ({}));
                if (!regRes.ok) {
                    return (typeof regData?.error === "string" ? regData.error : null) || "Неверный email или пароль";
                }
                if (regData?.ok && regData?.user) {
                    const u = regData.user;
                    const existingAccount = accounts.find((acc) => acc.login === loginKey);
                    const customers: CustomerOption[] = u.inn ? [{ name: u.companyName || u.inn, inn: u.inn }] : [];
                    const accessAllInns = !!u.accessAllInns;
                    if (existingAccount) {
                        setAccounts((prev) =>
                            prev.map((acc) =>
                                acc.id === existingAccount.id
                                    ? { ...acc, password, customers, activeCustomerInn: acc.activeCustomerInn ?? u.inn, customer: u.companyName, isRegisteredUser: true, accessAllInns, inCustomerDirectory: !!u.inCustomerDirectory, permissions: u.permissions, financialAccess: u.financialAccess }
                                    : acc
                            )
                        );
                        setActiveAccountId(existingAccount.id);
                    } else {
                        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                        const newAccount: Account = {
                            login: loginKey,
                            password,
                            id: accountId,
                            customers,
                            activeCustomerInn: u.inn,
                            customer: u.companyName,
                            isRegisteredUser: true,
                            accessAllInns,
                            inCustomerDirectory: !!u.inCustomerDirectory,
                            permissions: u.permissions,
                            financialAccess: u.financialAccess,
                        };
                        setAccounts((prev) => [...prev, newAccount]);
                        setActiveAccountId(accountId);
                    }
                    setActiveTab((prev) => prev || "cargo");
                    return true;
                }
                return "Неверный email или пароль";
            };

            const attemptApiV2Auth = async (): Promise<boolean> => {
                const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, password }),
                });
                if (!customersRes.ok) return false;
                const customersData = await customersRes.json().catch(() => ({}));
                const rawList = Array.isArray(customersData?.customers)
                    ? customersData.customers
                    : Array.isArray(customersData?.Customers)
                        ? customersData.Customers
                        : [];
                const customers: CustomerOption[] = dedupeCustomersByInn(
                    rawList
                        .map((c: any) => ({
                            name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                            inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                        }))
                        .filter((c: CustomerOption) => c.inn.length > 0)
                );
                if (customers.length === 0) return false;
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                if (alreadyAdded) {
                    setError("Компания уже в списке");
                    return true;
                }
                const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
                const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
                const twoFaSettings = twoFaJson?.settings;
                const twoFaEnabled = !!twoFaSettings?.enabled;
                const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
                const twoFaLinked = !!twoFaSettings?.telegramLinked;
                const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
                if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                    const sendRes = await fetch("/api/2fa-telegram", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ login: loginKey, action: "send" }),
                    });
                    if (!sendRes.ok) {
                        const err = await readJsonOrText(sendRes);
                        throw new Error(err?.error || "Не удалось отправить код");
                    }
                    setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "telegram" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                    setPendingLogin({ login, password, customer: undefined, loginKey, customers, twoFaMethod: "google" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                const existingAccount = accounts.find((acc) => acc.login === login);
                const firstCustomer = customers[0];
                const firstInn = firstCustomer.inn;
                const firstName = firstCustomer.name;
                if (existingAccount) {
                    setAccounts((prev) =>
                        prev.map((acc) =>
                            acc.id === existingAccount.id
                                ? { ...acc, customers, activeCustomerInn: firstInn, customer: firstName }
                                : acc
                        )
                    );
                    setActiveAccountId(existingAccount.id);
                } else {
                    const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: firstInn, customer: firstName };
                    setAccounts((prev) => [...prev, newAccount]);
                    setActiveAccountId(accountId);
                }
                setActiveTab((prev) => prev || "cargo");
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers }),
                })
                    .then((r) => r.json())
                    .then((data) => {
                        if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning);
                    })
                    .catch((err) => console.warn("companies-save error:", err));
                return true;
            };

            const attemptApiV1Auth = async (): Promise<boolean> => {
                const { dateFrom, dateTo } = getDateRange("все");
                const res = await fetch(PROXY_API_BASE_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login, password, dateFrom, dateTo }),
                });
                await ensureOk(res, "Ошибка авторизации");
                const payload = await readJsonOrText(res);
                const detectedCustomer = extractCustomerFromPerevozki(payload);
                const detectedInn = extractInnFromPerevozki(payload);
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                if (detectedInn && existingInns.has(detectedInn)) {
                    setError("Компания уже в списке");
                    return true;
                }
                const twoFaRes = await fetch(`/api/2fa?login=${encodeURIComponent(loginKey)}`);
                const twoFaJson = twoFaRes.ok ? await twoFaRes.json() : null;
                const twoFaSettings = twoFaJson?.settings;
                const twoFaEnabled = !!twoFaSettings?.enabled;
                const twoFaMethod = twoFaSettings?.method === "telegram" ? "telegram" : "google";
                const twoFaLinked = !!twoFaSettings?.telegramLinked;
                const twoFaGoogleSecretSet = !!twoFaSettings?.googleSecretSet;
                if (twoFaEnabled && twoFaMethod === "telegram" && twoFaLinked) {
                    const sendRes = await fetch("/api/2fa-telegram", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ login: loginKey, action: "send" }),
                    });
                    if (!sendRes.ok) {
                        const err = await readJsonOrText(sendRes);
                        throw new Error(err?.error || "Не удалось отправить код");
                    }
                    setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "telegram" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                if (twoFaEnabled && twoFaMethod === "google" && twoFaGoogleSecretSet) {
                    setPendingLogin({ login, password, customer: detectedCustomer, loginKey, perevozkiInn: detectedInn ?? undefined, twoFaMethod: "google" });
                    setTwoFactorPending(true);
                    setTwoFactorCode("");
                    return true;
                }
                const existingAccount = accounts.find((acc) => acc.login === login);
                let accountId: string;
                if (existingAccount) {
                    accountId = existingAccount.id;
                    if (detectedCustomer && existingAccount.customer !== detectedCustomer) {
                        setAccounts((prev) =>
                            prev.map((acc) =>
                                acc.id === existingAccount.id
                                    ? { ...acc, customer: detectedCustomer }
                                    : acc
                            )
                        );
                    }
                    setActiveAccountId(accountId);
                } else {
                    accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const newAccount: Account = {
                        login,
                        password,
                        id: accountId,
                        customer: detectedCustomer || undefined,
                        ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
                    };
                    setAccounts((prev) => [...prev, newAccount]);
                    setActiveAccountId(accountId);
                }
                const companyInn = detectedInn ?? "";
                const companyName = detectedCustomer || login.trim() || "Компания";
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
                }).catch(() => {});
                setActiveTab((prev) => prev || "cargo");
                return true;
            };

            let lastError = "Неверный логин или пароль";
            if (authMethods.cms) {
                const cmsResult = await attemptCmsAuth();
                if (cmsResult === true) return;
                lastError = cmsResult;
            }
            if (authMethods.api_v2 && (await attemptApiV2Auth())) return;
            if (authMethods.api_v1 && (await attemptApiV1Auth())) return;
            setError(lastError);
        } catch (err: any) {
            const raw = err?.message || "Ошибка сети.";
            const message = extractErrorMessage(raw) || (typeof raw === "string" ? raw : "Ошибка сети.");
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleTwoFactorSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setTwoFactorError(null);
        if (!pendingLogin?.loginKey || !twoFactorCode.trim()) {
            setTwoFactorError(pendingLogin?.twoFaMethod === "google" ? "Введите код из приложения." : "Введите код из Telegram.");
            return;
        }
        try {
            setTwoFactorLoading(true);
            const isGoogle = pendingLogin.twoFaMethod === "google";
            const res = await fetch(isGoogle ? "/api/2fa-google" : "/api/2fa-telegram", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(
                    isGoogle
                        ? { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                        : { login: pendingLogin.loginKey, action: "verify", code: twoFactorCode.trim() }
                ),
            });
            if (!res.ok) {
                const err = await readJsonOrText(res);
                throw new Error(err?.error || "Неверный код");
            }

            const detectedCustomer = pendingLogin.customer;
            const customers = pendingLogin.customers;
            const firstInn = customers?.length ? customers[0].inn : undefined;
            const existingAccount = accounts.find(acc => acc.login === pendingLogin.login);
            let accountId: string;
            const firstCustomerName = customers?.length ? customers[0].name : undefined;
            if (existingAccount) {
                accountId = existingAccount.id;
                setAccounts(prev =>
                    prev.map(acc =>
                        acc.id === existingAccount.id
                            ? {
                                ...acc,
                                ...(detectedCustomer && acc.customer !== detectedCustomer ? { customer: detectedCustomer } : {}),
                                ...(customers?.length ? { customers, activeCustomerInn: firstInn, customer: firstCustomerName ?? acc.customer } : {}),
                            }
                            : acc
                    )
                );
                setActiveAccountId(accountId);
            } else {
                accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = {
                    login: pendingLogin.login,
                    password: pendingLogin.password,
                    id: accountId,
                    customer: firstCustomerName ?? detectedCustomer ?? undefined,
                    ...(customers?.length ? { customers, activeCustomerInn: firstInn } : {}),
                };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
            }
            const loginKeyToSave = pendingLogin.loginKey;
            const customersToSave = pendingLogin.customers;
            const loginDisplay = pendingLogin.login?.trim() || "";

            setActiveTab((prev) => prev || "cargo");
            setTwoFactorPending(false);
            setPendingLogin(null);
            setTwoFactorCode("");

            if (customersToSave?.length) {
                // Способ 2 (Getcustomers): сохраняем список заказчиков в БД
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: customersToSave }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
            } else {
                // Способ 1 (GetPerevozki): одна компания с ИНН из ответа API
                const perevozkiInn = pendingLogin.perevozkiInn ?? "";
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKeyToSave, customers: [{ name: (detectedCustomer ?? loginDisplay) || "Компания", inn: perevozkiInn }] }),
                }).catch(() => {});
            }
        } catch (err: any) {
            setTwoFactorError(err?.message || "Неверный код");
        } finally {
            setTwoFactorLoading(false);
        }
    };

    const handleLogout = () => {
        setAccounts([]);
        setActiveAccountId(null);
        setActiveTab("cargo");
        setPassword(""); 
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem("haulz.auth");
                window.localStorage.removeItem("haulz.accounts");
                window.localStorage.removeItem("haulz.activeAccountId");
            } catch {
                // игнорируем ошибки удаления
            }
        }
        setIsSearchExpanded(false); setSearchText('');
    }
    
    // Удаление аккаунта
    const handleRemoveAccount = (accountId: string) => {
        const newAccounts = accounts.filter(acc => acc.id !== accountId);
        setAccounts(newAccounts);
        setSelectedAccountIds((prev) => {
            const next = prev.filter((id) => id !== accountId);
            if (next.length === 0 && newAccounts.length > 0) return [newAccounts[0].id];
            return next;
        });
        if (activeAccountId === accountId) {
            if (newAccounts.length > 0) {
                setActiveAccountId(newAccounts[0].id);
            } else {
                setActiveAccountId(null);
                setActiveTab("cargo");
            }
        }
    };
    
    // Переключение аккаунта (одна компания — подставляем как единственную выбранную)
    const handleSwitchAccount = (accountId: string) => {
        setActiveAccountId(accountId);
        setSelectedAccountIds([accountId]);
    };

    // Подключить/отключить компанию в мультивыборе (для списка перевозок)
    const handleToggleSelectedAccount = (accountId: string) => {
        setSelectedAccountIds((prev) => {
            const has = prev.includes(accountId);
            if (has) {
                if (prev.length <= 1) return prev;
                const next = prev.filter((id) => id !== accountId);
                setActiveAccountId(next[0] ?? null);
                return next;
            }
            const next = [...prev, accountId];
            if (prev.length === 0) setActiveAccountId(accountId);
            return next;
        });
    };


    // Обновление полей аккаунта (например, 2FA настройки)
    const handleUpdateAccount = (accountId: string, patch: Partial<Account>) => {
        let target: Account | null = null;
        setAccounts(prev => {
            const next = prev.map(acc => acc.id === accountId ? { ...acc, ...patch } : acc);
            target = next.find(acc => acc.id === accountId) || null;
            return next;
        });
        if (target && ("twoFactorEnabled" in patch || "twoFactorMethod" in patch || "twoFactorTelegramLinked" in patch)) {
            void persistTwoFactorSettings(target, patch);
        }
    };
    
    const handleAddAccount = async (login: string, password: string) => {
        if (accounts.find(acc => acc.login === login)) {
            throw new Error("Аккаунт с таким логином уже добавлен");
        }

        const loginKey = login.trim().toLowerCase();

        // Сначала пробуем способ 2 (Getcustomers)
        const customersRes = await fetch(PROXY_API_GETCUSTOMERS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });
        if (customersRes.ok) {
            const customersData = await customersRes.json().catch(() => ({}));
            const rawList = Array.isArray(customersData?.customers) ? customersData.customers : Array.isArray(customersData?.Customers) ? customersData.Customers : [];
            const customers: CustomerOption[] = dedupeCustomersByInn(
                rawList.map((c: any) => ({
                    name: String(c?.name ?? c?.Name ?? "").trim() || String(c?.Inn ?? c?.inn ?? ""),
                    inn: String(c?.inn ?? c?.INN ?? c?.Inn ?? "").trim(),
                })).filter((c: CustomerOption) => c.inn.length > 0)
            );
            if (customers.length > 0) {
                const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
                const alreadyAdded = customers.find((c) => c.inn && existingInns.has(c.inn));
                if (alreadyAdded) {
                    throw new Error("Компания уже в списке");
                }
                const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const newAccount: Account = { login, password, id: accountId, customers, activeCustomerInn: customers[0].inn, customer: customers[0].name };
                setAccounts(prev => [...prev, newAccount]);
                setActiveAccountId(accountId);
                fetch("/api/companies-save", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ login: loginKey, customers }),
                })
                    .then((r) => r.json())
                    .then((data) => { if (data?.saved !== undefined && data.saved === 0 && data.warning) console.warn("companies-save:", data.warning); })
                    .catch((err) => console.warn("companies-save error:", err));
                return;
            }
        }

        // Способ 1 (GetPerevozki)
        const { dateFrom, dateTo } = getDateRange("все");
        const res = await fetch(PROXY_API_BASE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password, dateFrom, dateTo }),
        });
        if (!res.ok) {
            let message = `Ошибка авторизации`;
            try {
                const payload = await readJsonOrText(res);
                const extracted = extractErrorMessage(payload);
                if (extracted) message = extracted;
            } catch { }
            throw new Error(message);
        }
        const payload = await readJsonOrText(res);
        const detectedCustomer = extractCustomerFromPerevozki(payload);
        const detectedInn = extractInnFromPerevozki(payload);
        const existingInns = await getExistingInns(accounts.map((a) => (typeof a.login === "string" ? a.login.trim().toLowerCase() : "")).filter(Boolean));
        if (detectedInn && existingInns.has(detectedInn)) {
            throw new Error("Компания уже в списке");
        }
        const accountId = `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const newAccount: Account = {
            login,
            password,
            id: accountId,
            customer: detectedCustomer || undefined,
            ...(detectedInn ? { activeCustomerInn: detectedInn } : {}),
        };
        setAccounts(prev => [...prev, newAccount]);
        setActiveAccountId(accountId);
        const companyInn = detectedInn ?? "";
        const companyName = detectedCustomer || login.trim() || "Компания";
        fetch("/api/companies-save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login: loginKey, customers: [{ name: companyName, inn: companyInn }] }),
        }).catch(() => {});
    };

    // 404 для неизвестного path (не "/", "/admin", "/cms")
    if (typeof window !== "undefined" && shouldShowNotFound()) {
        return <NotFoundPage onGoHome={() => { window.location.href = "/"; }} />;
    }

    // Админка: постоянные ссылки /admin, /cms или ?tab=cms
    const isCmsStandalone =
        typeof window !== "undefined" &&
        (new URL(window.location.href).searchParams.get("tab") === "cms" ||
            /^\/(admin|cms)\/?$/i.test(window.location.pathname));
    if (isCmsStandalone) {
        return <CMSStandalonePage />;
    }

    if (!auth && showForgotPage) {
        return (
            <ForgotPasswordPage
                initialEmail={login}
                onBackToLogin={() => {
                    setShowForgotPage(false);
                    try {
                        const u = new URL(window.location.href);
                        u.searchParams.delete("forgot");
                        window.history.replaceState(null, "", u.toString());
                    } catch {
                        // ignore
                    }
                }}
            />
        );
    }

    if (!auth) {
        return (
            <>
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
                    {twoFactorPending ? (
                        <form onSubmit={handleTwoFactorSubmit} className="form">
                            <Typography.Body style={{ marginBottom: '0.75rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                {pendingLogin?.twoFaMethod === "google" ? "Введите 6-значный код из приложения" : "Введите код из Telegram"}
                            </Typography.Body>
                            <div className="field">
                                <Input
                                    className="login-input"
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder={pendingLogin?.twoFaMethod === "google" ? "000000" : "Код подтверждения"}
                                    value={twoFactorCode}
                                    onChange={(e) => setTwoFactorCode(pendingLogin?.twoFaMethod === "google" ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value)}
                                />
                            </div>
                            <Button className="button-primary" type="submit" disabled={twoFactorLoading}>
                                {twoFactorLoading ? <Loader2 className="animate-spin w-5 h-5" /> : "Подтвердить код"}
                            </Button>
                            <Flex justify="center" style={{ marginTop: '0.75rem', gap: '0.5rem' }}>
                                {pendingLogin?.twoFaMethod === "telegram" && (
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={async () => {
                                        if (!pendingLogin?.loginKey) return;
                                        try {
                                            setTwoFactorError(null);
                                            setTwoFactorLoading(true);
                                            const resend = await fetch("/api/2fa-telegram", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({ login: pendingLogin.loginKey, action: "send" }),
                                            });
                                            if (!resend.ok) {
                                                const err = await readJsonOrText(resend);
                                                throw new Error(err?.error || "Не удалось отправить код");
                                            }
                                        } catch (err: any) {
                                            setTwoFactorError(err?.message || "Не удалось отправить код");
                                        } finally {
                                            setTwoFactorLoading(false);
                                        }
                                    }}
                                >
                                    Отправить код еще раз
                                </Button>
                                )}
                                <Button
                                    type="button"
                                    className="filter-button"
                                    disabled={twoFactorLoading}
                                    onClick={() => {
                                        setTwoFactorPending(false);
                                        setPendingLogin(null);
                                        setTwoFactorCode("");
                                    }}
                                >
                                    Назад
                                </Button>
                            </Flex>
                            {twoFactorError && (
                                <Flex align="center" className="login-error mt-4">
                                    <AlertTriangle className="w-5 h-5 mr-2" />
                                    <Typography.Body>{twoFactorError}</Typography.Body>
                                </Flex>
                            )}
                        </form>
                    ) : (
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
                                <button
                                    type="button"
                                    style={{
                                        color: 'var(--color-primary-blue)',
                                        cursor: 'pointer',
                                        textDecoration: 'underline',
                                        fontSize: '0.9rem',
                                        background: 'none',
                                        border: 'none',
                                        padding: 0,
                                    }}
                                    onClick={() => {
                                        setShowForgotPage(true);
                                        try {
                                            const u = new URL(window.location.href);
                                            u.searchParams.set('forgot', '1');
                                            window.history.pushState(null, '', u.toString());
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                >
                                    Забыли пароль?
                                </button>
                            </Flex>
                        </form>
                    )}
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
            </>
        );
    }

    return (
        <>
            <Container className={`app-container`}>
            <header className="app-header">
                    <Flex align="center" justify="space-between" className="header-top-row">
                    <Flex align="center" className="header-auth-info" style={{ position: 'relative', gap: '0.5rem', flexWrap: 'wrap' }}>
                        {!useServiceRequest && activeAccountId && activeAccount && (
                            <CustomerSwitcher
                                accounts={accounts}
                                activeAccountId={activeAccountId}
                                onSwitchAccount={handleSwitchAccount}
                                onUpdateAccount={handleUpdateAccount}
                            />
                        )}
                        {serviceModeUnlocked && (
                            <Flex align="center" gap="0.35rem" style={{ flexShrink: 0 }}>
                                <Typography.Label style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>Служ.</Typography.Label>
                                <span className="roles-switch-wrap" onClick={(e) => e.stopPropagation()}>
                                    <TapSwitch
                                        checked={useServiceRequest}
                                        onToggle={() => setUseServiceRequest(v => !v)}
                                    />
                                </span>
                                {useServiceRequest && (
                                    <Button
                                        className="search-toggle-button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setServiceRefreshSpinning(true);
                                            window.setTimeout(() => setServiceRefreshSpinning(false), 1500);
                                            window.dispatchEvent(new CustomEvent('haulz-service-refresh'));
                                        }}
                                        title="Обновить данные"
                                        aria-label="Обновить данные"
                                        disabled={serviceRefreshSpinning}
                                    >
                                        {serviceRefreshSpinning ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <RefreshCw className="w-4 h-4" />
                                        )}
                                    </Button>
                                )}
                            </Flex>
                        )}
                    </Flex>
                    <Flex align="center" className="space-x-3">
                        {typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug") && (
                            <div ref={debugMenuRef} style={{ position: "relative" }}>
                                <Button
                                    type="button"
                                    className="search-toggle-button"
                                    onClick={(e) => { e.stopPropagation(); setDebugMenuOpen((v) => !v); }}
                                    title="Меню отладки"
                                    aria-label="Меню отладки"
                                    aria-expanded={debugMenuOpen}
                                >
                                    <Settings className="w-5 h-5" />
                                </Button>
                                {debugMenuOpen && (
                                    <div
                                        className="filter-dropdown"
                                        role="menu"
                                        style={{
                                            position: "absolute",
                                            right: 0,
                                            top: "100%",
                                            marginTop: "0.25rem",
                                            minWidth: "200px",
                                            padding: "0.5rem 0",
                                            background: "var(--color-bg-elevated, #fff)",
                                            border: "1px solid var(--color-border, #e5e7eb)",
                                            borderRadius: "0.5rem",
                                            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                            zIndex: 1000,
                                        }}
                                    >
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={() => { window.location.reload(); }}
                                        >
                                            Обновить страницу
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={() => {
                                                try {
                                                    ["haulz.accounts", "haulz.activeAccountId", "haulz.selectedAccountIds", "haulz.auth", "haulz.dateFilterState", "haulz.theme", "haulz.favorites", "haulz.cargo.tableMode", "haulz.docs.tableMode", "haulz.docs.section"].forEach((k) => window.localStorage.removeItem(k));
                                                } catch { /* ignore */ }
                                                window.location.reload();
                                            }}
                                        >
                                            Очистить данные и обновить
                                        </button>
                                        <button
                                            type="button"
                                            role="menuitem"
                                            style={{ display: "block", width: "100%", padding: "0.5rem 0.75rem", textAlign: "left", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                            onClick={async () => {
                                                const info = {
                                                    url: window.location.href,
                                                    userAgent: navigator.userAgent,
                                                    localStorageKeys: Object.keys(window.localStorage).filter((k) => k.startsWith("haulz.")),
                                                };
                                                try {
                                                    await navigator.clipboard.writeText(JSON.stringify(info, null, 2));
                                                    setDebugMenuOpen(false);
                                                } catch { /* ignore */ }
                                            }}
                                        >
                                            Копировать инфо для отладки
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
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
                    <AppRuntimeProvider
                        value={{
                            useServiceRequest,
                            searchText,
                            activeInn: activeAccount?.activeCustomerInn ?? auth?.inn ?? "",
                        }}
                    >
                        <AppMainContent
                            showDashboard={showDashboard}
                            activeTab={activeTab}
                            auth={auth}
                            selectedAuths={selectedAuths}
                            accounts={accounts}
                            activeAccountId={activeAccountId}
                            activeAccount={activeAccount}
                            contextCargoNumber={contextCargoNumber}
                            useServiceRequest={useServiceRequest}
                            setContextCargoNumber={setContextCargoNumber}
                            setActiveTab={setActiveTab}
                            setSelectedAccountIds={setSelectedAccountIds}
                            setActiveAccountId={setActiveAccountId}
                            updateActiveAccountCustomer={updateActiveAccountCustomer}
                            openCargoWithFilters={openCargoWithFilters}
                            openCargoFromChat={openCargoFromChat}
                            openTelegramBotWithAccount={openTelegramBotWithAccount}
                            handleSwitchAccount={handleSwitchAccount}
                            handleAddAccount={handleAddAccount}
                            handleRemoveAccount={handleRemoveAccount}
                            handleUpdateAccount={handleUpdateAccount}
                            setIsOfferOpen={setIsOfferOpen}
                            setIsPersonalConsentOpen={setIsPersonalConsentOpen}
                            openSecretPinModal={openSecretPinModal}
                            CargoDetailsModal={CargoDetailsModal}
                            DashboardPageComponent={DashboardPage}
                            ProfilePageComponent={ProfilePage}
                            DocumentsPageComponent={DocumentsPage}
                        />
                    </AppRuntimeProvider>
            </div>
            </div>
            <TabBar 
                active={activeTab} 
                onChange={(tab) => {
                    if (showDashboard) {
                        if (tab === "home") {
                            // При клике на "Главная" переходим на дашборд, но не выходим из секретного режима
                            setActiveTab("dashboard");
                        } else if (tab === "cargo") {
                            // При клике на "Грузы" переходим на грузы, но остаемся в секретном режиме
                            setActiveTab("cargo");
                        } else {
                            setActiveTab(tab);
                        }
                    } else {
                        if (tab === "home") setActiveTab("dashboard");
                        else setActiveTab(tab);
                    }
                }}
                // вход в секретный режим теперь через "Уведомления" в профиле
                showAllTabs={true}
                permissions={activeAccount?.isRegisteredUser ? activeAccount.permissions ?? undefined : undefined}
            />

            {/* Оферта/Согласие должны открываться и из раздела Профиль */}
            {isOfferOpen && (
                <div className="modal-overlay" onClick={() => setIsOfferOpen(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <Typography.Headline style={{ fontSize: '1.1rem' }}>Публичная оферта</Typography.Headline>
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
                            <Typography.Headline style={{ fontSize: '1.1rem' }}>Согласие на обработку персональных данных</Typography.Headline>
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
            
            {/* Модальное окно для ввода пин-кода */}
            {showPinModal && (
                <div className="modal-overlay" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <Button className="modal-close-button" onClick={() => { setShowPinModal(false); setPinCode(''); setPinError(false); }} aria-label="Закрыть">
                                <X size={20} />
                            </Button>
                        </div>
                        <form onSubmit={handlePinSubmit}>
                            <div style={{ marginBottom: '1rem' }}>
                                <Input
                                    type="password"
                                    className="login-input"
                                    placeholder=""
                                    value={pinCode}
                                    onChange={(e) => {
                                        setPinCode(e.target.value);
                                        setPinError(false);
                                    }}
                                    autoFocus
                                    maxLength={4}
                                    style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem' }}
                                />
                                {pinError && (
                                    <Typography.Body className="login-error" style={{ marginTop: '0.5rem', textAlign: 'center' }}>
                                        Неверный пин-код
                                    </Typography.Body>
                                )}
                            </div>
                            <Button className="button-primary" type="submit" style={{ width: '100%' }}>
                                Войти
                            </Button>
                        </form>
                    </div>
                </div>
            )}
            
            {/* Карточка перевозки поверх счёта (из раздела Документы) — zIndex 10000 чтобы быть выше InvoiceDetailModal (9998) */}
            {overlayCargoNumber && activeAccount && (
                overlayCargoLoading ? (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }} onClick={() => { setOverlayCargoNumber(null); setOverlayCargoItem(null); setOverlayCargoInn(null); }}>
                        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-primary)' }} />
                    </div>
                ) : overlayCargoItem ? (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 10000 }}>
                    <CargoDetailsModal
                        item={overlayCargoItem}
                        isOpen={true}
                        onClose={() => { setOverlayCargoNumber(null); setOverlayCargoItem(null); setOverlayCargoInn(null); }}
                        auth={{ login: activeAccount.login, password: activeAccount.password, inn: (overlayCargoInn ?? activeAccount.activeCustomerInn ?? undefined) || undefined, ...(activeAccount.isRegisteredUser ? { isRegisteredUser: true } : {}) }}
                        onOpenChat={undefined}
                        showSums={activeAccount?.isRegisteredUser ? (activeAccount.financialAccess ?? true) : true}
                        useServiceRequest={useServiceRequest}
                        isFavorite={(n) => { try { const raw = localStorage.getItem('haulz.favorites'); const arr = raw ? JSON.parse(raw) : []; return arr.includes(n); } catch { return false; } }}
                        onToggleFavorite={(n) => { if (!n) return; try { const raw = localStorage.getItem('haulz.favorites'); const arr = raw ? JSON.parse(raw) : []; const set = new Set(arr); if (set.has(n)) set.delete(n); else set.add(n); localStorage.setItem('haulz.favorites', JSON.stringify([...set])); setOverlayFavVersion(v => v + 1); } catch {} }}
                    />
                    </div>
                ) : null
            )}

            <ChatModal
                isOpen={isChatOpen}
                onClose={() => setIsChatOpen(false)}
                userId={auth?.login || "anon"}
            />
            </Container>
        </>
    );
}
