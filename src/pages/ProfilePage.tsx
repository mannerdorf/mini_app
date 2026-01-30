import React, { FormEvent, useCallback, useEffect, useState } from "react";
import {
    ArrowLeft, AlertTriangle, Bell, Building2, Check, ChevronDown, Eye, EyeOff, FileText, Info, Loader2, Mail, MapPin, MessageCircle, Mic, Phone, Plus, Share2, Shield, Trash2, User as UserIcon,
} from "lucide-react";
import { Button, Flex, Input, Panel, Switch, Typography } from "@maxhub/max-ui";
import type { Account, CompanyRow, HeaderCompanyRow, HaulzOffice, ProfileView } from "../types";
import { stripOoo } from "../utils";
import { getWebApp, isMaxWebApp } from "../webApp";
import { TapSwitch } from "../components/TapSwitch";
import { NotificationsPage } from "./NotificationsPage";

const ABOUT_HAULZ_TEXT = `HAULZ — B2B-логистическая компания, работающая на направлении Москва ↔ Калининград.

Мы выстраиваем логистику на базе современных цифровых технологий, глубоких интеграций и электронного документооборота, что позволяет клиентам получать актуальные статусы, документы и закрывающие отчёты в цифровом виде.

Сервисы HAULZ могут интегрироваться с внутренними системами клиентов и обеспечивают быстрый доступ к счетам, УПД и данным по перевозкам через онлайн-кабинет, мини-приложение, API, бот.`;

const HAULZ_OFFICES: HaulzOffice[] = [
    { city: "Калининград", address: "Железнодорожная ул., 12к4", phone: "+7 (401) 227-95-55" },
    { city: "Москва / МО", address: "Индустриальный парк «Андреевское», вл. 14А", phone: "+7 (958) 538-42-22" },
];

const HAULZ_EMAIL = "Info@haulz.pro";

/** Одна компания на одно название: убираем дубли от разных способов авторизации. Приоритет — строка с непустым ИНН. */
function dedupeCompaniesByName(rows: CompanyRow[]): CompanyRow[] {
    const byName = new Map<string, CompanyRow>();
    const normalize = (s: string) => (s || "").trim().toLowerCase();
    for (const c of rows) {
        const key = normalize(c.name);
        if (!key) continue;
        const existing = byName.get(key);
        if (!existing) {
            byName.set(key, c);
        } else {
            const hasInn = (c.inn || "").trim().length > 0;
            const existingHasInn = (existing.inn || "").trim().length > 0;
            if (hasInn && !existingHasInn) byName.set(key, c);
        }
    }
    return Array.from(byName.values());
}

