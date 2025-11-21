import { FormEvent, useState, useEffect, useCallback, useMemo } from "react";
import { 
  LogOut, Loader2, Check, X, Moon, Sun, Eye, EyeOff, 
  Search, RefreshCw, XCircle, AlertTriangle, Info, Download, Calendar
} from 'lucide-react';

// --- CONFIGURATION ---
const CARGO_API_URL = '/api/perevozki';
const DOWNLOAD_API_URL = '/api/download';

// --- DATA TYPES ---
type AuthData = {
    login: string;
    password: string; // Storing password temporarily for proxy requests
};

type ApiError = {
    error?: string;
    [key: string]: unknown;
};

type Perevozka = {
    id: string; // Guid
    number: string;
    date: string; // "YYYY-MM-DD"
    status: 'Planned' | 'In Progress' | 'Completed' | string;
    from: string;
    to: string;
    route: string;
    deliveryType: string;
    driverName: string;
    transport: string;
    client: string;
    cost: number;
    // New fields from API (mapped)
    PV: number; // Платный вес (Payable Weight)
    Weight: number; // Общий вес (Total Weight)
    Volume: number; // Объем (Volume)
    StatusSchet: string; // Статус счета (Invoice Status)
};

type StatData = {
    label: string;
    value: number;
    color: string;
    bgClass: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

// --- HELPERS ---

/**
 * Formats a date to YYYY-MM-DD.
 */
const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Calculates a date N days ago.
 */
const getDateNDaysAgo = (days: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return formatDate(date);
}

// ----------------- MAIN CARGO PAGE -----------------

type CargoPageProps = {
    auth: AuthData;
    logout: () => void;
    toggleTheme: () => void;
    isThemeLight: boolean;
};

function CargoPage({ auth, logout, toggleTheme, isThemeLight }: CargoPageProps) {
    const [cargoList, setCargoList] = useState<Perevozka[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dateFrom, setDateFrom] = useState<string>(getDateNDaysAgo(7));
    const [dateTo, setDateTo] = useState<string>(formatDate(new Date()));
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCargo, setSelectedCargo] = useState<Perevozka | null>(null);

    const fetchCargo = useCallback(async (isInitial = false) => {
        if (loading) return;

        setLoading(true);
        setError(null);
        if (!isInitial) setCargoList(null);

        try {
            const res = await fetch(CARGO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: auth.login,
                    password: auth.password,
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                }),
            });

            if (!res.ok) {
                const text = await res.text();
                try {
                    const data: ApiError = JSON.parse(text);
                    setError(data.error || `API Error: ${res.status}`);
                } catch {
                    setError(`Server Error: ${res.status}. ${text.substring(0, 100)}...`);
                }
                return;
            }

            const rawData: any[] = await res.json();
            
            // --- DATA MAPPING LOGIC (New Fields Added) ---
            const mappedData: Perevozka[] = rawData.map(item => ({
                id: item.Ref || item.id || '',
                number: item.Number || item.number || 'N/A',
                date: item.DateZayavki || item.date || 'N/A',
                status: item.State || item.status || 'Unknown',
                from: item.GorodOtkuda || item.from || 'N/A',
                to: item.GorodKuda || item.to || 'N/A',
                route: `${item.GorodOtkuda || 'N/A'} - ${item.GorodKuda || 'N/A'}`,
                deliveryType: item.TipDostavki || 'N/A',
                driverName: item.DriverName || 'N/A',
                transport: item.Transport || 'N/A',
                client: item.Client || 'N/A',
                cost: parseFloat(item.Sum || item.Total || '0'),
                
                // NEW MAPPED FIELDS
                PV: parseFloat(item.PV || '0'), // Payable Weight (Платный вес)
                Weight: parseFloat(item.Weight || '0'), // Total Weight (Общий вес)
                Volume: parseFloat(item.Volume || '0'), // Volume (Объем)
                StatusSchet: item.StatusSchet || 'N/A', // Invoice Status (Статус счета)
            }));
            // ---------------------------------------------

            setCargoList(mappedData);

        } catch (err: any) {
            console.error(err);
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    }, [auth.login, auth.password, dateFrom, dateTo, loading]);

    useEffect(() => {
        fetchCargo(true);
    }, [fetchCargo]);


    // --- STATISTICS CALCULATION ---
    const stats: StatData[] = useMemo(() => {
        if (!cargoList) return [];
        const total = cargoList.length;
        const planned = cargoList.filter(c => c.status === 'Planned').length;
        const inWork = cargoList.filter(c => c.status === 'In Progress').length;
        const completed = cargoList.filter(c => c.status === 'Completed').length;

        return [
            { label: 'Total Trips', value: total, color: 'rgb(59, 130, 246)', bgClass: 'bg-[rgb(59,130,246)]' },
            { label: 'Planned', value: planned, color: 'rgb(250, 204, 21)', bgClass: 'bg-[rgb(250,204,21)]' },
            { label: 'In Progress', value: inWork, color: 'rgb(16, 185, 129)', bgClass: 'bg-[rgb(16,185,129)]' },
            { label: 'Completed', value: completed, color: 'rgb(244, 63, 94)', bgClass: 'bg-[rgb(244,63,94)]' },
        ];
    }, [cargoList]);


    // --- LIST FILTERING ---
    const filteredCargo = useMemo(() => {
        if (!cargoList) return [];
        const query = searchQuery.toLowerCase();
        return cargoList.filter(c => 
            c.number.toLowerCase().includes(query) ||
            c.route.toLowerCase().includes(query) ||
            c.client.toLowerCase().includes(query) ||
            c.driverName.toLowerCase().includes(query)
        );
    }, [cargoList, searchQuery]);


    return (
        <>
            <Header 
                authLogin={auth.login} 
                logout={logout} 
                toggleTheme={toggleTheme} 
                isThemeLight={isThemeLight}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />
            
            <div className="page card page-with-tabs">
                <div className="card-content w-full">
                    
                    {/* 1. DATE SELECTION */}
                    <DateRangeFilter dateFrom={dateFrom} setDateFrom={setDateFrom} dateTo={dateTo} setDateTo={setDateTo} fetchCargo={fetchCargo} loading={loading} />

                    {/* 2. STAT CARDS */}
                    {cargoList && (
                        <div className="stats-grid">
                            {stats.map((stat) => (
                                <StatCard key={stat.label} stat={stat} />
                            ))}
                        </div>
                    )}

                    {/* 3. CARGO LIST */}
                    <div className="cargo-list">
                        <h2 className="title mb-3">Trips List ({filteredCargo.length})</h2>
                        {loading && <LoadingCard message="Loading data from API..." />}
                        {error && <ErrorCard message={error} />}
                        
                        {!loading && !error && filteredCargo.length === 0 && (
                            <EmptyStateCard 
                                message={cargoList ? "No trips found for the selected period." : "No data to display. Please select dates."} 
                            />
                        )}

                        {!loading && !error && filteredCargo.map((cargo) => (
                            <CargoCard 
                                key={cargo.id} 
                                cargo={cargo} 
                                onClick={() => setSelectedCargo(cargo)} 
                            />
                        ))}
                    </div>

                </div>
            </div>

            {/* Cargo Details Modal */}
            {selectedCargo && (
                <CargoDetailModal 
                    cargo={selectedCargo} 
                    onClose={() => setSelectedCargo(null)} 
                    auth={auth} // Pass auth data for download
                />
            )}
            
            <TabBar active={"cargo"} onChange={() => {}} />
        </>
    );
}

