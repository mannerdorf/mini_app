/** Общие типы приложения (без зависимостей от React). */

export type ApiError = { error?: string; [key: string]: unknown };

export type AuthData = { login: string; password: string; id?: string; inn?: string };

export type CustomerOption = { name: string; inn: string };

/** Режим запроса перевозок по ИНН: заказчик, отправитель, получатель */
export type PerevozkiRole = "Customer" | "Sender" | "Receiver";

export type Account = {
    login: string;
    password: string;
    id: string;
    customer?: string;
    customers?: CustomerOption[];
    activeCustomerInn?: string | null;
    /** Показывать перевозки, где вы заказчик (полные данные) */
    roleCustomer?: boolean;
    /** Показывать перевозки, где вы отправитель (без финансов) */
    roleSender?: boolean;
    /** Показывать перевозки, где вы получатель (без финансов) */
    roleReceiver?: boolean;
    twoFactorEnabled?: boolean;
    twoFactorMethod?: "google" | "telegram";
    twoFactorTelegramLinked?: boolean;
    twoFactorGoogleSecretSet?: boolean;
};

export type Tab = "home" | "cargo" | "docs" | "support" | "profile" | "dashboard";

export type DateFilter = "все" | "сегодня" | "вчера" | "неделя" | "месяц" | "период";

export type StatusFilter = "all" | "in_transit" | "ready" | "delivering" | "delivered" | "favorites";

export type HomePeriodFilter = "today" | "week" | "month" | "year" | "custom";

export type CargoItem = {
    Number?: string;
    DatePrih?: string;
    DateVr?: string;
    State?: string;
    Mest?: number | string;
    PW?: number | string;
    W?: number | string;
    Value?: number | string;
    Sum?: number | string;
    StateBill?: string;
    Sender?: string;
    Customer?: string;
    /** Роль авторизованного лица по этой перевозке (для бейджа и скрытия финансов) */
    _role?: PerevozkiRole;
    [key: string]: any;
};

/** icon — компонент иконки (React.ElementType), в types без React используем any */
export type CargoStat = {
    key: string;
    label: string;
    icon: any;
    value: number | string;
    unit: string;
    bgColor: string;
};

export type HaulzOffice = {
    city: string;
    address: string;
    phone: string;
};

export type HeaderCompanyRow = { login: string; inn: string; name: string };

export type ProfileView =
    | "main"
    | "companies"
    | "roles"
    | "serviceMode"
    | "addCompanyMethod"
    | "addCompanyByINN"
    | "addCompanyByLogin"
    | "about"
    | "faq"
    | "voiceAssistants"
    | "2fa"
    | "notifications"
    | "tinyurl-test";

export type CompanyRow = { login: string; inn: string; name: string };

export type PerevozkaTimelineStep = { label: string; date?: string; completed?: boolean };
