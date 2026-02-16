/** Общие типы приложения (без зависимостей от React). */

export type ApiError = { error?: string; [key: string]: unknown };

export type AuthData = { login: string; password: string; id?: string; inn?: string; isRegisteredUser?: boolean };

export type CustomerOption = { name: string; inn: string };

/** Режим запроса перевозок по ИНН: заказчик, отправитель, получатель */
export type PerevozkiRole = "Customer" | "Sender" | "Receiver";

/** Права доступа для зарегистрированных пользователей */
export type AccountPermissions = {
    cms_access?: boolean;
    cargo?: boolean;
    doc_invoices?: boolean;
    doc_acts?: boolean;
    doc_orders?: boolean;
    doc_claims?: boolean;
    doc_contracts?: boolean;
    doc_acts_settlement?: boolean;
    doc_tariffs?: boolean;
    service_mode?: boolean;
};

export type Account = {
    login: string;
    password: string;
    id: string;
    customer?: string;
    customers?: CustomerOption[];
    activeCustomerInn?: string | null;
    /** Зарегистрированный пользователь (вход по email/паролю из админки) */
    isRegisteredUser?: boolean;
    /** Доступ ко всем заказчикам (список компаний из справочника) */
    accessAllInns?: boolean;
    /** Компания пользователя есть в справочнике заказчиков (можно приглашать сотрудников) */
    inCustomerDirectory?: boolean;
    permissions?: AccountPermissions;
    financialAccess?: boolean;
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

export type Tab = "home" | "cargo" | "docs" | "profile" | "dashboard";

export type DateFilter = "все" | "сегодня" | "вчера" | "неделя" | "месяц" | "год" | "период";

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
    | "employees"
    | "addCompanyMethod"
    | "addCompanyByINN"
    | "addCompanyByLogin"
    | "about"
    | "faq"
    | "voiceAssistants"
    | "2fa"
    | "notifications"
    | "admin"
    | "tinyurl-test";

export type CompanyRow = { login: string; inn: string; name: string };

export type PerevozkaTimelineStep = { label: string; date?: string; completed?: boolean };
