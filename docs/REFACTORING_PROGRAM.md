# Программа рефакторинга HAULZ mini_app

Документ фиксирует целевую архитектуру, фазы и KPI. Живой статус: [REFACTORING_STATUS.md](./REFACTORING_STATUS.md).

**Дата программы:** 2026-05 · **Обновление:** 2026-08-04  
**Охват:** `src/`, `api/`, `lib/`, `server/`, деплой Vercel + VPS + Layero/haulz.ru

---

## 1. Текущая архитектура

```
mini_app/
├── src/
│   ├── App.tsx                 # Shell (~228 строк после рефакторинга)
│   ├── pages/                  # Compositors: Admin, Documents, Cargo, Dashboard…
│   ├── features/               # Доменные модули (admin, documents, dashboard, profile…)
│   ├── api/client/             # HTTP-клиент по доменам (~57 модулей)
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   ├── pnl/                    # Admin P&L (lazy)
│   └── wb/                     # Wildberries — вне scope рефакторинга
├── api/                        # Vercel serverless (+ cron/, wb/, partner/)
├── lib/                        # Shared server/domain
├── server/                     # VPS mirror
├── styles/modules/             # 42 CSS-модуля (бывший монолит styles.css)
└── migrations/
```

### Стек

- **Фронт:** Vite 5, React 18, `@maxhub/max-ui`, SWR, Vitest, Playwright (devDeps).
- **API:** `@vercel/node`, `pg`, Redis.

---

## 2. Метрики и боли (аудит 2026-05)

> Исторический снимок «до». Актуальные цифры — в [REFACTORING_STATUS.md](./REFACTORING_STATUS.md).

| Файл | ~Строк (аудит) | Проблема |
|------|---------------:|----------|
| `AdminPage.tsx` | 11 000 | CMS целиком |
| `DocumentsPage.tsx` | 8 000 | Счета, акты, отправки, ЭДО |
| `DashboardPage.tsx` | 5 000 | Дубли фильтров |
| `App.tsx` | 2 400 | Монолит shell |
| `styles.css` | 7 400 | Монолит CSS |

**Закрыто с 2026-05:** dist/ в git, 0 unit-тестов → 173 Vitest; KPI страниц-оркестраторов.

**Открытый техдолг:** пароли 1С в `localStorage`; `src/` → `../../lib/*.js`; e2e specs; raw fetch в отдельных pages.

---

## 3. Цели и статус (2026-08)

| # | Цель | KPI | Статус |
|---|------|-----|--------|
| 1 | Оркестраторы в `features/*` | страница < 800 строк | ✅ Admin 263, Documents 342, App 228 |
| 2 | Единый API client | без raw `fetch` в pages | 🟡 Documents/Admin ✅; WB, ExpenseRequests — вне/остаток |
| 3 | List workspace | Cargo / Documents / Dashboard | ✅ |
| 4 | Env + CORS | один справочник | ✅ фаза 0 |
| 5 | Тесты | ≥30 unit; 3 e2e | 🟡 173 unit ✅; e2e — нет |

---

## 4. Фазы

### Фаза 0 — Гигиена ✅

`dist/`, `ENV.md`, CORS checklist, единый `lib/apiCorsHeaders.ts`.

### Фаза 1 — API client + SWR 🟡

| ID | Задача | KPI |
|----|--------|-----|
| 1.1 | `src/api/client/{documents,admin,profile,…}/` | Модули по доменам |
| 1.2 | Вызовы через `apiFetchJson` | raw `fetch` в **in-scope** pages ↓ |
| 1.3 | SWR в Documents | Кэш вкладок |
| 1.4 | Типы ответов | Меньше `any` |

**In scope:** Documents, Admin, Profile, Cargo, Dashboard, ExpenseRequests.  
**Out of scope:** реструктуризация `WildberriesPage` / `src/wb/` (клиент `api/client/wb.ts` — только поддержка).

**Цель:** raw `fetch` в in-scope `pages/` → < 20.

### Фаза 2 — List workspace ✅

`src/features/listWorkspace/` — Cargo, Documents, Dashboard.

### Фаза 3 — Документы ✅ (KPI)

```
src/features/documents/
  invoices/ acts/ orders/ sendings/ edo/ claims/ contracts/
  hooks/ lib/ views/
```

