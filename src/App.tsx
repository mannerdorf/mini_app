import { FormEvent, useEffect, useState, useCallback, useMemo } from "react";
// Импортируем все необходимые иконки
import { 
    LogOut, Home, Truck, FileText, MessageCircle, User, Loader2, Moon, Sun, Eye, EyeOff, AlertTriangle, Package, Calendar, Tag, Layers, Weight, Filter, X, Search, ChevronDown, User as UserIcon, Scale, DollarSign, List, Download, FileText as FileTextIcon
} from 'lucide-react';
import React from "react";

// --- ТИПЫ ДАННЫХ ---
type ApiError = {
    error?: string;
    [key: string]: unknown;
};

type AuthData = {
    login: string;
    password: string;
};

type Tab = "home" | "cargo" | "docs" | "support" | "profile";

type DateFilter = "all" | "сегодня" | "неделя" | "месяц" | "период";
type StatusFilter = "all" | "accepted" | "in_transit" | "ready" | "delivering" | "delivered";

// Тип для данных о перевозке (для ясности)
type CargoItem = {
    Number?: string; // Номер перевозки
    DatePrih?: string; // Дата прихода
    DateVruch?: string; // Дата вручения (если есть)
    State?: string; // Статус
    Mest?: number | string; // Кол-во мест
    PV?: number | string; // Платный вес (Payment Weight)
    Weight?: number | string; // Общий вес
    Volume?: number | string; // Объем
    Sum?: number | string; // Стоимость
    StatusSchet?: string; // Статус счета
    [key: string]: any; // Дополнительные поля
};


// --- КОНФИГУРАЦИЯ ---
const PROXY_API_BASE_URL = '/api/perevozki'; 

// --- КОНСТАНТЫ ---
const DEFAULT_LOGIN = "order@lal-auto.com";
const DEFAULT_PASSWORD = "ZakaZ656565";

// Получаем текущую дату в формате YYYY-MM-DD
const getTodayDate = () => new Date().toISOString().split('T')[0];

// Получаем дату, отстоящую на ШЕСТЬ МЕСЯЦЕВ назад
const getSixMonthsAgoDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - 6); 
    return d.toISOString().split('T')[0];
};

const DEFAULT_DATE_FROM = getSixMonthsAgoDate(); // 6 месяцев назад
const DEFAULT_DATE_TO = getTodayDate(); // Сегодня

// --- УТИЛИТЫ ДЛЯ ДАТ ---

const getDateRange = (filter: DateFilter) => {
    const today = new Date();
    const dateTo = getTodayDate();
    let dateFrom = getTodayDate();

    switch (filter) {
        case 'all': // 6 месяцев по умолчанию
            dateFrom = getSixMonthsAgoDate();
            break;
        case 'today':
            dateFrom = getTodayDate();
            break;
        case 'week':
            today.setDate(today.getDate() - 7);
            dateFrom = today.toISOString().split('T')[0];
            break;
        case 'month':
            today.setMonth(today.getMonth() - 1);
            dateFrom = today.toISOString().split('T')[0];
            break;
        case 'custom':
        case 'all':
        default:
            break;
    }
    return { dateFrom, dateTo };
}