// ----------------- UI COMPONENTS -----------------

// --- Header, ThemeToggleButton, StatCard, CargoCard (Localized) ---
type HeaderProps = {
    authLogin: string;
    logout: () => void;
    toggleTheme: () => void;
    isThemeLight: boolean;
    searchQuery: string;
    setSearchQuery: (query: string) => void;
}

function Header({ authLogin, logout, toggleTheme, isThemeLight, searchQuery, setSearchQuery }: HeaderProps) {
    return (
        <div className="app-header">
            <div className="header-content">
                <h1 className="user-greeting text-lg font-bold">
                    Hello, {authLogin}!
                </h1>
                <div className="flex items-center gap-2">
                    <div className="search-bar-small">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-theme-secondary pointer-events-none" />
                        <input
                            type="text"
                            placeholder="Search trip..."
                            className="search-input-small"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <ThemeToggleButton toggleTheme={toggleTheme} isThemeLight={isThemeLight} />
                    <button className="button-icon bg-red-600 hover:bg-red-700" onClick={logout} title="Logout">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

function ThemeToggleButton({ toggleTheme, isThemeLight }: { toggleTheme: () => void, isThemeLight: boolean }) {
    return (
        <button className="theme-toggle-button button-icon bg-transparent hover:bg-theme-hover" onClick={toggleTheme} title="Toggle Theme">
            {isThemeLight 
                ? <Moon className="w-5 h-5 text-theme-secondary hover:text-yellow-400" /> 
                : <Sun className="w-5 h-5 text-yellow-400 hover:text-yellow-300" />
            }
        </button>
    );
}

function StatCard({ stat }: { stat: StatData }) {
    return (
        <div 
            className={`stat-card stat-card-primary ${stat.bgClass}`} 
            style={{ backgroundColor: stat.color }}
        >
            <div className="text-xl font-bold">{stat.value}</div>
            <div className="text-sm opacity-90 mt-1">{stat.label}</div>
        </div>
    );
}

function CargoCard({ cargo, onClick }: { cargo: Perevozka, onClick: () => void }) {
    let statusColorClass = 'text-theme-secondary';
    if (cargo.status === 'Planned') statusColorClass = 'text-yellow-400';
    if (cargo.status === 'In Progress') statusColorClass = 'text-green-500';
    if (cargo.status === 'Completed') statusColorClass = 'text-blue-400';

    return (
        <div className="perevozka-card" onClick={onClick}>
            <div className="card-header">
                <div className="flex items-center gap-2">
                    <Info className={`w-4 h-4 ${statusColorClass}`} />
                    <span className="text-sm font-semibold">Trip No. {cargo.number}</span>
                </div>
                <span className={`text-xs font-semibold ${statusColorClass}`}>{cargo.status}</span>
            </div>
            <div className="p-3 text-sm">
                <div className="flex justify-between mb-1">
                    <span className="text-theme-secondary">Route:</span>
                    <span className="font-medium">{cargo.route}</span>
                </div>
                <div className="flex justify-between mb-1">
                    <span className="text-theme-secondary">Date:</span>
                    <span className="font-medium">{cargo.date}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-theme-secondary">Client:</span>
                    <span className="font-medium">{cargo.client}</span>
                </div>
            </div>
        </div>
    );
}

type DateRangeFilterProps = {
    dateFrom: string;
    setDateFrom: (d: string) => void;
    dateTo: string;
    setDateTo: (d: string) => void;
    fetchCargo: () => void;
    loading: boolean;
}

function DateRangeFilter({ dateFrom, setDateFrom, dateTo, setDateTo, fetchCargo, loading }: DateRangeFilterProps) {
    
    // Localization for quick filters
    const quickFilters: { label: string; days: number }[] = [
        { label: "Today", days: 0 },
        { label: "Week", days: 7 },
        { label: "Month", days: 30 },
        { label: "All", days: 365 * 10 }, 
    ];

    const applyQuickFilter = (days: number) => {
        setDateTo(formatDate(new Date()));
        if (days === 0) {
            setDateFrom(formatDate(new Date()));
        } else if (days > 0) {
            setDateFrom(getDateNDaysAgo(days));
        }
        // Data fetch will be triggered by useEffect in CargoPage
    };

    return (
        <div className="mb-4">
            <div className="flex gap-2 mb-2 items-center">
                <Calendar className="w-5 h-5 text-theme-secondary flex-shrink-0" />
                <input
                    type="date"
                    className="date-input"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                />
                <span className="text-theme-secondary">to</span>
                <input
                    type="date"
                    className="date-input"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                />
                <button 
                    className="button-icon" 
                    onClick={fetchCargo} 
                    disabled={loading}
                    title="Refresh Data"
                >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                </button>
            </div>
            <div className="flex gap-2 text-sm">
                {quickFilters.map(filter => (
                    <button
                        key={filter.label}
                        className="quick-filter-button"
                        onClick={() => applyQuickFilter(filter.days)}
                    >
                        {filter.label}
                    </button>
                ))}
            </div>
        </div>
    );
}


// ----------------- CARGO DETAILS MODAL (Updated) -----------------

type CargoDetailModalProps = {
    cargo: Perevozka;
    onClose: () => void;
    auth: AuthData;
};

function CargoDetailModal({ cargo, onClose, auth }: CargoDetailModalProps) {
    const [downloading, setDownloading] = useState<string | null>(null);

    const handleDownload = useCallback(async (metod: string, fileName: string) => {
        setDownloading(metod);
        
        try {
            const res = await fetch(DOWNLOAD_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: auth.login,
                    password: auth.password,
                    metod: metod,
                    number: cargo.number,
                }),
            });

            if (!res.ok) {
                alert(`Download failed for ${fileName}. Server error: ${res.status}`);
                return;
            }

            // Get blob from response (assuming proxy streams binary data)
            const blob = await res.blob();
            
            // Create a temporary link to trigger download
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${cargo.number}-${fileName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            
        } catch (err) {
            console.error("Download error:", err);
            alert(`Network error during download of ${fileName}.`);
        } finally {
            setDownloading(null);
        }
    }, [auth.login, auth.password, cargo.number]);


    const details = [
        { label: 'Trip Number', value: cargo.number },
        { label: 'Date', value: cargo.date },
        { label: 'Status', value: cargo.status },
        { label: 'Invoice Status', value: cargo.StatusSchet, highlight: true }, // New field
        { label: 'Delivery Type', value: cargo.deliveryType },
        { label: 'Route', value: cargo.route, fullRow: true },
        { label: 'From', value: cargo.from },
        { label: 'To', value: cargo.to },
        { label: 'Client', value: cargo.client, fullRow: true },
        { label: 'Driver', value: cargo.driverName },
        { label: 'Vehicle', value: cargo.transport },
        { label: 'Cost', value: `${cargo.cost.toLocaleString()} ₽` },
        { label: 'Payable Weight (kg)', value: cargo.PV.toLocaleString(), highlight: true }, // New field
        { label: 'Total Weight (kg)', value: cargo.Weight.toLocaleString() }, // New field
        { label: 'Volume (m³)', value: cargo.Volume.toLocaleString() }, // New field
    ];
    
    const documents = [
        { label: "Electronic Register (ER)", metod: "ЭР" },
        { label: "Acceptance Act (APP)", metod: "АПП" },
        // Add other document types if needed, e.g., "СчФ" for invoice
    ];


    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Trip Details No. {cargo.number}</h3>
                    <button className="modal-close-button" onClick={onClose}>
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Document Download Buttons */}
                <div className="document-buttons">
                    {documents.map((doc) => (
                        <button 
                            key={doc.metod}
                            className="doc-button"
                            onClick={() => handleDownload(doc.metod, doc.label)}
                            disabled={downloading !== null}
                        >
                            {downloading === doc.metod ? (
                                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            ) : (
                                <Download className="w-4 h-4 mr-2" />
                            )}
                            {downloading === doc.metod ? "Downloading..." : doc.label}
                        </button>
                    ))}
                </div>

                {/* Core Details */}
                <div className="details-grid">
                    {details.map((item, index) => (
                        <div 
                            key={index} 
                            className={`details-item ${item.fullRow ? 'col-span-2' : ''} ${item.highlight ? 'highlighted-detail' : ''}`}
                        >
                            <div className="details-label">{item.label}</div>
                            <div className="details-value">{item.value}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ----------------- OTHER UI COMPONENTS (Localized) -----------------

function LoadingCard({ message }: { message: string }) {
    return (
        <div className="loading-card flex flex-col items-center justify-center">
            <Loader2 className="w-8 h-8 text-theme-primary animate-spin mb-3" />
            <p className="text-sm font-medium">{message}</p>
        </div>
    );
}

function ErrorCard({ message }: { message: string }) {
    return (
        <div className="error-card flex flex-col items-center justify-center">
            <XCircle className="w-8 h-8 text-red-500 mb-3" />
            <p className="text-lg font-bold text-red-500 mb-2">Error</p>
            <p className="text-sm text-theme-secondary text-center">{message}</p>
        </div>
    );
}

function EmptyStateCard({ message }: { message: string }) {
    return (
        <div className="empty-state-card flex flex-col items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-yellow-500 mb-3" />
            <p className="text-lg font-bold text-theme-text mb-2">No Data</p>
            <p className="text-sm text-theme-secondary text-center">{message}</p>
        </div>
    );
}

// ----------------- TAB BAR (Localized) -----------------
type TabBarProps = { active: Tab; onChange: (t: Tab) => void; };

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="tabbar">
            <TabButton label="Home" icon="🏠" active={active === "home"} onClick={() => onChange("home")} />
            <TabButton label="Cargo" icon="📦" active={active === "cargo"} onClick={() => onChange("cargo")} />
            <TabButton label="Docs" icon="📄" active={active === "docs"} onClick={() => onChange("docs")} />
            <TabButton label="Support" icon="💬" active={active === "support"} onClick={() => onChange("support")} />
            <TabButton label="Profile" icon="👤" active={active === "profile"} onClick={() => onChange("profile")} />
        </div>
    );
}

type TabButtonProps = { label: string; icon: string; active: boolean; onClick: () => void; };

function TabButton({ label, icon, active, onClick }: TabButtonProps) {
    return (
        <button
            type="button"
            className={`tab-button ${active ? "active" : ""}`}
            onClick={onClick}
        >
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">{label}</span>
        </button>
    );
}

// ----------------- LOGIN SCREEN (Corrected) -----------------

function LoginScreen({ setAuth }: { setAuth: (auth: AuthData) => void }) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    // УДАЛЕНО: [agreeOffer, setAgreeOffer]
    // УДАЛЕНО: [agreePersonal, setAgreePersonal]
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const isThemeLight = document.body.classList.contains('light-mode');
    
    const toggleTheme = () => {
        document.body.classList.toggle('light-mode');
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!login || !password) {
            setError("Enter login and password.");
            return;
        }

        // УДАЛЕНО: Проверка согласия с условиями

        try {
            setLoading(true);

            // Test authentication using the same proxy endpoint used for cargo data
            const res = await fetch(CARGO_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login, 
                    password, 
                    dateFrom: getDateNDaysAgo(1),
                    dateTo: formatDate(new Date()),
                }),
            });

            const text = await res.text();
            let data: ApiError | Perevozka[];

            try {
                data = JSON.parse(text);
            } catch {
                data = { error: `Unknown server response: ${res.status}` };
            }

            if (!res.ok) {
                const errMsg = (data as ApiError).error || `Error: ${res.status}. ${text.substring(0, 50)}...`;
                if (res.status === 401) {
                    setError("Invalid login or password.");
                } else {
                    setError(errMsg);
                }
                return;
            }

            // Success
            const authData = { login, password };
            setAuth(authData);
            localStorage.setItem('authData', JSON.stringify(authData));

        } catch (err: any) {
            console.error(err);
            setError("Network error. Please check your connection.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-form-wrapper app-container">
            <div className="page card">
                <div className="card-content">
                    <div className="flex justify-end">
                        <ThemeToggleButton toggleTheme={toggleTheme} isThemeLight={isThemeLight} />
                    </div>

                    <h1 className="logo-text">HAULZ</h1>
                    <p className="tagline">Log in to the Transportation Management System</p>

                    <form className="form" onSubmit={handleSubmit}>
                        <div className="input-group">
                            <label className="input-label" htmlFor="login">Login</label>
                            <input
                                id="login"
                                type="text"
                                className="input"
                                placeholder="Enter login"
                                value={login}
                                onChange={(e) => setLogin(e.target.value)}
                                disabled={loading}
                            />
                        </div>
                        
                        <div className="input-group">
                            <label className="input-label" htmlFor="password">Password</label>
                            <div className="password-wrapper">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    className="input"
                                    placeholder="Enter password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    disabled={loading}
                                />
                                <button 
                                    type="button" 
                                    className="password-toggle" 
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        {/* УДАЛЕНО: Чекбоксы */}

                        {error && (
                            <div className="login-error">
                                <XCircle className="w-4 h-4 mr-2 flex-shrink-0" />
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            className="button-primary"
                            disabled={loading}
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                            {loading ? "Logging in..." : "Login"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

// ----------------- STUB PAGES -----------------

function StubPage({ title }: { title: string }) {
    return (
        <>
            <Header 
                authLogin="User" // Placeholder
                logout={() => {}} 
                toggleTheme={() => {}} 
                isThemeLight={document.body.classList.contains('light-mode')}
                searchQuery=""
                setSearchQuery={() => {}}
            />
            <div className="page card page-with-tabs">
                <div className="card-content">
                    <h2 className="title">{title}</h2>
                    <p className="subtitle text-theme-secondary">This section will be filled in later.</p>
                </div>
            </div>
        </>
    );
}

// ----------------- MAIN APP COMPONENT -----------------

export default function App() {
    const [auth, setAuth] = useState<AuthData | null>(() => {
        const stored = localStorage.getItem('authData');
        return stored ? JSON.parse(stored) : null;
    });
    const [activeTab, setActiveTab] = useState<Tab>("cargo"); 
    const [isThemeLight, setIsThemeLight] = useState(false);

    const toggleTheme = useCallback(() => {
        const newTheme = !isThemeLight;
        setIsThemeLight(newTheme);
        document.body.classList.toggle('light-mode', newTheme);
        localStorage.setItem('theme', newTheme ? 'light' : 'dark');
    }, [isThemeLight]);

    const handleLogout = useCallback(() => {
        setAuth(null);
        localStorage.removeItem('authData');
    }, []);

    // Theme initialization
    useEffect(() => {
        const storedTheme = localStorage.getItem('theme');
        const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;

        let initialLight = systemPrefersLight;

        if (storedTheme === 'light') {
            initialLight = true;
        } else if (storedTheme === 'dark') {
            initialLight = false;
        }
        
        setIsThemeLight(initialLight);
        document.body.classList.toggle('light-mode', initialLight);

        // Telegram WebApp Initialization (Optional)
        if (window.Telegram && window.Telegram.WebApp) {
             window.Telegram.WebApp.ready();
             const color = initialLight ? '#ffffff' : '#1f2937';
             window.Telegram.WebApp.setHeaderColor(color);
             window.Telegram.WebApp.setBackgroundColor(color);
        }

    }, []);


    if (!auth) {
        return <LoginScreen setAuth={setAuth} />;
    }

    return (
        <div className={`app-container ${isThemeLight ? 'light-mode' : ''}`}>
            {/* Render active tab page */}
            {activeTab === "cargo" && (
                <CargoPage 
                    auth={auth} 
                    logout={handleLogout} 
                    toggleTheme={toggleTheme} 
                    isThemeLight={isThemeLight}
                />
            )}
            {activeTab === "home" && <StubPage title="Home" />}
            {activeTab === "docs" && <StubPage title="Documents" />}
            {activeTab === "support" && <StubPage title="Support" />}
            {activeTab === "profile" && <StubPage title="Profile" />}

            {/* Bottom TabBar */}
            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}