**KPI:** `DocumentsPage` < 500 строк → **342** ✅; Vitest на `documentsPipeline` ✅.

### Фаза 4 — Admin / CMS ✅ (KPI)

```
src/features/admin/
  hooks/ components/ tabs/ sections/ lib/
```

**KPI:** `AdminPage` < 400 строк → **263** ✅; `api/client/admin/*` ✅.

> WB-admin UI в CMS **не входит** в программу распила (см. §7).

### Фаза 5 — App shell ✅ (KPI)

`AppRuntimeContext`, lazy routes. **KPI:** `App.tsx` < 1200 → **228** ✅.

### Фаза 6 — Shared lib ⏳

| Проблема | Решение |
|----------|---------|
| `edoStatus` client/server | `lib/edo/` pure + wrapper |
| `invoiceAmounts` cross-import | `src/shared/` |
| Дубли refresh/cors | один модуль |

### Фаза 7 — CSS 🟡

- ✅ `styles.css` → `styles/index.css` + **42** модуля (modal, profile-demo, page-saas-documents, …).
- ⏳ точечные крупные файлы (без WB-стилей).

### Фаза 8 — Тесты 🟡

| Уровень | Объект | Статус |
|---------|--------|--------|
| Unit | pipeline, sendings helpers, haulzReturns, … | **173** ✅ |
| Unit | `cargoPipeline`, `clientPlatform` | ⏳ |
| E2E | login → Грузы → счёт/QR | ⏳ Playwright без specs |

### Фаза 9 — API backend 🟡

`withApiHandler`, Redis через `api/redis.ts`, реестр cron.

---

## 5. Приоритеты (актуально)

```
Высокий impact, in-scope
    │
    │  [1] API client (остатки)    [8] E2E smoke
    │  [6] Shared lib              [9] withApiHandler
    │  [7] CSS (точечно)
    │
    └────────────────────────────→ Effort

Вне scope: Wildberries, PnL rewrite, Next.js
```

---

## 6. Ближайшие срезы (2026-08)

1. **Фаза 1** — `ExpenseRequestsPage`, admin hooks с raw fetch (не WB).
2. **Фаза 8** — Playwright: login, список грузов, документ/QR.
3. **Фаза 6** — вынести cross-imports `src/` ↔ `lib/`.
4. **Фаза 9** — миграция очередных `api/*` на `withApiHandler`.
5. **Фаза 7** — CSS только in-scope surfaces (cargo, admin modal leftovers).

---

## 7. Вне scope

| Область | Примечание |
|---------|------------|
| **Wildberries** | `WildberriesPage.tsx` (~2.9k), `src/wb/`, `api/wb/*`, WB-разделы admin — **не распиливаем** по этой программе; только bugfix/CORS при необходимости |
| Полный rewrite **PnL** | Lazy; отдельный эпик |
| Миграция на Next.js / monorepo | — |
| Слияние Vercel и VPS в один runtime | — |
| QR deep-link в банки без API банков | — |

---

## 8. Риски

| Риск | Митигация |
|------|-----------|
| Регрессии в Документах | Один срез за PR; build + test |
| CORS | `API_CORS_CHECKLIST.md` |
| Большие PR | Лимит 400–600 строк diff |
| Secrets в localStorage | Отдельный эпик 1C tokens |
| Случайный рефакторинг WB | Явный out-of-scope в STATUS и §7 |

---

## 9. Definition of Done (рефакторинг фичи)

- [ ] In-scope: нет нового raw `fetch` в page (только `api/client`).
- [ ] Loading / empty / error states.
- [ ] Mobile: touch ≥ 44px, modal safe-area.
- [ ] CORS для haulz.ru (если новый API).
- [ ] Unit-тесты на pure lib (если есть логика).
- [ ] Env docs (если новые переменные).
- [ ] **Не** затронуты файлы Wildberries без отдельного запроса.

---

## 10. Связанные документы

- [REFACTORING_STATUS.md](./REFACTORING_STATUS.md) — текущий статус
- [AUDIT_APP_REFACTORING.md](./AUDIT_APP_REFACTORING.md)
- [IMPROVEMENTS.md](./IMPROVEMENTS.md)
- [ENV.md](./ENV.md) · [API_CORS_CHECKLIST.md](./API_CORS_CHECKLIST.md)
- `.cursor/agents/haulz-refactor.md` · `.cursor/agents/cm-ux-master.md`