export default function App() {
    const [login, setLogin] = useState(DEFAULT_LOGIN); 
    const [password, setPassword] = useState(DEFAULT_PASSWORD); 
    const [agreeOffer, setAgreeOffer] = useState(true);
    const [agreePersonal, setAgreePersonal] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false); 

    const [auth, setAuth] = useState<AuthData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>("cargo");
    const [theme, setTheme] = useState('dark'); 
    
    // Состояние для поиска (в шапке)
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);
    const [searchText, setSearchText] = useState('');

    // Применяем класс темы к body
    useEffect(() => {
        document.body.className = `${theme}-mode`;
    }, [theme]);

    
    // Функция для применения поиска (передаем в CargoPage)
    const handleSearch = (text: string) => {
        // Логика поиска будет передана в CargoPage
        setSearchText(text.toLowerCase().trim());
    }

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError(null);

        const cleanLogin = login.trim();
        const cleanPassword = password.trim();

        if (!cleanLogin || !cleanPassword) {
            setError("Введите логин и пароль");
            return;
        }

        if (!agreeOffer || !agreePersonal) {
            setError("Подтвердите согласие с условиями");
            return;
        }

        try {
            setLoading(true);

            const { dateFrom, dateTo } = getDateRange("all"); // Начальный запрос на 6 месяцев
            
            // Отправляем POST-запрос с логином/паролем в теле (для проверки авторизации)
            const res = await fetch(PROXY_API_BASE_URL, {
                method: "POST", 
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ 
                    login: cleanLogin, 
                    password: cleanPassword,
                    dateFrom: dateFrom, 
                    dateTo: dateTo 
                }),
            });

            if (!res.ok) {
                let message = `Ошибка авторизации: ${res.status}. Проверьте логин и пароль.`;
                if (res.status === 401) {
                    message = "Ошибка авторизации (401). Неверный логин/пароль.";
                } else if (res.status === 405) {
                    message = "Ошибка: Метод не разрешен (405). Проверьте, что ваш прокси-файл ожидает метод POST.";
                }
                
                try {
                    const errorData = await res.json() as ApiError;
                    if (errorData.error) {
                         message = errorData.error;
                    }
                } catch { /* ignore */ }
                
                setError(message);
                setAuth(null);
                return;
            }

            // Авторизация ок
            setAuth({ login: cleanLogin, password: cleanPassword });
            setActiveTab("cargo");
            setError(null);
        } catch (err: any) {
            setError(err?.message || "Ошибка сети. Проверьте адрес прокси.");
            setAuth(null);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        setAuth(null);
        setActiveTab("cargo");
        setError(null);
        setPassword(DEFAULT_PASSWORD); 
        setIsSearchExpanded(false); // Сброс
        setSearchText(''); // Сброс
    }

    // Встраиваем стили
    const injectedStyles = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
                
        * {
            box-sizing: border-box;
        }
        body {
            margin: 0;
            background-color: var(--color-bg-primary); 
            font-family: 'Inter', sans-serif;
            transition: background-color 0.3s, color 0.3s;
        }
        
        /* --------------------------------- */
        /* --- THEME VARIABLES --- */
        /* --------------------------------- */
        
        :root {
            /* Dark Mode Defaults */
            --color-bg-primary: #1f2937; /* gray-900 - Фон страницы */
            --color-bg-secondary: #374151; /* gray-800 - Фон шапки/таббара */
            --color-bg-card: #374151; /* gray-800 - Фон карточек/модалов */
            --color-bg-hover: #4b5563; /* gray-600 */
            --color-bg-input: #4b5563; /* gray-600 */
            --color-text-primary: #e5e7eb; /* gray-100 */
            --color-text-secondary: #9ca3af; /* gray-400 */
            --color-border: #4b5563; /* gray-600 */
            --color-primary-blue: #3b82f6; /* blue-500 */
            
            --color-tumbler-bg-off: #6b7280; 
            --color-tumbler-bg-on: #3b82f6; 
            --color-tumbler-knob: white; 
            
            --color-error-bg: rgba(185, 28, 28, 0.1); 
            --color-error-border: #b91c1c; 
            --color-error-text: #fca5a5; 
            
            --color-success-status: #34d399; 
            --color-pending-status: #facc15; 

            --color-modal-bg: rgba(31, 41, 55, 0.9); /* Полупрозрачный фон модала (темный), более плотный */
            
            /* Новые цвета для фильтров */
            --color-filter-bg: var(--color-bg-input);
            --color-filter-border: var(--color-border);
            --color-filter-text: var(--color-text-primary);
        }
        
        .light-mode {
            --color-bg-primary: #f9fafb; 
            --color-bg-secondary: #ffffff; 
            --color-bg-card: #ffffff; 
            --color-bg-hover: #f3f4f6; 
            --color-bg-input: #f3f4f6; 
            --color-text-primary: #1f2937; 
            --color-text-secondary: #6b7280; 
            --color-border: #e5e7eb; 
            --color-primary-blue: #2563eb; 

            --color-tumbler-bg-off: #ccc; 
            --color-tumbler-bg-on: #2563eb; 
            --color-tumbler-knob: white; 

            --color-error-bg: #fee2e2;
            --color-error-border: #fca5a5;
            --color-error-text: #b91c1c;
            
            --color-success-status: #10b981; 
            --color-pending-status: #f59e0b; 

            --color-modal-bg: rgba(249, 250, 251, 0.9); /* Полупрозрачный фон модала (светлый), более плотный */

            --color-filter-bg: #ffffff;
            --color-filter-border: #e5e7eb;
            --color-filter-text: #1f2937;
        }

        /* --------------------------------- */
        /* --- GENERAL & UTILS --- */
        /* --------------------------------- */
        .app-container {
            min-height: 100vh;
            color: var(--color-text-primary);
            font-family: 'Inter', sans-serif;
            display: flex;
            flex-direction: column;
        }
        .text-theme-text { color: var(--color-text-primary); }
        .text-theme-secondary { color: var(--color-text-secondary); }
        .text-theme-primary { color: var(--color-primary-blue); }
        .border-theme-border { border-color: var(--color-border); }
        .hover\\:bg-theme-hover-bg:hover { background-color: var(--color-bg-hover); }
        .title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 0.5rem;
        }
        .subtitle {
            font-size: 0.9rem;
            color: var(--color-text-secondary);
            margin-bottom: 1.5rem;
        }
        .login-error {
            padding: 0.75rem;
            background-color: var(--color-error-bg);
            border: 1px solid var(--color-error-border);
            color: var(--color-error-text); 
            font-size: 0.875rem;
            border-radius: 0.5rem;
            margin-top: 1rem;
            display: flex;
            align-items: center;
        }
        
        /* --------------------------------- */
        /* --- LOGIN PAGE STYLES --- */
        /* --------------------------------- */
        .login-form-wrapper {
            padding: 2rem 1rem;
            align-items: center;
            justify-content: center;
        }
        .login-card {
            width: 100%;
            max-width: 400px;
            padding: 1.5rem;
            background-color: var(--color-bg-card);
            border-radius: 1rem;
            box-shadow: 0 10px 15px rgba(0, 0, 0, 0.2);
            position: relative;
            border: 1px solid var(--color-border);
        }
        .logo-text {
            font-size: 2rem;
            font-weight: 900;
            letter-spacing: 0.1em;
            color: var(--color-primary-blue);
        }
        .tagline {
            font-size: 1rem;
            color: var(--color-text-secondary);
            margin-bottom: 1.5rem;
            text-align: center;
        }
        .form .field {
            margin-bottom: 1rem;
        }
        
        /* --------------------------------- */
        /* --- PASSWORD INPUT FIX --- */
        /* --------------------------------- */
        .password-input-container {
            position: relative; 
            width: 100%;
        }
        .login-input {
            width: 100%;
            padding: 0.75rem 1rem;
            padding-right: 3rem; /* Отступ справа для иконки */
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            background-color: var(--color-bg-input);
            color: var(--color-text-primary);
            outline: none;
            transition: border-color 0.15s;
        }
        .login-input:focus {
            border-color: var(--color-primary-blue);
        }
        .toggle-password-visibility {
            position: absolute;
            right: 0.75rem;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            color: var(--color-text-secondary);
            padding: 0;
            display: flex; 
            align-items: center;
            justify-content: center;
        }
        .toggle-password-visibility:hover {
             color: var(--color-primary-blue);
        }
        
        /* --------------------------------- */
        /* --- SWITCH (Tumbler) STYLES --- */
        /* --------------------------------- */
        .checkbox-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 0.875rem;
            color: var(--color-text-secondary);
            margin-bottom: 0.75rem;
        }
        .checkbox-row a {
            color: var(--color-primary-blue);
            text-decoration: none;
        }
        .switch-container {
            width: 40px;
            height: 22px;
            background-color: var(--color-tumbler-bg-off);
            border-radius: 11px;
            position: relative;
            cursor: pointer;
            transition: background-color 0.3s;
            flex-shrink: 0;
        }
        .switch-container.checked {
            background-color: var(--color-tumbler-bg-on);
        }
        .switch-knob {
            width: 18px;
            height: 18px;
            background-color: var(--color-tumbler-knob);
            border-radius: 50%;
            position: absolute;
            top: 2px;
            left: 2px;
            transition: transform 0.3s, background-color 0.3s;
        }
        .switch-container.checked .switch-knob {
            transform: translateX(18px);
        }

        /* --------------------------------- */
        /* --- BUTTONS & HEADER --- */
        /* --------------------------------- */
        .button-primary {
            background-color: var(--color-primary-blue);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 0.75rem;
            font-weight: 600;
            transition: background-color 0.15s;
            border: none;
            cursor: pointer;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
            width: 100%;
        }
        .button-primary:hover:not(:disabled) {
            background-color: #2563eb; 
        }
        .button-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            box-shadow: none;
        }
        .app-header {
            padding: 0.5rem 1rem;
            background-color: var(--color-bg-secondary);
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            display: flex;
            flex-direction: column; /* Поиск под шапкой */
            position: sticky;
            top: 0;
            z-index: 10;
            border-bottom: 1px solid var(--color-border);
        }
        .header-top-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            height: 40px; /* Фиксированная высота для верхнего ряда */
        }
        .header-auth-info {
            display: flex;
            align-items: center;
            font-weight: 600;
            font-size: 0.9rem;
            color: var(--color-text-primary);
        }
        .header-auth-info .user-icon {
            color: var(--color-primary-blue);
            margin-right: 0.5rem;
        }
        .app-main {
            flex-grow: 1;
            padding: 1.5rem 1rem 5.5rem 1rem; 
            display: flex;
            justify-content: center;
            width: 100%;
        }

        /* --------------------------------- */
        /* --- SEARCH BAR --- */
        /* --------------------------------- */
        .search-container {
            display: flex;
            align-items: center;
            overflow: hidden;
            transition: max-width 0.3s ease-in-out, opacity 0.3s;
            margin-top: 0.5rem;
            margin-bottom: 0.5rem;
            border-radius: 0.5rem;
            background-color: var(--color-bg-input);
        }
        .search-container.expanded {
            max-width: 100%;
            opacity: 1;
            height: 40px;
            padding: 0 0.5rem;
        }
        .search-container.collapsed {
            max-width: 0;
            opacity: 0;
            height: 0;
            padding: 0;
            margin-top: 0;
            margin-bottom: 0;
        }
        .search-input {
            flex-grow: 1;
            border: none;
            background: none;
            outline: none;
            padding: 0.5rem 0.5rem;
            color: var(--color-text-primary);
            font-size: 0.9rem;
        }
        .search-input::placeholder {
            color: var(--color-text-secondary);
        }
        .search-toggle-button {
            background: none;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 0.5rem;
        }
        .search-toggle-button:hover {
            color: var(--color-primary-blue);
        }
        
        /* --------------------------------- */
        /* --- CARGO PAGE FILTERS --- */
        /* --------------------------------- */
        .filters-container {
            display: flex;
            gap: 1rem;
            margin-bottom: 1.5rem;
            flex-wrap: wrap; /* Для мобильных */
        }
        .filter-group {
            position: relative;
            flex-grow: 1;
            min-width: 120px;
        }
        .filter-button {
            display: flex;
            align-items: center;
            justify-content: space-between;
            width: 100%;
            background-color: var(--color-filter-bg);
            color: var(--color-filter-text);
            border: 1px solid var(--color-filter-border);
            padding: 0.75rem 1rem;
            border-radius: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: background-color 0.15s, border-color 0.15s;
            font-size: 0.875rem;
        }
        .filter-button:hover {
             border-color: var(--color-primary-blue);
        }
        .filter-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background-color: var(--color-bg-card);
            border: 1px solid var(--color-border);
            border-radius: 0.5rem;
            margin-top: 0.25rem;
            z-index: 30;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            overflow: hidden;
        }
        .dropdown-item {
            padding: 0.75rem 1rem;
            cursor: pointer;
            transition: background-color 0.15s;
            font-size: 0.875rem;
            color: var(--color-text-primary);
        }
        .dropdown-item:hover {
            background-color: var(--color-bg-hover);
        }
        .dropdown-item.selected {
            background-color: var(--color-primary-blue);
            color: white;
            font-weight: 700;
        }

        /* Остальные стили для CargoPage, TabBar и т.д. остаются как в предыдущей версии */
        .cargo-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        .cargo-card {
            background-color: var(--color-bg-card);
            border-radius: 0.75rem;
            border: 1px solid var(--color-border);
            padding: 1rem;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            font-size: 0.875rem;
            cursor: pointer; /* Делаем кликабельным */
            transition: transform 0.15s, box-shadow 0.15s;
        }
        .cargo-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 10px rgba(59, 130, 246, 0.2); /* Легкий синий оттенок при наведении */
        }
        .cargo-header-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 700;
            margin-bottom: 0.75rem;
            padding-bottom: 0.5rem;
            border-bottom: 1px solid var(--color-border);
        }
        .cargo-header-row .order-number {
            font-size: 1rem;
            color: var(--color-primary-blue);
        }
        .cargo-header-row .date {
             display: flex;
             align-items: center;
             font-size: 0.9rem;
             color: var(--color-text-secondary);
        }
        .cargo-details-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr); 
            gap: 0.5rem;
            margin-bottom: 1rem;
        }
        .detail-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            text-align: center;
            padding: 0.5rem 0;
            border-radius: 0.5rem;
            background-color: var(--color-bg-hover);
        }
        .detail-item-label {
            font-size: 0.65rem;
            text-transform: uppercase;
            color: var(--color-text-secondary);
            font-weight: 600;
            margin-top: 0.25rem;
        }
        .detail-item-value {
            font-size: 0.875rem;
            font-weight: 700;
        }
        .status-value {
             color: var(--color-pending-status); 
             font-size: 0.8rem;
        }
        .status-value.success {
             color: var(--color-success-status); 
        }
        .cargo-footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding-top: 0.75rem;
            border-top: 1px dashed var(--color-border);
        }
        .cargo-footer .sum-label {
            font-weight: 600;
            color: var(--color-text-primary);
        }
        .cargo-footer .sum-value {
            font-size: 1.1rem;
            font-weight: 900;
            color: var(--color-primary-blue);
        }
        @media (min-width: 640px) {
            .cargo-list {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
                gap: 1.5rem;
            }
        }
        /* --------------------------------- */
        /* --- MODAL STYLES (GENERAL & CARGO) --- */
        /* --------------------------------- */
        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: var(--color-modal-bg);
            display: flex;
            justify-content: center;
            align-items: flex-start;
            padding-top: 5vh;
            z-index: 50;
            overflow-y: auto; /* Для длинного контента */
        }
        .modal-content {
            background-color: var(--color-bg-card);
            border-radius: 1rem;
            padding: 1.5rem;
            width: 90%;
            max-width: 500px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
            border: 1px solid var(--color-border);
            animation: fadeIn 0.3s;
            margin-bottom: 2rem; /* Отступ снизу для прокрутки */
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 1.5rem;
        }
        .modal-header h3 {
            margin: 0;
            font-size: 1.25rem;
            font-weight: 700;
        }
        .modal-close-button {
            background: none;
            border: none;
            color: var(--color-text-secondary);
            cursor: pointer;
            padding: 0;
        }
        .modal-close-button:hover {
            color: var(--color-text-primary);
        }

        /* Cargo Details Specific Styles */
        .details-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 1rem;
            margin-bottom: 1.5rem;
        }
        @media (min-width: 400px) {
            .details-grid {
                grid-template-columns: 1fr 1fr;
            }
        }
        .details-item {
            padding: 0.75rem 1rem;
            background-color: var(--color-bg-hover);
            border-radius: 0.5rem;
        }
        .details-label {
            font-size: 0.75rem;
            color: var(--color-text-secondary);
            text-transform: uppercase;
            font-weight: 600;
            margin-bottom: 0.25rem;
        }
        .details-value {
            font-size: 1rem;
            font-weight: 700;
            color: var(--color-text-primary);
        }
        .document-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 0.75rem;
            padding-top: 1rem;
            border-top: 1px solid var(--color-border);
        }
        .doc-button {
            display: flex;
            align-items: center;
            background-color: var(--color-primary-blue);
            color: white;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem;
            font-size: 0.875rem;
            font-weight: 600;
            cursor: pointer;
            border: none;
            transition: background-color 0.15s;
        }
        .doc-button:hover {
            background-color: #2563eb; 
        }
        .doc-button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            background-color: var(--color-bg-hover);
            color: var(--color-text-secondary);
        }


        /* --------------------------------- */
        /* --- TAB BAR (BOTTOM MENU) --- */
        /* --------------------------------- */
        .tabbar-container {
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            justify-content: space-around;
            background-color: var(--color-bg-secondary);
            padding: 0.5rem 0;
            box-shadow: 0 -4px 6px rgba(0, 0, 0, 0.1);
            z-index: 20;
            border-top: 1px solid var(--color-border);
            height: 60px; /* Фиксированная высота для аккуратности */
        }
        .tab-button {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0.25rem 0.25rem;
            min-width: 60px;
            transition: color 0.15s;
            flex-grow: 1;
        }
        .tab-button .tab-icon {
            /* Неактивный цвет по умолчанию */
            color: var(--color-text-secondary);
            transition: color 0.15s;
        }
        .tab-button .tab-label {
            font-size: 0.65rem; /* Немного меньше */
            font-weight: 600;
            /* Неактивный цвет по умолчанию */
            color: var(--color-text-secondary);
            transition: color 0.15s;
            margin-top: 2px;
        }
        /* Активное состояние */
        .tab-button.active .tab-icon,
        .tab-button.active .tab-label {
            color: var(--color-primary-blue); /* Активный синий цвет */
        }
    `;

    // --------------- ЭКРАН АВТОРИЗАЦИИ ---------------
    if (!auth) {
        return (
            <>
            <style>{injectedStyles}</style>
            
            <div className={`app-container login-form-wrapper`}>
                <div className="login-card">
                    <div className="flex justify-center mb-4 h-10 mt-6">
                        <div className="logo-text">HAULZ</div>
                    </div>
                    <div className="tagline">
                        Доставка грузов в Калининград и обратно
                    </div>

                    <form onSubmit={handleSubmit} className="form">
                        <div className="field">
                            <input
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
                                <input
                                    className="login-input"
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Пароль"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                />
                                <button 
                                    type="button" 
                                    className="toggle-password-visibility" 
                                    onClick={() => setShowPassword(!showPassword)}
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <label className="checkbox-row switch-wrapper">
                            <span>
                                Согласие с{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    публичной офертой
                                </a>
                            </span>
                            <div 
                                className={`switch-container ${agreeOffer ? 'checked' : ''}`}
                                onClick={() => setAgreeOffer(!agreeOffer)}
                            >
                                <div className="switch-knob"></div>
                            </div>
                        </label>

                        <label className="checkbox-row switch-wrapper">
                            <span>
                                Согласие на{" "}
                                <a href="#" target="_blank" rel="noreferrer">
                                    обработку персональных данных
                                </a>
                            </span>
                            <div 
                                className={`switch-container ${agreePersonal ? 'checked' : ''}`}
                                onClick={() => setAgreePersonal(!agreePersonal)}
                            >
                                <div className="switch-knob"></div>
                            </div>
                        </label>

                        <button className="button-primary mt-4 flex justify-center items-center" type="submit" disabled={loading}>
                            {loading ? (
                                <Loader2 className="animate-spin w-5 h-5" />
                            ) : (
                                "Подтвердить"
                            )}
                        </button>
                    </form>

                    {error && <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>}
                </div>
            </div>
            </>
        );
    }

    // --------------- АВТОРИЗОВАННАЯ ЧАСТЬ ---------------

    return (
        <div className={`app-container`}>
            <style>{injectedStyles}</style>

            <header className="app-header">
                <div className="header-top-row">
                    {/* ЛОГИН АВТОРИЗАЦИИ (ЛЕВЫЙ ВЕРХНИЙ УГОЛ) */}
                    <div className="header-auth-info">
                        <UserIcon className="w-4 h-4 user-icon" />
                        <span>{auth.login}</span>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                        {/* КНОПКА ПОИСКА */}
                        <button 
                            className="search-toggle-button" 
                            onClick={() => {
                                setIsSearchExpanded(!isSearchExpanded);
                                // При закрытии - сбрасываем текст
                                if (isSearchExpanded) {
                                    handleSearch('');
                                    setSearchText('');
                                }
                            }}
                            title="Поиск"
                        >
                            {isSearchExpanded ? <X className="w-5 h-5" /> : <Search className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
                
                {/* ПОЛЕ ПОИСКА (РАСШИРЯЮЩЕЕСЯ) */}
                <div className={`search-container ${isSearchExpanded ? 'expanded' : 'collapsed'}`}>
                    <Search className="w-5 h-5 text-theme-secondary flex-shrink-0 ml-1" />
                    <input
                        type="search"
                        placeholder="Поиск по любому значению..."
                        className="search-input"
                        value={searchText}
                        onChange={(e) => {
                            setSearchText(e.target.value);
                            handleSearch(e.target.value); // Применяем поиск при вводе
                        }}
                    />
                    {searchText && (
                         <button 
                            className="search-toggle-button" 
                            onClick={() => {
                                setSearchText('');
                                handleSearch('');
                            }}
                            title="Очистить"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </header>

            <div className="app-main">
                <div className="w-full max-w-4xl">
                    {activeTab === "cargo" && <CargoPage auth={auth} searchText={searchText} />}
                    {activeTab === "home" && <StubPage title="Главная" />}
                    {activeTab === "docs" && <StubPage title="Документы" />}
                    {activeTab === "support" && <StubPage title="Поддержка" />}
                    {activeTab === "profile" && <StubPage title="Профиль" />}
                </div>
            </div>

            <TabBar active={activeTab} onChange={setActiveTab} />
        </div>
    );
}

// ----------------- УТИЛИТЫ -----------------

// Функция для форматирования даты (например, из "2024-01-11T00:00:00" в "11.01.2024")
const formatDate = (dateString: string | undefined): string => {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString.includes('T') ? dateString : dateString + 'T00:00:00');
        if (!isNaN(date.getTime())) {
             return date.toLocaleDateString('ru-RU');
        }
    } catch (e) { /* ignore */ }
    return dateString;
};

// Функция для форматирования валюты
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

// Определяет класс статуса
const getStatusClass = (status: string | undefined) => {
    const lowerStatus = (status || '').toLowerCase();
    if (lowerStatus.includes('доставлен') || lowerStatus.includes('заверш')) {
        return 'status-value success';
    }
    return 'status-value';
};

// Map для статусов
const STATUS_MAP: Record<StatusFilter, string> = {
    "all": "Все",
    "accepted": "Принят",
    "in_transit": "В пути",
    "ready": "Готов к выдаче",
    "delivering": "На доставке",
    "delivered": "Доставлено",
};

// Функция для сопоставления статусов API с нашими фильтрами
const getFilterKeyByStatus = (status: string | undefined): StatusFilter => {
    if (!status) return "all";
    const lowerStatus = status.toLowerCase();
    if (lowerStatus.includes('доставлен') || lowerStatus.includes('заверш')) return "delivered";
    if (lowerStatus.includes('в пути')) return "in_transit";
    if (lowerStatus.includes('принят') || lowerStatus.includes('оформлен')) return "accepted";
    if (lowerStatus.includes('готов к выдаче')) return "ready";
    if (lowerStatus.includes('на доставке')) return "delivering";
    return "all";
}

// ----------------- КОМПОНЕНТ ФИЛЬТРАЦИИ (FilterDialog) -----------------

type FilterDialogProps = {
    isOpen: boolean;
    onClose: () => void;
    dateFrom: string;
    dateTo: string;
    onApply: (dateFrom: string, dateTo: string) => void;
};

function FilterDialog({ isOpen, onClose, dateFrom, dateTo, onApply }: FilterDialogProps) {
    const [tempDateFrom, setTempDateFrom] = useState(dateFrom);
    const [tempDateTo, setTempDateTo] = useState(dateTo);

    useEffect(() => {
        if (isOpen) {
            setTempDateFrom(dateFrom);
            setTempDateTo(dateTo);
        }
    }, [isOpen, dateFrom, dateTo]);

    if (!isOpen) return null;

    const handleApply = (e: FormEvent) => {
        e.preventDefault();
        onApply(tempDateFrom, tempDateTo);
        onClose();
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>Произвольный диапазон</h3>
                    <button className="modal-close-button" onClick={onClose}>
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleApply}>
                    <div className="modal-form-group">
                        <label htmlFor="dateFrom">Дата начала:</label>
                        <input
                            id="dateFrom"
                            type="date"
                            value={tempDateFrom}
                            onChange={(e) => setTempDateFrom(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-form-group">
                        <label htmlFor="dateTo">Дата окончания:</label>
                        <input
                            id="dateTo"
                            type="date"
                            value={tempDateTo}
                            onChange={(e) => setTempDateTo(e.target.value)}
                            required
                        />
                    </div>
                    <div className="modal-button-container">
                        <button className="button-primary" type="submit">
                            Применить
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}


// ----------------- КОМПОНЕНТ ДЕТАЛИЗАЦИИ ГРУЗА (CargoDetailsModal) -----------------

type CargoDetailsModalProps = {
    item: CargoItem;
    isOpen: boolean;
    onClose: () => void;
};

function CargoDetailsModal({ item, isOpen, onClose }: CargoDetailsModalProps) {
    if (!isOpen) return null;

    // Вспомогательная функция для отображения значения
    const renderValue = (value: number | string | undefined, unit: string = '') => {
        if (value === undefined || value === null || value === "") return '-';
        return `${value} ${unit}`;
    };

    // Заглушка для скачивания
    const handleDownload = (docType: string) => {
        alert(`Функция скачивания документа "${docType}" пока не реализована. Номер перевозки: ${item.Number || '-'}`);
        // Здесь будет логика запроса к API для получения ссылки на документ
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="flex items-center">
                        <Truck className="w-5 h-5 mr-2 text-theme-primary" />
                        Перевозка №{item.Number || '-'}
                    </h3>
                    <button className="modal-close-button" onClick={onClose}>
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <div className="details-grid">
                    {/* Номер перевозки */}
                    <div className="details-item">
                        <div className="details-label">Номер перевозки</div>
                        <div className="details-value">{item.Number || '-'}</div>
                    </div>
                    {/* Статус */}
                    <div className="details-item">
                        <div className="details-label">Статус</div>
                        <div className={getStatusClass(item.State)}>{item.State || '-'}</div>
                    </div>
                    {/* Дата прихода */}
                    <div className="details-item">
                        <div className="details-label">Дата прихода</div>
                        <div className="details-value">{formatDate(item.DatePrih)}</div>
                    </div>
                    {/* Дата вручения */}
                    <div className="details-item">
                        <div className="details-label">Дата вручения</div>
                        <div className="details-value">{formatDate(item.DateVruch)}</div>
                    </div>
                    {/* Кол-во мест */}
                    <div className="details-item">
                        <div className="details-label">Кол-во мест</div>
                        <div className="details-value flex items-center"><Layers className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Mest)}</div>
                    </div>
                    {/* Платный вес */}
                    <div className="details-item">
                        <div className="details-label">Платный вес</div>
                        <div className="details-value flex items-center"><Scale className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.PV || item.PaymentWeight, 'кг')}</div>
                    </div>
                    {/* Общий вес */}
                    <div className="details-item">
                        <div className="details-label">Общий вес</div>
                        <div className="details-value flex items-center"><Weight className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Weight, 'кг')}</div>
                    </div>
                    {/* Объем */}
                    <div className="details-item">
                        <div className="details-label">Объем</div>
                        <div className="details-value flex items-center"><List className="w-4 h-4 mr-1 text-theme-primary" />{renderValue(item.Volume, 'м³')}</div>
                    </div>
                    {/* Стоимость */}
                    <div className="details-item">
                        <div className="details-label">Стоимость</div>
                        <div className="details-value flex items-center"><DollarSign className="w-4 h-4 mr-1 text-theme-primary" />{formatCurrency(item.Sum || item.Total)}</div>
                    </div>
                    {/* Статус счета */}
                    <div className="details-item">
                        <div className="details-label">Статус счета</div>
                        <div className="details-value">{item.StatusSchet || '-'}</div>
                    </div>
                </div>

                <h4><FileTextIcon className="w-4 h-4 mr-2 inline-block text-theme-secondary" />Документы для скачивания</h4>
                <div className="document-buttons">
                    <button className="doc-button" onClick={() => handleDownload('ЭР')}>
                        <Download className="w-4 h-4 mr-2" /> ЭР
                    </button>
                    <button className="doc-button" onClick={() => handleDownload('АПП')}>
                        <Download className="w-4 h-4 mr-2" /> АПП
                    </button>
                    <button className="doc-button" onClick={() => handleDownload('СЧЕТ')}>
                        <Download className="w-4 h-4 mr-2" /> СЧЕТ
                    </button>
                    <button className="doc-button" onClick={() => handleDownload('УПД')}>
                        <Download className="w-4 h-4 mr-2" /> УПД
                    </button>
                </div>

            </div>
        </div>
    );
}

// ----------------- КОМПОНЕНТ С ГРУЗАМИ (CargoPage) -----------------

type CargoPageProps = { 
    auth: AuthData;
    searchText: string;
};


function CargoPage({ auth, searchText }: CargoPageProps) {
    const [items, setItems] = useState<CargoItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Состояние для модального окна деталей
    const [selectedCargo, setSelectedCargo] = useState<CargoItem | null>(null);

    // СОСТОЯНИЯ ДЛЯ ФИЛЬТРОВ
    const [dateFilter, setDateFilter] = useState<DateFilter>("all");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
    const [customDateFrom, setCustomDateFrom] = useState(DEFAULT_DATE_FROM);
    const [customDateTo, setCustomDateTo] = useState(DEFAULT_DATE_TO);
    const [isCustomModalOpen, setIsCustomModalOpen] = useState(false);
    
    // Состояние для открытия/закрытия дропдаунов
    const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
    const [isStatusDropdownOpen, setIsStatusDropdownOpen] = useState(false);

    // Вычисляем текущий диапазон дат для API на основе dateFilter
    const apiDateRange = useMemo(() => {
        if (dateFilter === "custom") {
            return { dateFrom: customDateFrom, dateTo: customDateTo };
        }
        return getDateRange(dateFilter);
    }, [dateFilter, customDateFrom, customDateTo]);

    
    // ФУНКЦИЯ ЗАГРУЗКИ ДАННЫХ
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
                    dateFrom: dateFrom,
                    dateTo: dateTo,
                }),
            });

            if (!res.ok) {
                let message = `Ошибка загрузки грузов: ${res.status}.`;
                try {
                    const data = (await res.json()) as ApiError;
                    if (data.error) message = data.error;
                } catch { /* ignore */ }
                setError(message);
                return;
            }

            const data = await res.json();
            const list = Array.isArray(data) ? data : data.items || [];
            // Приводим поля к CargoItem
            setItems(list.map((item: any) => ({
                Number: item.Number || item.number,
                DatePrih: item.DatePrih || item.DatePr,
                DateVruch: item.DateVruch || item.DateVr,
                State: item.State || item.state,
                Mest: item.Mest || item.mest,
                PV: item.PV || item.PaymentWeight, // Платный вес
                Weight: item.Weight || item.weight, // Общий вес
                Volume: item.Volume || item.volume, // Объем
                Sum: item.Sum || item.Total,
                StatusSchet: item.StatusSchet || item.statusSchet,
                ...item // Оставляем все остальные поля
            } as CargoItem)));

        } catch (e: any) {
            setError(e?.message || "Ошибка сети при загрузке грузов.");
        } finally {
            setLoading(false);
        }
    }, [auth.login, auth.password]); 

    // ЭФФЕКТ, ЗАПУСКАЮЩИЙ ЗАГРУЗКУ ПРИ СМЕНЕ ДИАПАЗОНА ДАТ
    useEffect(() => {
        loadCargo(apiDateRange.dateFrom, apiDateRange.dateTo);
    }, [apiDateRange.dateFrom, apiDateRange.dateTo, loadCargo]); 
    
    // --- ОБРАБОТЧИКИ ФИЛЬТРОВ ---

    const handleDateFilterChange = (filter: DateFilter) => {
        setDateFilter(filter);
        setIsDateDropdownOpen(false);
        if (filter === "custom") {
            setIsCustomModalOpen(true);
        }
    };
    
    const handleStatusFilterChange = (filter: StatusFilter) => {
        setStatusFilter(filter);
        setIsStatusDropdownOpen(false);
    };
    
    const handleApplyCustomDate = (newDateFrom: string, newDateTo: string) => {
        setCustomDateFrom(newDateFrom);
        setCustomDateTo(newDateTo);
        // loadCargo будет вызван в useEffect, так как изменились customDateFrom/To
    };

    // --- ФИЛЬТРАЦИЯ НА КЛИЕНТЕ ---
    const filteredItems = useMemo(() => {
        let result = items;
        const searchLower = searchText.toLowerCase();
        
        // 1. Фильтр по статусу
        if (statusFilter !== "all") {
            result = result.filter(item => {
                const itemStatusKey = getFilterKeyByStatus(item.State);
                return itemStatusKey === statusFilter;
            });
        }
        
        // 2. Фильтр по поисковому тексту (по любому значению)
        if (searchLower) {
            result = result.filter(item => {
                // Преобразуем все ключевые поля в строку и ищем совпадение
                const searchableString = [
                    String(item.Number || ''),
                    String(item.State || ''),
                    formatDate(item.DatePrih),
                    formatCurrency(item.Sum),
                    String(item.Mest || ''),
                    String(item.PV || ''), // Используем Платный вес для поиска
                    String(item.Weight || ''),
                ].join(' ').toLowerCase();

                return searchableString.includes(searchLower);
            });
        }
        
        return result;
    }, [items, statusFilter, searchText]);


    return (
        <div className="w-full">
          
            
            {/* КОНТЕЙНЕР ФИЛЬТРОВ */}
            <div className="filters-container">
                
                {/* 1. ФИЛЬТР ПО ДАТЕ */}
                <div className="filter-group">
                    <button 
                        className="filter-button" 
                        onClick={() => {
                            setIsDateDropdownOpen(!isDateDropdownOpen);
                            setIsStatusDropdownOpen(false); // Закрыть другой
                        }}
                    >
                        Дата: {dateFilter === "custom" ? "Произвольная" : dateFilter === "all" ? "Все" : dateFilter.charAt(0).toUpperCase() + dateFilter.slice(1)}
                        <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isDateDropdownOpen && (
                        <div className="filter-dropdown">
                            {[
                                { key: "all", label: "Все" },
                                { key: "today", label: "Сегодня" },
                                { key: "week", label: "Неделя" },
                                { key: "month", label: "Месяц" },
                                { key: "custom", label: "Произвольная дата" }
                            ].map(({ key, label }) => (
                                <div
                                    key={key}
                                    className={`dropdown-item ${dateFilter === key ? 'selected' : ''}`}
                                    onClick={() => handleDateFilterChange(key as DateFilter)}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* 2. ФИЛЬТР ПО СТАТУСУ */}
                <div className="filter-group">
                    <button 
                        className="filter-button" 
                        onClick={() => {
                            setIsStatusDropdownOpen(!isStatusDropdownOpen);
                            setIsDateDropdownOpen(false); // Закрыть другой
                        }}
                    >
                        Статус: {STATUS_MAP[statusFilter]}
                        <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${isStatusDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    {isStatusDropdownOpen && (
                        <div className="filter-dropdown">
                            {Object.entries(STATUS_MAP).map(([key, label]) => (
                                <div
                                    key={key}
                                    className={`dropdown-item ${statusFilter === key ? 'selected' : ''}`}
                                    onClick={() => handleStatusFilterChange(key as StatusFilter)}
                                >
                                    {label}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
            
            {/* ТЕКУЩИЙ ДИАПАЗОН (для информации) */}
            <p className="text-sm text-theme-secondary mb-4">
                 период запроса: {formatDate(apiDateRange.dateFrom)} – {formatDate(apiDateRange.dateTo)}
            </p>

            {loading && (
                <div className="flex justify-center items-center py-8 text-theme-secondary">
                    <Loader2 className="animate-spin w-6 h-6 mr-2" />
                    <p>Загружаем данные...</p>
                </div>
            )}
            
            {error && (
                 <p className="login-error mt-4"><AlertTriangle className="w-5 h-5 mr-2" />{error}</p>
            )}

            {!loading && !error && filteredItems.length === 0 && (
                 <div className="p-8 my-8 text-center bg-[var(--color-bg-card)] border border-theme-border rounded-xl">
                    <Package className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                    <p className="text-theme-secondary">
                        {items.length === 0 
                            ? "Перевозок не найдено за выбранный период." 
                            : "Перевозок, соответствующих выбранным фильтрам, не найдено."}
                    </p>
                 </div>
            )}

            <div className="cargo-list">
                {filteredItems.map((item, idx) => (
                    // Добавляем обработчик клика для открытия модального окна
                    <div 
                        className="cargo-card" 
                        key={idx} 
                        onClick={() => setSelectedCargo(item)}
                    >
                        
                        {/* 1. ЗАГОЛОВОК: № заказа и Дата прибытия */}
                        <div className="cargo-header-row">
                            <span className="order-number">
                                № {item.Number || "-"}
                            </span>
                            <span className="date">
                                <Calendar className="w-4 h-4 mr-1" />
                                {formatDate(item.DatePrih)}
                            </span>
                        </div>

                        {/* 2. СЕТКА ДЕТАЛЕЙ: Статус, Мест, Платный вес (ИЗМЕНЕНО) */}
                        <div className="cargo-details-grid">
                            <div className="detail-item">
                                <Tag className="w-5 h-5 text-theme-primary" />
                                <div className={getStatusClass(item.State)}>
                                    {item.State || "Неизвестно"}
                                </div>
                                <div className="detail-item-label">Статус</div>
                            </div>
                            <div className="detail-item">
                                <Layers className="w-5 h-5 text-theme-primary" />
                                <div className="detail-item-value">
                                    {item.Mest || "-"}
                                </div>
                                <div className="detail-item-label">Мест</div>
                            </div>
                            <div className="detail-item">
                                {/* ИЗМЕНЕНО: Иконка весов, Платный вес */}
                                <Scale className="w-5 h-5 text-theme-primary" /> 
                                <div className="detail-item-value">
                                    {item.PV || "-"} кг
                                </div>
                                <div className="detail-item-label">Платный вес</div>
                            </div>
                        </div>

                        {/* 3. ФУТЕР: Сумма */}
                        <div className="cargo-footer">
                            <span className="sum-label">Общая сумма</span>
                            <span className="sum-value">
                                {formatCurrency(item.Sum)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            <FilterDialog 
                isOpen={isCustomModalOpen}
                onClose={() => setIsCustomModalOpen(false)}
                dateFrom={customDateFrom}
                dateTo={customDateTo}
                onApply={handleApplyCustomDate}
            />

            {/* МОДАЛЬНОЕ ОКНО ДЕТАЛЕЙ */}
            {selectedCargo && (
                <CargoDetailsModal 
                    item={selectedCargo} 
                    isOpen={true}
                    onClose={() => setSelectedCargo(null)}
                />
            )}
        </div>
    );
}

// ----------------- ЗАГЛУШКИ ДЛЯ ДРУГИХ ВКЛАДОК -----------------
function StubPage({ title }: { title: string }) {
    return (
        <div className="w-full">
            <h2 className="title text-theme-text">{title}</h2>
            <p className="subtitle">Этот раздел мы заполним позже.</p>
            <div className="p-8 my-8 text-center bg-[var(--color-bg-card)] border border-theme-border rounded-xl">
                <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-theme-secondary opacity-50" />
                <p className="text-theme-secondary">Контент в разработке.</p>
            </div>
        </div>
    );
}

// ----------------- НИЖНЕЕ МЕНЮ (TabBar) -----------------
type TabBarProps = {
    active: Tab;
    onChange: (t: Tab) => void;
};

function TabBar({ active, onChange }: TabBarProps) {
    return (
        <div className="tabbar-container">
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
    return (
        <button
            type="button"
            className={`tab-button ${active ? 'active' : ''}`}
            onClick={onClick}
        >
            <span className="tab-icon">{icon}</span>
            <span className="tab-label">{label}</span>
        </button>
    );
}
