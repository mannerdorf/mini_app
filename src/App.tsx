// ----------------- КОМПОНЕНТ С ГРУЗАМИ -----------------

type CargoPageProps = { 
    auth: AuthData; 
};

function CargoPage({ auth }: CargoPageProps) {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [aiSummary, setAiSummary] = useState("Искусственный интеллект анализирует ваши данные...");
    const [summaryLoading, setSummaryLoading] = useState(true);

    const formatDate = (dateString: string | undefined): string => {
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            if (!isNaN(date.getTime())) {
                 return date.toLocaleDateString('ru-RU');
            }
        } catch (e) { /* ignore */ }
        const [year, month, day] = dateString.split('-');
        if (year && month && day) {
            return `${day}.${month}.${year}`;
        }
        return dateString;
    };
    
    const formatCurrency = (value: number | string | undefined): string => {
        if (value === undefined || value === null || value === "") return '-';
        const num = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;
        if (isNaN(num)) return String(value);

        return new Intl.NumberFormat('ru-RU', {
            style: 'currency',
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(num);
    };

    const loadData = async (login: string, password: string) => {
            setLoading(true);
            setError(null);
            setSummaryLoading(true);

            // Даты для запроса грузов (за последний год)
            const today = new Date();
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(today.getFullYear() - 1);

            const formatDateForApi = (date: Date): string => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };
            
            const dateFrom = formatDateForApi(oneYearAgo);
            const dateTo = formatDateForApi(today);
            
            // Query parameters для GET
            const queryParams = new URLSearchParams({
                dateFrom: dateFrom,
                dateTo: dateTo,
            }).toString();

            try {
                // --- ИСПОЛЬЗУЕТСЯ МЕТОД GET ---
                const url = `${PROXY_API_BASE_URL}?${queryParams}`;
                
                const res = await fetch(url, {
                    method: "GET",
                    headers: { 
                        // Basic Auth Header
                        ...getAuthHeader(login, password)
                    },
                });

                if (!res.ok) {
                    let message = `Ошибка загрузки: ${res.status}. Убедитесь в корректности данных и прокси.`;
                    if (res.status === 401) {
                        message = "Ошибка авторизации (401). Проверьте логин и пароль.";
                    }
                    setError(message);
                    setItems([]);
                    setSummaryLoading(false);
                    return;
                }

                const data = await res.json();
                
                const list = Array.isArray(data) ? data : data.Perevozki || data.items || [];
                
                setItems(list);

                const totalSum = list.reduce((sum: number, item: any) => sum + (parseFloat(item.Sum || item.Total || 0) || 0), 0);
                setAiSummary(`За последний год вы совершили ${list.length} перевозок. Общая сумма составила ${formatCurrency(totalSum)}.`);
                setSummaryLoading(false);

            } catch (e: any) {
                setError(e?.message || "Ошибка сети при загрузке данных.");
                setItems([]);
                setSummaryLoading(false);
            } finally {
                setLoading(false);
            }
        };

    // Хук для загрузки данных при монтировании (после успешной авторизации)
    useEffect(() => {
        // Мы вызываем loadData только если авторизованы
        if (auth.login && auth.password) {
            loadData(auth.login, auth.password);
        }
    }, [auth.login, auth.password]); 


    return (
        <div className="p-4">
            <h2 className="text-3xl font-bold text-theme-text mb-2">Мои перевозки</h2>
            <p className="text-theme-secondary mb-4 pb-4 border-b border-theme-border">
                Данные загружаются методом **GET** с передачей учетных данных в заголовке **Authorization: Basic**.
            </p>

            {/* AI Summary Card */}
            <div className="ai-summary-card">
                <div className="flex items-start">
                    <span className="mr-3 text-theme-primary font-bold text-xl">AI</span>
                    <div>
                        <p className="text-sm font-semibold mb-1 text-theme-text">Краткая сводка</p>
                        <p className={`text-theme-text text-sm ${summaryLoading ? 'italic text-theme-secondary' : 'font-medium'}`}>
                            {summaryLoading ? <span className="flex items-center"><Loader2 className="animate-spin w-4 h-4 mr-2" /> Анализ данных...</span> : aiSummary}
                        </p>
                    </div>
                </div>
            </div>


            {loading && <p className="flex items-center text-lg text-yellow-500"><Loader2 className="animate-spin mr-2 w-5 h-5" /> Загружаем данные...</p>}
            
            {error && <p className="login-error flex items-center"><X className="w-5 h-5 mr-2" />{error}</p>}

            {!loading && !error && items.length === 0 && (
                <div className="empty-state-card text-theme-secondary">
                    <Truck className="w-12 h-12 mx-auto mb-3 text-theme-primary" />
                    <p className="text-lg font-semibold text-theme-text">Перевозок не найдено</p>
                    <p className="text-sm">Проверьте, правильно ли указаны логин и пароль.</p>
                </div>
            )}

            <div className="grid-container mt-6">
                {items.map((item, idx) => {
                    const number = item.Nomer || item.Number || item.number || "-";
                    const status = item.Status || item.State || item.state || "-";
                    const date = formatDate(item.DatePrih || item.DatePr || item.datePr);
                    const weight = item.PW || item.Weight || "-";
                    const sum = formatCurrency(item.Sum || item.Total);

                    return (
                        <div className="perevozka-card" key={idx}>
                            <div className="card-header">
                                <span className="text-sm font-semibold text-theme-secondary">Перевозка №</span>
                                <span className="text-lg font-bold text-theme-primary">{number}</span>
                            </div>
                            <div className="p-3">
                                <div className="flex justify-between items-center py-2 border-b border-theme-border">
                                    <span className="text-sm text-theme-secondary flex items-center"><Check className="w-4 h-4 mr-2 text-green-500" /> Статус</span>
                                    <span className="text-theme-text font-semibold">{status}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-theme-border">
                                    <span className="text-sm text-theme-secondary flex items-center"><Truck className="w-4 h-4 mr-2 text-indigo-400" /> Дата прибытия</span>
                                    <span className="text-theme-text font-semibold">{date}</span>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-theme-border">
                                    <span className="text-sm text-theme-secondary flex items-center"><span className="text-xs font-extrabold mr-2">W</span> Вес, кг</span>
                                    <span className="text-theme-text font-semibold">{weight}</span>
                                </div>
                                <div className="flex justify-between items-center py-2">
                                    <span className="text-sm text-theme-secondary flex items-center"><span className="text-md font-extrabold mr-2 text-yellow-500">₽</span> Сумма</span>
                                    <span className="text-lg font-bold text-yellow-500">{sum}</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК -----------------

function StubPage({ title }: { title: string }) {
    return (
        <div className="p-4">
            <h2 className="text-3xl font-bold text-theme-text mb-2">{title}</h2>
            <p className="text-theme-secondary mb-4 pb-4 border-b border-theme-border">Этот раздел мы заполним позже.</p>
            
            <div className="empty-state-card text-theme-secondary mt-10">
                <FileText className="w-12 h-12 mx-auto mb-3 text-theme-primary" />
                <p className="text-lg font-semibold text-theme-text">В разработке</p>
                <p className="text-sm">Возвращайтесь позже, чтобы увидеть {title.toLowerCase()}.</p>
            </div>
        </div>
    );
}

// ----------------- НИЖНЕЕ МЕНЮ -----------------

type TabBarProps = {
    active: Tab;
    onChange: (t: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="fixed bottom-0 left-0 right-0 flex justify-around bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 shadow-lg p-2 z-50 bg-[var(--color-bg-card)] border-theme-border">
            <TabButton
                label="Главная"
                icon={<Home className="w-5 h-5" />}
                active={active === "home"}
                onClick={() => onChange("home")}
            />
            <TabButton
                label="Грузы"
                icon={<Truck className="w-5 h-5" />}
                active={active === "cargo"}
                onClick={() => onChange("cargo")}
            />
            <TabButton
                label="Документы"
                icon={<FileText className="w-5 h-5" />}
                active={active === "docs"}
                onClick={() => onChange("docs")}
            />
            <TabButton
                label="Поддержка"
                icon={<MessageCircle className="w-5 h-5" />}
                active={active === "support"}
                onClick={() => onChange("support")}
            />
            <TabButton
                label="Профиль"
                icon={<User className="w-5 h-5" />}
                active={active === "profile"}
                onClick={() => onChange("profile")}
            />
        </div>
    );
}

type TabButtonProps = {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
};

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
    const activeClass = active ? 'text-theme-primary' : 'text-theme-secondary';
    const hoverClass = 'hover:bg-theme-hover-bg';
    
    return (
        <button
            className={`flex flex-col items-center justify-center p-2 rounded-lg text-sm font-medium transition-colors ${activeClass} ${hoverClass}`}
            onClick={onClick}
        >
            <span className="tab-icon mb-0.5">{icon}</span>
            <span className="text-xs">{label}</span>
        </button>
    );
}
