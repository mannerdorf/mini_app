# Аудит App и приложения: устойчивость и рефакторинг

Дата: 2026-02  
Файл: `src/App.tsx` (~1960 строк после рефакторинга), структура приложения.

---

## 1. Текущее состояние

### 1.1 Размер и структура App.tsx (после рефакторинга)

- **App.tsx** (~1960 строк): только корневой компонент App — состояние, эффекты, логика входа/2FA/компаний, рендер экранов и модалок. Без inline-страниц и без inline-модалок.
- **Страницы вынесены** в `src/pages/`: DashboardPage, ProfilePage, NotificationsPage, TinyUrlTestPage, AiChatProfilePage, AboutCompanyPage, ChatPage, DocumentsPage, CargoPage, CompaniesPage, AdminPage, CMSStandalonePage, NotFoundPage и др.
- **Модалки**: CargoDetailsModal → `components/modals/CargoDetailsModal.tsx`; оферта и согласие — `LegalModal` из `components/modals/LegalModal.tsx`.
- **Общие модули**: getInitialAuthState → `lib/authState.ts`; тексты оферты/согласия → `constants/legalTexts.ts`.
- **Ленивая загрузка**: DocumentsPage, DashboardPage, ProfilePage — через `lazy()`; в AppMainContent обёрнуты в Suspense с fallback-спиннером.
- **Удалено из App**: HomePage, STATS_LEVEL_* (не использовались в основном флоу).

В App по-прежнему много вызовов `fetch` (auth-config, 2fa, auth-registered-login, companies-save, getperevozka, getcustomers и т.д.) — логику целесообразно вынести в слой `api/` или хуки.

### 1.2 Точки устойчивости (что уже хорошо)

- **main.tsx**: один глобальный `ErrorBoundary`, `SWRConfig`, `MaxUI` — понятная обвязка.
- **ErrorBoundary**: перехват ошибок, fallback с «Обновить» и «Очистить данные», логирование в `__debugLog`.
- **AppMainContent**: разбивка по секциям (Documents, Cargo, Profile, Dashboard) с `SectionBoundary` (ErrorBoundary на секцию); каждая lazy-страница внутри секции уже защищена.
- **Ленивая загрузка**: DocumentsPage, DashboardPage, ProfilePage — уменьшение начального бандла и изоляция падений в чанках.
- **Конфиг API**: `constants/config.ts` — единая точка для URL.
- **Хуки API**: `useApi.ts` — SWR для perevozki, invoices, sendings и т.д.; часть запросов всё ещё в App.

### 1.3 Выполнено в ходе рефакторинга

- Тексты оферты/согласия → `constants/legalTexts.ts`; оферта и согласие в UI → `LegalModal`.
- `getInitialAuthState` → `lib/authState.ts`.
- Страницы вынесены в `pages/`: Dashboard, Profile, Notifications, TinyUrlTest, AiChatProfile, AboutCompany, Chat, Documents и др.; CargoDetailsModal → `components/modals/CargoDetailsModal.tsx`.
- Ленивая загрузка: DocumentsPage, DashboardPage, ProfilePage.
- Удалены неиспользуемые HomePage и STATS_LEVEL_* из App.

---

## 2. Риски для устойчивости

### 2.1 Монолитность App.tsx (смягчено после рефакторинга)

- После выноса страниц и модалок App.tsx ~1960 строк; остаётся концентрация состояния и fetch-логики в одном компоненте.
- **Одна точка отказа**: падение в любом из вложенных компонентов (например, ProfilePage) ломает весь корень до глобального ErrorBoundary.
- **Сложно тестировать**: нет изолированных модулей под юнит/интеграционные тесты.

### 2.2 Концентрация состояния в App()

- В корне App сосредоточено: тема, аккаунты, активный аккаунт, выбранные компании, service mode, вкладки, модалки (оферта, согласие, пин, чат), overlay перевозки, избранное и т.д.
- Много `useState` и `useEffect` в одном компоненте — любое изменение может неожиданно влиять на дерево и повторные рендеры.

### 2.3 Дублирование и размазанная логика

- **Тексты**: вынесены в `constants/legalTexts.ts`; оферта и согласие используют `LegalModal`.
- **Паттерны fetch**: в App по-прежнему много вызовов `fetch` (auth, 2fa, companies-save и т.д.); логику лучше вынести в слой `api/` и использовать `ensureOk` / `readJsonOrText` единообразно.

### 2.4 Тяжёлые страницы (частично решено)

- **ProfilePage**, **DashboardPage**, **NotificationsPage** вынесены в отдельные файлы в `pages/`; ProfilePage и DashboardPage загружаются через `lazy()`. При падении секция изолирована SectionBoundary. Дальше: дробление ProfilePage на подкомпоненты (2FA, сотрудники, таймшит).

### 2.5 ErrorBoundary на уровне секций

- Глобальный ErrorBoundary в main.tsx; каждая секция в AppMainContent обёрнута в SectionBoundary (ErrorBoundary с fallback «Ошибка в разделе» + перезагрузка). Lazy-страницы рендерятся внутри секций, поэтому падение в чанке показывает fallback секции, а не только глобальный.

---

## 3. Рекомендации по рефакторингу

### Выполнено (2026-02)

- Тексты оферты/согласия → `constants/legalTexts.ts`; оферта и согласие в App через `LegalModal`.
- `getInitialAuthState` → `lib/authState.ts`.
- Страницы вынесены в `pages/`: Dashboard, Profile, Notifications, TinyUrlTest, AiChatProfile, AboutCompany, Chat, Documents и др.; CargoDetailsModal → `components/modals/CargoDetailsModal.tsx`.
- Lazy для DocumentsPage, DashboardPage, ProfilePage; SectionBoundary уже оборачивает секции (ErrorBoundary).
- Удалены неиспользуемые HomePage и STATS_LEVEL_*.