// --- CUSTOMER SWITCHER ---
export function CustomerSwitcher({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onUpdateAccount,
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [companies, setCompanies] = useState<HeaderCompanyRow[]>([]);
    const [loading, setLoading] = useState(false);

    const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
    const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
    const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.customer-switcher')) setIsOpen(false);
        };
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || accounts.length === 0) return;
        const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
        const query = logins.map((l) => `login=${encodeURIComponent(l)}`).join('&');
        setLoading(true);
        fetch(`/api/companies?${query}`)
            .then((r) => r.json())
            .then((data) => {
                const list = Array.isArray(data?.companies) ? data.companies : [];
                setCompanies(dedupeCompaniesByName(list));
            })
            .catch(() => setCompanies([]))
            .finally(() => setLoading(false));
    }, [isOpen, accounts.map((a) => a.login).join(',')]);

    const activeCompany = companies.find(
        (c) => c.login === activeLogin && (c.inn === '' || c.inn === activeInn)
    );
    const displayName = activeCompany ? stripOoo(activeCompany.name) : stripOoo(activeAccount?.customer || activeAccount?.login || 'Компания');

    const handleSelect = (c: HeaderCompanyRow) => {
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
        if (!acc) return;
        onSwitchAccount(acc.id);
        if (c.inn !== undefined && c.inn !== null) {
            onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
        }
        setIsOpen(false);
    };

    if (!activeAccountId || !activeAccount) return null;

    return (
        <div className="customer-switcher filter-group" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Button
                className="filter-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{ padding: '0.5rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}
                title="Выбрать компанию"
            >
                <Typography.Body style={{ fontSize: '0.9rem' }}>
                    {displayName}
                </Typography.Body>
                <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>
            {isOpen && (
                <div
                    className="filter-dropdown"
                    style={{
                        minWidth: '220px',
                        maxHeight: 'min(60vh, 320px)',
                        overflowY: 'auto',
                    }}
                >
                    {loading ? (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Загрузка…</Typography.Body>
                        </div>
                    ) : companies.length === 0 ? (
                        <div style={{ padding: '0.75rem 1rem' }}>
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Нет компаний</Typography.Body>
                        </div>
                    ) : (
                        companies.map((c) => {
                            const isActive = activeLogin === c.login && (c.inn === '' || c.inn === activeInn);
                            return (
                                <div
                                    key={`${c.login}-${c.inn}`}
                                    className={`dropdown-item ${isActive ? 'active' : ''}`}
                                    onClick={() => handleSelect(c)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        backgroundColor: isActive ? 'var(--color-bg-hover)' : 'transparent',
                                    }}
                                >
                                    <Typography.Body style={{ fontSize: '0.9rem', fontWeight: isActive ? 'bold' : 'normal' }}>
                                        {stripOoo(c.name)}
                                    </Typography.Body>
                                    {isActive && <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />}
                                </div>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
}

// --- ACCOUNT SWITCHER ---
function AccountSwitcher({
    accounts,
    activeAccountId,
    onSwitchAccount
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const activeAccount = accounts.find(acc => acc.id === activeAccountId);
    const activeLabel = stripOoo(activeAccount?.customer || activeAccount?.login || '') || 'Не выбран';

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (!target.closest('.account-switcher')) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);

    return (
        <div className="account-switcher filter-group" style={{ position: 'relative' }}>
            <Button
                className="filter-button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.9rem'
                }}
                title={`Переключить аккаунт (${accounts.length} аккаунтов)`}
            >
                <UserIcon className="w-4 h-4" />
                <Typography.Body style={{ fontSize: '0.9rem' }}>{activeLabel}</Typography.Body>
                <ChevronDown className="w-4 h-4" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            </Button>
            {isOpen && (
                <div className="filter-dropdown" style={{ minWidth: '200px' }}>
                    {accounts.map((account) => (
                        <div
                            key={account.id}
                            className={`dropdown-item ${activeAccountId === account.id ? 'active' : ''}`}
                            onClick={() => {
                                onSwitchAccount(account.id);
                                setIsOpen(false);
                            }}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                backgroundColor: activeAccountId === account.id ? 'var(--color-bg-hover)' : 'transparent'
                            }}
                        >
                            <Flex align="center" style={{ flex: 1, gap: '0.5rem' }}>
                                <Building2 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: activeAccountId === account.id ? 'bold' : 'normal' }}>
                                    {stripOoo(account.customer || account.login)}
                                </Typography.Body>
                            </Flex>
                            {activeAccountId === account.id && (
                                <Check className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function truncateForLog(u: string, max = 80) {
    return u.length <= max ? u : u.slice(0, max) + '...';
}

function TinyUrlTestPage({ onBack }: { onBack: () => void }) {
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
            if (typeof webApp.ready === "function") {
                try { webApp.ready(); testLogs.push("Called webApp.ready()"); } catch (e: any) { testLogs.push(`ready() error: ${e}`); }
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
            testLogs.push("--- Searching Global Scope ---");
            const globals = Object.keys(window).filter(k =>
                (k.toLowerCase().includes("id") || k.toLowerCase().includes("user") || k.toLowerCase().includes("chat")) &&
                !k.startsWith("webkit") && !k.startsWith("on") && k !== "id"
            );
            testLogs.push(`Global matches: ${globals.slice(0, 10).join(", ")}`);
            const chatId = unsafe.user?.id || unsafe.chat?.id || (window as any).WebAppUser?.id || (window as any).userId;
            testLogs.push(`Detected chatId from unsafe: ${chatId}`);
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
            } catch (e: any) { testLogs.push(`Manual parse error: ${e}`); }
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
                    testLogs.push(`Response status: ${res.status}`);
                    if (res.status === 200) testLogs.push("✅ Message sent successfully!");
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
        } catch (e: any) {
            addLog(`❌ Ошибка: ${e?.message || String(e)}`);
        }
    };

    const handleShorten = async () => {
        if (!inputUrl.trim()) { setError('Введите URL'); return; }
        try { new URL(inputUrl); } catch { setError('Неверный формат URL'); return; }
        setLoading(true);
        setError(null);
        setShortUrl(null);
        addLog(`Начало сокращения URL: ${truncateForLog(inputUrl)}`);
        try {
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
                }
            } else {
                let errData: any = {};
                try { errData = JSON.parse(raw); } catch { errData = { message: raw }; }
                setError(errData.message || errData.error || raw || `Ошибка ${res.status}`);
            }
        } catch (e: any) {
            setError(e?.message || String(e));
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
                <Typography.Label style={{ marginBottom: '0.5rem', display: 'block' }}>Введите длинную ссылку:</Typography.Label>
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
                    <Button className="filter-button" onClick={handlePing} disabled={loading} style={{ flex: 1, minWidth: '140px' }}>Проверить подключение</Button>
                    <Button className="button-primary" onClick={handleShorten} disabled={loading || !inputUrl.trim()} style={{ flex: 1, minWidth: '140px' }}>
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />Сокращаю...</> : 'Сократить ссылку'}
                    </Button>
                </Flex>
                {error && <Flex align="center" className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" /><Typography.Body>{error}</Typography.Body></Flex>}
                {shortUrl && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg-secondary)', borderRadius: '0.5rem' }}>
                        <Typography.Body style={{ wordBreak: 'break-all', color: 'var(--color-primary)', cursor: 'pointer' }} onClick={() => navigator.clipboard?.writeText(shortUrl).then(() => alert('Скопировано!'))}>{shortUrl}</Typography.Body>
                    </div>
                )}
            </Panel>
            {isMaxWebApp() && (
                <Panel className="cargo-card mb-4" style={{ padding: '1rem', background: '#222', color: '#fff', border: '1px dashed #555', marginTop: '1rem' }}>
                    <Typography.Headline style={{ fontSize: '1rem', marginBottom: '0.5rem', color: '#ffcc00' }}>🛠 MAX Debug</Typography.Headline>
                    <Button onClick={testMaxMessage} className="filter-button" style={{ background: '#ffcc00', color: '#000', fontWeight: 'bold' }}>Отправить тестовое сообщение</Button>
                    {maxDebugInfo && <pre style={{ background: '#000', padding: '0.75rem', borderRadius: '8px', fontSize: '0.75rem', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>{maxDebugInfo}</pre>}
                </Panel>
            )}
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Typography.Label style={{ marginBottom: '0.75rem', display: 'block' }}>Логи:</Typography.Label>
                <div style={{ maxHeight: '400px', overflowY: 'auto', background: 'var(--color-bg-secondary)', padding: '0.75rem', borderRadius: '0.5rem', fontSize: '0.85rem', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                    {logs.length === 0 ? <Typography.Body style={{ color: 'var(--color-text-secondary)' }}>Логи появятся здесь после попытки сокращения ссылки...</Typography.Body> : logs.map((log, idx) => <div key={idx} style={{ marginBottom: '0.25rem' }}>{log}</div>)}
                </div>
                {logs.length > 0 && <Button className="filter-button" onClick={() => setLogs([])} style={{ marginTop: '0.75rem', width: '100%' }}>Очистить логи</Button>}
            </Panel>
        </div>
    );
}

function AboutCompanyPage({ onBack }: { onBack: () => void }) {
    const normalizePhoneToTel = (phone: string) => {
        const digits = phone.replace(/[^\d+]/g, "");
        return digits.startsWith("+") ? digits : `+${digits}`;
    };
    const getMapsUrl = (address: string) => `https://yandex.ru/maps/?text=${encodeURIComponent(address)}`;
    const shareText = async (title: string, text: string) => {
        try {
            if (typeof navigator !== "undefined" && (navigator as any).share) {
                await (navigator as any).share({ title, text });
                return;
            }
        } catch { }
        try {
            if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                alert("Скопировано");
                return;
            }
        } catch { }
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
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>О компании</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: '1rem', marginBottom: '1rem' }}>
                <Typography.Body style={{ whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: '0.95rem' }}>{ABOUT_HAULZ_TEXT}</Typography.Body>
            </Panel>
            <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Контакты</Typography.Body>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {HAULZ_OFFICES.map((office) => (
                    <Panel key={office.city} className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between" style={{ marginBottom: '0.5rem', gap: '0.5rem' }}>
                            <Typography.Body style={{ fontSize: '0.95rem', fontWeight: 600 }}>{office.city}</Typography.Body>
                            <Button className="filter-button" type="button" title="Поделиться" style={{ padding: '0.25rem 0.5rem', minWidth: 'auto' }} onClick={() => shareText(`HAULZ — ${office.city}`, `HAULZ — ${office.city}\nАдрес: ${office.address}\nТел.: ${office.phone}\nEmail: ${HAULZ_EMAIL}`)}><Share2 className="w-4 h-4" /></Button>
                        </Flex>
                        <a className="filter-button" href={getMapsUrl(`${office.city}, ${office.address}`)} target="_blank" rel="noopener noreferrer" style={{ width: "100%", justifyContent: "flex-start", gap: "0.5rem", padding: "0.5rem 0.75rem", marginBottom: "0.5rem", backgroundColor: "transparent", textDecoration: "none" }} title="Открыть маршрут">
                            <MapPin className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{office.address}</Typography.Body>
                        </a>
                        <a className="filter-button" href={`tel:${normalizePhoneToTel(office.phone)}`} style={{ width: "100%", justifyContent: "flex-start", gap: "0.5rem", padding: "0.5rem 0.75rem", backgroundColor: "transparent", textDecoration: "none" }} title="Позвонить">
                            <Phone className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                            <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{office.phone}</Typography.Body>
                        </a>
                    </Panel>
                ))}
            </div>
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <Flex align="center" justify="space-between" style={{ gap: '0.5rem' }}>
                    <a className="filter-button" href={`mailto:${HAULZ_EMAIL}`} style={{ width: "100%", justifyContent: "flex-start", gap: "0.5rem", padding: "0.5rem 0.75rem", backgroundColor: "transparent", textDecoration: "none", marginRight: "0.5rem" }} title="Написать письмо">
                        <Mail className="w-4 h-4" style={{ color: 'var(--color-text-secondary)' }} />
                        <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{HAULZ_EMAIL}</Typography.Body>
                    </a>
                    <Button className="filter-button" type="button" title="Поделиться" style={{ padding: '0.25rem 0.5rem', minWidth: 'auto', flexShrink: 0 }} onClick={() => shareText("HAULZ — контакты", `HAULZ\nEmail: ${HAULZ_EMAIL}\nТел.: ${HAULZ_OFFICES.map(o => `${o.city}: ${o.phone}`).join(" | ")}`)}><Share2 className="w-4 h-4" /></Button>
                </Flex>
            </Panel>
        </div>
    );
}

// --- COMPANIES PAGE ---
function CompaniesPage({ onBack, onSelectMethod }: { onBack: () => void; onSelectMethod: (method: 'inn' | 'login') => void }) {
    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Мои компании</Typography.Headline>
            </Flex>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <div style={{ width: '60px', height: '60px', borderRadius: '50%', backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                    <Building2 className="w-6 h-6" style={{ color: 'var(--color-primary)' }} />
                </div>
                <Typography.Headline style={{ marginBottom: '0.5rem', fontSize: '1.1rem' }}>Выберите способ добавления</Typography.Headline>
                <Typography.Body style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', display: 'block', marginTop: '0.5rem' }}>Добавьте компанию по ИНН или используя логин и пароль</Typography.Body>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <Panel className="cargo-card" onClick={() => onSelectMethod('inn')} style={{ cursor: 'pointer', padding: '1rem' }}>
                    <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: '600' }}>По ИНН</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Введите ИНН компании для добавления</Typography.Body>
                </Panel>
                <Panel className="cargo-card" onClick={() => onSelectMethod('login')} style={{ cursor: 'pointer', padding: '1rem' }}>
                    <Typography.Body style={{ marginBottom: '0.25rem', fontSize: '0.9rem', fontWeight: '600' }}>По логину и паролю</Typography.Body>
                    <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Используйте логин и пароль для доступа</Typography.Body>
                </Panel>
            </div>
        </div>
    );
}

// --- ADD COMPANY BY INN PAGE ---
function AddCompanyByINNPage({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
    const [inn, setInn] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [otpCode, setOtpCode] = useState("");
    const [showCodeInput, setShowCodeInput] = useState(false);

    const handleSubmitINN = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!inn || (inn.length !== 10 && inn.length !== 12)) {
            setError("ИНН должен содержать 10 или 12 цифр");
            return;
        }
        try {
            setLoading(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
            setOtpCode("");
            setShowCodeInput(true);
        } catch (err: any) {
            setError(err.message || "Ошибка при проверке ИНН");
        } finally {
            setLoading(false);
        }
    };

    const handleOtpChange = (value: string) => {
        const digits = (value || "").replace(/\D/g, "").slice(0, 6);
        setOtpCode(digits);
        if (error) setError(null);
    };

    const handleCodeSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (otpCode.length !== 6) { setError("Введите полный код"); return; }
        try {
            setLoading(true);
            await new Promise(resolve => setTimeout(resolve, 1000));
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Неверный код подтверждения");
        } finally {
            setLoading(false);
        }
    };

    if (showCodeInput) {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите код подтверждения</Typography.Headline>
                </Flex>
                <Panel className="cargo-card" style={{ padding: '1rem' }}>
                    <form onSubmit={handleCodeSubmit}>
                        <input className="login-input" type="tel" inputMode="numeric" placeholder="------" value={otpCode} onChange={(e) => handleOtpChange(e.target.value)} style={{ width: '100%', maxWidth: '320px', margin: '0 auto 1.25rem', display: 'block', textAlign: 'center', letterSpacing: '0.5rem', fontSize: '1.25rem', padding: '0.9rem 0.75rem' }} autoFocus />
                        {error && <Typography.Body className="login-error" style={{ marginBottom: '1rem', textAlign: 'center', fontSize: '0.9rem' }}>{error}</Typography.Body>}
                        <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>{loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}</Button>
                        <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>Отмена</Button>
                    </form>
                </Panel>
            </div>
        );
    }

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите ИНН компании</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <form onSubmit={handleSubmitINN}>
                    <div className="field" style={{ marginBottom: '1.5rem' }}>
                        <Input className="login-input" type="text" inputMode="numeric" placeholder="ИНН (10 или 12 цифр)" value={inn} onChange={(e) => { const value = e.target.value.replace(/\D/g, ''); if (value.length <= 12) { setInn(value); setError(null); } }} autoFocus style={{ fontSize: '0.9rem' }} />
                    </div>
                    {error && <Typography.Body className="login-error" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</Typography.Body>}
                    <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>{loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код"}</Button>
                    <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>Отмена</Button>
                </form>
            </Panel>
        </div>
    );
}

// --- ADD COMPANY BY LOGIN PAGE ---
function AddCompanyByLoginPage({ onBack, onAddAccount, onSuccess }: { onBack: () => void; onAddAccount: (login: string, password: string) => Promise<void>; onSuccess: () => void }) {
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const resolveChecked = (value: boolean | "on" | "off" | undefined): boolean => (typeof value === "boolean" ? value : value === "on");

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!login || !password) { setError("Введите логин и пароль"); return; }
        if (!agreeOffer || !agreePersonal) { setError("Подтвердите согласие с условиями"); return; }
        try {
            setLoading(true);
            await onAddAccount(login, password);
            onSuccess();
        } catch (err: any) {
            setError(err.message || "Ошибка при добавлении аккаунта");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                <Typography.Headline style={{ fontSize: '1.25rem' }}>Введите логин и пароль</Typography.Headline>
            </Flex>
            <Panel className="cargo-card" style={{ padding: '1rem' }}>
                <form onSubmit={handleSubmit}>
                    <div className="field" style={{ marginBottom: '1rem' }}>
                        <Input className="login-input" type="text" placeholder="Логин (email)" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" style={{ fontSize: '0.9rem' }} />
                    </div>
                    <div className="field" style={{ marginBottom: '1rem' }}>
                        <div className="password-input-container">
                            <Input className="login-input password" type={showPassword ? "text" : "password"} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ paddingRight: '3rem', fontSize: '0.9rem' }} />
                            <Button type="button" className="toggle-password-visibility" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</Button>
                        </div>
                    </div>
                    <label className="checkbox-row switch-wrapper" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <Typography.Body style={{ fontSize: '0.85rem' }}>Согласие с публичной офертой</Typography.Body>
                        <Switch checked={agreeOffer} onCheckedChange={(value) => setAgreeOffer(resolveChecked(value))} onChange={(event) => setAgreeOffer(resolveChecked(event))} />
                    </label>
                    <label className="checkbox-row switch-wrapper" style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                        <Typography.Body style={{ fontSize: '0.85rem' }}>Согласие на обработку данных</Typography.Body>
                        <Switch checked={agreePersonal} onCheckedChange={(value) => setAgreePersonal(resolveChecked(value))} onChange={(event) => setAgreePersonal(resolveChecked(event))} />
                    </label>
                    {error && <Typography.Body className="login-error" style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</Typography.Body>}
                    <Button className="button-primary" type="submit" disabled={loading} style={{ width: '100%', marginBottom: '0.75rem', fontSize: '0.9rem', padding: '0.75rem' }}>{loading ? <Loader2 className="animate-spin w-4 h-4" /> : "Подтвердить"}</Button>
                    <Button type="button" className="filter-button" onClick={onBack} style={{ width: '100%', fontSize: '0.9rem', padding: '0.75rem' }}>Отмена</Button>
                </form>
            </Panel>
        </div>
    );
}

// --- COMPANIES LIST PAGE ---
function CompaniesListPage({
    accounts,
    activeAccountId,
    onSwitchAccount,
    onRemoveAccount,
    onUpdateAccount,
    onBack,
    onAddCompany
}: {
    accounts: Account[];
    activeAccountId: string | null;
    onSwitchAccount: (accountId: string) => void;
    onRemoveAccount: (accountId: string) => void;
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
    onBack: () => void;
    onAddCompany: () => void;
}) {
    const [companies, setCompanies] = React.useState<CompanyRow[]>([]);
    const [loading, setLoading] = React.useState(true);

    useEffect(() => {
        if (accounts.length === 0) {
            setCompanies([]);
            setLoading(false);
            return;
        }
        const logins = [...new Set(accounts.map((a) => a.login.trim().toLowerCase()))];
        const query = logins.map((l) => `login=${encodeURIComponent(l)}`).join("&");
        setLoading(true);
        fetch(`/api/companies?${query}`)
            .then((r) => r.json())
            .then((data) => {
                const list = Array.isArray(data?.companies) ? data.companies : [];
                setCompanies(dedupeCompaniesByName(list));
            })
            .catch(() => setCompanies([]))
            .finally(() => setLoading(false));
    }, [accounts.map((a) => a.login).join(",")]);

    const activeAccount = accounts.find((acc) => acc.id === activeAccountId) || null;
    const activeLogin = activeAccount?.login?.trim().toLowerCase() ?? "";
    const activeInn = activeAccount?.activeCustomerInn ?? activeAccount?.customers?.[0]?.inn ?? "";

    const handleSelectCompany = (c: CompanyRow) => {
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === c.login);
        if (!acc) return;
        onSwitchAccount(acc.id);
        if (c.inn !== undefined && c.inn !== null) {
            onUpdateAccount(acc.id, { activeCustomerInn: c.inn });
        }
    };

    const handleRemoveByLogin = (login: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const acc = accounts.find((a) => a.login.trim().toLowerCase() === login);
        if (acc) onRemoveAccount(acc.id);
    };

    return (
        <div className="w-full">
            <Flex align="center" style={{ marginBottom: "1rem", gap: "0.75rem" }}>
                <Button className="filter-button" onClick={onBack} style={{ padding: "0.5rem" }}><ArrowLeft className="w-4 h-4" /></Button>
                <Typography.Headline style={{ fontSize: "1.25rem" }}>Мои компании</Typography.Headline>
            </Flex>
            {loading ? (
                <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Загрузка…</Typography.Body>
                </Panel>
            ) : companies.length === 0 ? (
                <Panel className="cargo-card" style={{ padding: "1rem", textAlign: "center" }}>
                    <Typography.Body style={{ fontSize: "0.9rem", color: "var(--color-text-secondary)" }}>Нет добавленных компаний</Typography.Body>
                </Panel>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
                    {companies.map((c) => {
                        const isActive = activeLogin === c.login && (c.inn === "" || c.inn === activeInn);
                        return (
                            <Panel
                                key={`${c.login}-${c.inn}`}
                                className="cargo-card"
                                style={{ padding: "0.75rem 1rem", cursor: "pointer", borderLeft: isActive ? "3px solid var(--color-primary)" : undefined }}
                                onClick={() => handleSelectCompany(c)}
                            >
                                <Flex align="center" justify="space-between">
                                    <Typography.Body style={{ fontSize: "0.9rem", fontWeight: isActive ? 600 : "normal", overflow: "hidden", textOverflow: "ellipsis" }}>{stripOoo(c.name)}</Typography.Body>
                                    <Flex align="center" style={{ gap: "0.5rem", flexShrink: 0 }}>
                                        {isActive && <span className="status-value success">Активна</span>}
                                        {accounts.length > 1 && (
                                            <Button className="filter-button" onClick={(e) => handleRemoveByLogin(c.login, e)} style={{ padding: "0.25rem 0.5rem", minWidth: "auto" }} title="Удалить учётную запись"><Trash2 className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} /></Button>
                                        )}
                                    </Flex>
                                </Flex>
                            </Panel>
                        );
                    })}
                </div>
            )}
            <Button className="button-primary" onClick={onAddCompany} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", fontSize: "0.9rem", padding: "0.75rem" }}>
                <Plus className="w-4 h-4" />Добавить компанию
            </Button>
        </div>
    );
}