### Приоритет 1 — Быстрые победы (низкий риск)

1. ~~**Вынести длинные тексты из App.tsx**~~ ✅
   - Создать `src/constants/legalTexts.ts` (или `content/legal.ts`): `PUBLIC_OFFER_TEXT`, `PERSONAL_DATA_CONSENT_TEXT`, `ABOUT_HAULZ_TEXT`.
   - В App только импорт и использование. Меньше шума в файле, проще менять тексты.

2. **Вынести константы офисов и бренда**
   - `HAULZ_OFFICES`, `HAULZ_EMAIL` и подобное — в `constants/brand.ts` или в тот же модуль, что и тексты.

3. ~~**Общий компонент для простых модалок**~~ ✅ — `LegalModal` в использовании.

4. ~~**Добавить ErrorBoundary на уровень lazy-страниц**~~ ✅ — lazy-страницы рендерятся внутри SectionBoundary (ErrorBoundary на секцию).

### Приоритет 2 — Разделение App.tsx (средний риск, высокий эффект)

5. ~~**Вынести модалки в отдельные файлы**~~ ✅ — CargoDetailsModal вынесен; InvoiceDetailModal при необходимости отдельно.

6. ~~**Вынести страницы из App.tsx**~~ ✅ — страницы в `pages/`; HomePage удалён (не использовался).

7. ~~**Вынести getInitialAuthState и начальное состояние auth**~~ ✅ — в `lib/authState.ts`.
   - В `src/lib/authState.ts` или `src/contexts/authState.ts`: функция `getInitialAuthState()` и при необходимости типы.
   - App импортирует и использует — проще тестировать восстановление сессии и не раздувать App.

### Приоритет 3 — Архитектура и устойчивость (постепенно)

8. **Слой API для запросов из App**
   - Собрать вызовы из App (getperevozka, 2fa, auth-config, employees, timesheet и т.д.) в функции в `src/api/` (например, `api/perevozka.ts`, `api/profile.ts`, `api/auth.ts`).
   - По возможности использовать существующие `ensureOk` / `readJsonOrText` из `utils`. В компонентах остаются только вызовы API-функций и обработка состояния — меньше дублирования и проще моки в тестах.

9. **Упрощение состояния App**
   - Рассмотреть объединение связанного состояния (например, «все модалки» или «auth + accounts») в `useReducer` или в отдельный контекст (например, `AppShellContext`): активная вкладка, открытые модалки, overlay.
   - Это не обязательно делать сразу; имеет смысл после выноса страниц и модалок, когда станет ясно, какое состояние действительно глобальное.

10. **Дробление ProfilePage**
    - Внутри `ProfilePage.tsx` выделить подкомпоненты или подстраницы: `ProfileMain`, `ProfileTwoFactor`, `ProfileEmployees`, `ProfileDepartmentTimesheet` и т.д.
    - Часть логики (таймшит, 2FA) можно вынести в кастомные хуки (`useDepartmentTimesheet`, `useTwoFactor`) — проще тесты и повторное использование.

11. ~~**Lazy для тяжёлых страниц**~~ ✅ — Documents, Dashboard, Profile подгружаются через `lazy()`.

---

## 4. План внедрения (пошагово)

| Шаг | Действие | Ожидаемый результат |
|-----|----------|----------------------|
| 1 | Вынести тексты и бренд-константы в `constants/` | Меньше строк в App, единое место правок текстов |
| 2 | Ввести `LegalModal` и заменить оферту/согласие | Меньше дублирования, единый стиль модалок |
| 3 | Добавить ErrorBoundary вокруг lazy-страниц | Локальное восстановление при ошибке в чанке |
| 4 | Вынести `CargoDetailsModal` и `InvoiceDetailModal` в `components/modals/` | Уменьшение App на ~700 строк, изоляция модалок |
| 5 | Вынести `fetchPerevozkaDetails` и типы в `lib/` или `api/` | Переиспользование и тесты без рендера App |
| 6 | Вынести по одной странице (Dashboard, Profile, Notifications, …) в `pages/` | Сокращение App до «скелета» маршрутов и состояния |
| 7 | Вынести `getInitialAuthState` в `lib/` или `contexts/` | Чище App, проще тестировать восстановление auth |
| 8 | Ввести слой `api/` для запросов из App и страниц | Единообразные запросы, меньше кода в компонентах |
| 9 | При необходимости: useReducer/контекст для оболочки, lazy для тяжёлых страниц | Меньше пропсов, быстрее первый рендер |

---

## 5. Метрики «до / после» (целевые)

- **App.tsx**: достигнуто ~1960 строк (вынос страниц, модалок, auth state, LegalModal). Дальше: слой api/, упрощение состояния — цель &lt; 1500 строк.
- **Количество useState/useEffect в App()**: снизить за счёт выноса логики в хуки и контексты.
- **Повторные запросы**: унифицировать через слой `api/` и существующие хуки `useApi`.
- **Покрытие ErrorBoundary**: секции обёрнуты в SectionBoundary; lazy-страницы внутри секций — при падении показывается fallback секции.

Сделано: тексты, LegalModal, getInitialAuthState, вынос страниц и CargoDetailsModal, lazy для Documents/Dashboard/Profile. Остаётся: слой `api/`, упрощение состояния, дробление ProfilePage. Рефакторинг приоритета 3 можно выполнять поэтапно.