// --- PROFILE PAGE (main) ---
export function ProfilePage({
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
    onUpdateAccount: (accountId: string, patch: Partial<Account>) => void;
}) {
    const [currentView, setCurrentView] = useState<ProfileView>('main');
    const activeAccount = accounts.find(acc => acc.id === activeAccountId) || null;
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
    const [twoFactorMethod, setTwoFactorMethod] = useState<"google" | "telegram">("google");
    const [twoFactorTelegramLinked, setTwoFactorTelegramLinked] = useState(false);
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
    const [tgLinkError, setTgLinkError] = useState<string | null>(null);

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
        } catch { return false; }
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
        } finally { setTgLinkChecking(false); }
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

    const settingsItems = [
        { id: 'companies', label: 'Мои компании', icon: <Building2 className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => setCurrentView('companies') },
        { id: 'voiceAssistants', label: 'Голосовые помощники', icon: <Mic className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => setCurrentView('voiceAssistants') },
    ];
    const faqItems = [
        { q: "Как войти в мини‑приложение?", a: "Введите логин и пароль от личного кабинета HAULZ.", img: "/faq-account.svg", alt: "Вход" },
        { q: "Как добавить другую компанию?", a: "Откройте «Профиль» → «Мои компании».", img: "/faq-account.svg", alt: "Компании" },
        { q: "Почему не вижу некоторые грузы?", a: "Проверьте выбранный аккаунт и фильтры, период дат.", img: "/faq-troubleshoot.svg", alt: "Грузы" },
        { q: "Где найти документы по перевозке?", a: "Откройте карточку груза и кнопку «Поделиться».", img: "/faq-docs.svg", alt: "Документы" },
        { q: "Как работает чат поддержки?", a: "В разделе «Поддержка» задайте вопрос. AI‑помощник и оператор.", img: "/faq-support.svg", alt: "Чат" },
        { q: "Как быстро найти груз по номеру?", a: "Строка поиска вверху списка грузов.", img: "/faq-troubleshoot.svg", alt: "Поиск" },
        { q: "Где посмотреть информацию о компании?", a: "В профиле раздел «О компании».", img: "/faq-account.svg", alt: "О компании" },
    ];
    const infoItems = [
        { id: 'about', label: 'О компании', icon: <Info className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => setCurrentView('about') },
        { id: 'faq', label: 'FAQ', icon: <MessageCircle className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => setCurrentView('faq') },
        { id: 'offer', label: 'Публичная оферта', icon: <FileText className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => onOpenOffer() },
        { id: 'consent', label: 'Согласие на обработку данных', icon: <Shield className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />, onClick: () => onOpenPersonalConsent() },
    ];

    if (currentView === 'companies') {
        return <CompaniesListPage accounts={accounts} activeAccountId={activeAccountId} onSwitchAccount={onSwitchAccount} onRemoveAccount={onRemoveAccount} onUpdateAccount={onUpdateAccount} onBack={() => setCurrentView('main')} onAddCompany={() => setCurrentView('addCompanyMethod')} />;
    }
    if (currentView === 'addCompanyMethod') {
        return <CompaniesPage onBack={() => setCurrentView('companies')} onSelectMethod={(method) => setCurrentView(method === 'inn' ? 'addCompanyByINN' : 'addCompanyByLogin')} />;
    }
    if (currentView === 'addCompanyByINN') {
        return <AddCompanyByINNPage onBack={() => setCurrentView('addCompanyMethod')} onSuccess={() => setCurrentView('companies')} />;
    }
    if (currentView === 'addCompanyByLogin') {
        return <AddCompanyByLoginPage onBack={() => setCurrentView('addCompanyMethod')} onAddAccount={onAddAccount} onSuccess={() => setCurrentView('companies')} />;
    }
    if (currentView === 'tinyurl-test') {
        return <TinyUrlTestPage onBack={() => setCurrentView('main')} />;
    }
    if (currentView === 'about') {
        return <AboutCompanyPage onBack={() => setCurrentView('main')} />;
    }
    if (currentView === 'voiceAssistants') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Голосовые помощники</Typography.Headline>
                </Flex>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Алиса</Typography.Body>
                <Panel className="cargo-card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Typography.Body style={{ fontSize: '0.9rem' }}>Скажите Алисе: «Запусти навык Холз» и назовите код ниже. После привязки Алиса подтвердит компанию.</Typography.Body>
                    <Button className="button-primary" type="button" disabled={!activeAccount?.login || !activeAccount?.password || aliceLoading} onClick={async () => {
                        if (!activeAccount?.login || !activeAccount?.password) return;
                        try {
                            setAliceError(null); setAliceSuccess(null); setAliceLoading(true);
                            const res = await fetch("/api/alice-link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: activeAccount.login, password: activeAccount.password, customer: activeAccount.customer || null, inn: activeAccount.activeCustomerInn ?? undefined }) });
                            if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err?.error || "Не удалось получить код"); }
                            const data = await res.json();
                            setAliceCode(String(data?.code || ""));
                            setAliceExpiresAt(Date.now() + (Number(data?.ttl || 0) * 1000));
                        } catch (e: any) { setAliceError(e?.message || "Не удалось получить код"); } finally { setAliceLoading(false); }
                    }}>{aliceLoading ? <Loader2 className="animate-spin w-4 h-4" /> : "Получить код для Алисы"}</Button>
                    {aliceCode && <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>Код: {aliceCode}</Typography.Body>}
                    {aliceExpiresAt && <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Код действует до {new Date(aliceExpiresAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</Typography.Body>}
                    {aliceError && <Flex align="center" className="login-error"><AlertTriangle className="w-4 h-4 mr-2" /><Typography.Body style={{ fontSize: '0.85rem' }}>{aliceError}</Typography.Body></Flex>}
                    {aliceSuccess && <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success, #22c55e)' }}>{aliceSuccess}</Typography.Body>}
                    <Button className="filter-button" type="button" disabled={!activeAccount?.login} onClick={async () => {
                        if (!activeAccount?.login) return;
                        try {
                            setAliceError(null); setAliceSuccess(null);
                            const res = await fetch("/api/alice-unlink", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ login: activeAccount.login.trim().toLowerCase() }) });
                            const data = await res.json().catch(() => ({}));
                            if (res.ok && data?.ok) { setAliceCode(null); setAliceExpiresAt(null); setAliceSuccess(data?.message || "Алиса отвязана от аккаунта."); } else { setAliceError(data?.error || "Не удалось отвязать."); }
                        } catch (e: any) { setAliceError(e?.message || "Ошибка сети."); }
                    }} style={{ marginTop: '0.25rem' }}>Отвязать от Алисы</Button>
                </Panel>
            </div>
        );
    }
    if (currentView === 'notifications') {
        return <NotificationsPage activeAccount={activeAccount} activeAccountId={activeAccountId} onBack={() => setCurrentView('main')} onOpenDeveloper={onOpenNotifications} onOpenTelegramBot={onOpenTelegramBot} onUpdateAccount={onUpdateAccount} />;
    }
    if (currentView === 'faq') {
        return (
            <div className="w-full">
                <Flex align="center" style={{ marginBottom: '1rem', gap: '0.75rem' }}>
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>FAQ</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {faqItems.map((item, idx) => (
                        <Panel key={`${item.q}-${idx}`} className="cargo-card" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                            <img src={item.img} alt={item.alt} style={{ width: '44px', height: '44px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0 }} loading="lazy" />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                                <Typography.Body style={{ fontSize: '0.9rem', fontWeight: 600 }}>{item.q}</Typography.Body>
                                <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{item.a}</Typography.Body>
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
                    <Button className="filter-button" onClick={() => setCurrentView('main')} style={{ padding: '0.5rem' }}><ArrowLeft className="w-4 h-4" /></Button>
                    <Typography.Headline style={{ fontSize: '1.25rem' }}>Двухфакторная аутентификация (2FA)</Typography.Headline>
                </Flex>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between">
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Google Authenticator</Typography.Body>
                            <TapSwitch checked={twoFactorEnabled && twoFactorMethod === 'google'} onToggle={() => {
                                if (twoFactorEnabled && twoFactorMethod === 'google') {
                                    setTwoFactorEnabled(false); setTwoFactorMethod('telegram'); setGoogleSetupData(null); setGoogleSetupStep('idle');
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: false });
                                } else {
                                    setTwoFactorMethod('google'); setTwoFactorEnabled(true);
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: true });
                                }
                            }} />
                        </Flex>
                        {showGoogleSetup && (
                            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {googleSetupStep === 'idle' && !googleSetupData && (
                                    <>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Отсканируйте QR-код в приложении Google Authenticator.</Typography.Body>
                                        <Button className="filter-button" size="small" disabled={googleSetupLoading} onClick={async () => {
                                            if (!activeAccount?.login) return;
                                            setGoogleSetupError(null); setGoogleSetupLoading(true);
                                            try {
                                                const res = await fetch('/api/2fa-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: activeAccount.login, action: 'setup' }) });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data?.error || 'Ошибка настройки');
                                                setGoogleSetupData({ otpauthUrl: data.otpauthUrl, secret: data.secret }); setGoogleSetupStep('qr');
                                            } catch (e: any) { setGoogleSetupError(e?.message || 'Не удалось начать настройку'); } finally { setGoogleSetupLoading(false); }
                                            }} style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}>{googleSetupLoading ? 'Загрузка…' : 'Настроить Google Authenticator'}</Button>
                                    </>
                                )}
                                {(googleSetupStep === 'qr' || googleSetupData) && googleSetupData && googleSetupStep !== 'verify' && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                                            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(googleSetupData.otpauthUrl)}`} alt="QR" style={{ width: 200, height: 200 }} />
                                        </div>
                                        <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Ключ: <code style={{ wordBreak: 'break-all', fontSize: '0.8rem' }}>{googleSetupData.secret}</code></Typography.Body>
                                        <Button className="filter-button" size="small" onClick={() => { setGoogleSetupStep('verify'); setGoogleVerifyCode(''); setGoogleSetupError(null); }} style={{ fontSize: '0.85rem', alignSelf: 'flex-start' }}>Добавил в приложение</Button>
                                    </>
                                )}
                                {googleSetupStep === 'verify' && googleSetupData && (
                                    <form onSubmit={async (e) => {
                                        e.preventDefault();
                                        if (!activeAccount?.login || !googleVerifyCode.trim()) return;
                                        setGoogleSetupError(null); setGoogleSetupLoading(true);
                                        try {
                                            const res = await fetch('/api/2fa-google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: activeAccount.login, action: 'verify', code: googleVerifyCode.trim() }) });
                                            const data = await res.json();
                                            if (!res.ok) throw new Error(data?.error || 'Неверный код');
                                            await fetch('/api/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: activeAccount.login, enabled: true, method: 'google', telegramLinked: false }) });
                                            onUpdateAccount(activeAccountId, { twoFactorEnabled: true, twoFactorMethod: 'google', twoFactorGoogleSecretSet: true });
                                            setGoogleSetupData(null); setGoogleSetupStep('idle'); setGoogleVerifyCode('');
                                        } catch (err: any) { setGoogleSetupError(err?.message || 'Неверный код'); } finally { setGoogleSetupLoading(false); }
                                    }} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                        <Typography.Body style={{ fontSize: '0.85rem' }}>Введите 6-значный код из приложения</Typography.Body>
                                        <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={googleVerifyCode} onChange={(e) => setGoogleVerifyCode(e.target.value.replace(/\D/g, ''))} style={{ padding: '0.5rem', fontSize: '1rem', textAlign: 'center', letterSpacing: '0.25em' }} />
                                        <Button type="submit" className="button-primary" disabled={googleVerifyCode.length !== 6 || googleSetupLoading} style={{ alignSelf: 'flex-start' }}>{googleSetupLoading ? 'Проверка…' : 'Подтвердить'}</Button>
                                        {googleSetupError && <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-error-status)' }}>{googleSetupError}</Typography.Body>}
                                    </form>
                                )}
                            </div>
                        )}
                        {twoFactorEnabled && twoFactorMethod === 'google' && googleSecretSet && <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)', marginTop: '0.5rem' }}>Google Authenticator настроен</Typography.Body>}
                    </Panel>
                    <Panel className="cargo-card" style={{ padding: '1rem' }}>
                        <Flex align="center" justify="space-between">
                            <Typography.Body style={{ fontSize: '0.9rem' }}>Telegram</Typography.Body>
                            <TapSwitch checked={twoFactorEnabled && twoFactorMethod === 'telegram'} onToggle={() => {
                                if (twoFactorEnabled && twoFactorMethod === 'telegram') {
                                    setTwoFactorEnabled(false); setTwoFactorMethod('google');
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: 'google', twoFactorEnabled: false });
                                } else {
                                    setTwoFactorMethod('telegram'); setTwoFactorEnabled(true);
                                    onUpdateAccount(activeAccountId, { twoFactorMethod: 'telegram', twoFactorEnabled: true });
                                }
                            }} />
                        </Flex>
                        {twoFactorEnabled && twoFactorMethod === 'telegram' && (
                            twoFactorTelegramLinked ? <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-success-status)' }}>Telegram привязан</Typography.Body>
                                : onOpenTelegramBot ? <Button className="filter-button" size="small" disabled={tgLinkChecking} onClick={async () => { setTgLinkError(null); try { await onOpenTelegramBot(); void pollTelegramLink(); } catch (e: any) { setTgLinkError(e?.message || 'Не удалось открыть бота.'); } }} style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{tgLinkChecking ? 'Проверка…' : 'Привязать Telegram'}</Button>
                                : <Typography.Body style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Откройте бота для привязки</Typography.Body>
                        )}
                    </Panel>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full">
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '1.25rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Настройки</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {settingsItems.map((item) => (
                        <Panel key={item.id} className="cargo-card" onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}>
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}><div style={{ color: 'var(--color-primary)' }}>{item.icon}</div><Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body></Flex>
                        </Panel>
                    ))}
                </div>
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Безопасность</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {activeAccountId && activeAccount && (
                        <Panel className="cargo-card" onClick={() => setCurrentView('2fa')} style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}>
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}><div style={{ color: 'var(--color-primary)' }}><Shield className="w-5 h-5" /></div><Typography.Body style={{ fontSize: '0.9rem' }}>Двухфакторная аутентификация (2FA)</Typography.Body></Flex>
                        </Panel>
                    )}
                    <Panel className="cargo-card" onClick={() => setCurrentView('notifications')} style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}>
                        <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}><div style={{ color: 'var(--color-primary)' }}><Bell className="w-5 h-5" /></div><Typography.Body style={{ fontSize: '0.9rem' }}>Уведомления</Typography.Body></Flex>
                    </Panel>
                </div>
            </div>
            <div>
                <Typography.Body style={{ marginBottom: '0.75rem', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Информация</Typography.Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {infoItems.map((item) => (
                        <Panel key={item.id} className="cargo-card" onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', padding: '1rem', cursor: 'pointer' }}>
                            <Flex align="center" style={{ flex: 1, gap: '0.75rem' }}><div style={{ color: 'var(--color-primary)' }}>{item.icon}</div><Typography.Body style={{ fontSize: '0.9rem' }}>{item.label}</Typography.Body></Flex>
                        </Panel>
                    ))}
                </div>
            </div>
        </div>
    );
}
