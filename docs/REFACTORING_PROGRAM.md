# Программа рефакторинга HAULZ mini_app

Документ фиксирует целевую архитектуру, боли, фазы и KPI. Дополняет [AUDIT_APP_REFACTORING.md](./AUDIT_APP_REFACTORING.md) и [IMPROVEMENTS.md](./IMPROVEMENTS.md).

**Дата:** 2026-05  
**Охват:** `src/`, `api/`, `lib/`, `server/`, деплой Vercel + VPS + Layero/haulz.ru

---

## 1. Текущая архитектура

```
mini_app/
├── src/                    # Vite + React 18 (Telegram/MAX/Capacitor/PWA)
│   ├── App.tsx             # Shell: auth, tabs, modals (~2.4k строк)
│   ├── pages/              # Documents, Cargo, Admin, Dashboard, WB, PnL…
│   ├── components/         # UI, modals, admin/profile sections
│   ├── hooks/              # useApi (SWR), auth, …
│   ├── api/client/         # Частичный HTTP-клиент
│   ├── lib/                # Клиентская доменная логика
│   ├── pnl/                # Admin P&L (Tailwind)
│   └── wb/                 # Wildberries
├── api/                    # ~180 Vercel serverless (+ cron/, wb/, partner/)
├── lib/                    # Shared server/domain
├── server/                 # VPS mirror → те же handlers
├── migrations/             # Postgres
├── deploy/                 # nginx, env examples
├── middleware.ts           # Edge CORS (лёгкие маршруты)
└── vercel.json             # Crons, timeouts, rewrites
```

### Runtime

| Слой | Vercel | haulz.ru / Layero | VPS |
|------|--------|-------------------|-----|
| Фронт | `*.vercel.app` | Static (Dockerfile/nginx) | — |
| API | `api/*.ts` | `VITE_API_ORIGIN` → Vercel | `server/index.ts` |
| БД | Postgres (`DATABASE_URL`) | То же | То же |
| Кэш | Cron `refresh-cache` | — | systemd/curl |

### Стек

- **Фронт:** Vite 5, React 18, `@maxhub/max-ui`, SWR, recharts, custom CSS (`styles.css` ~7.4k строк).
- **API:** `@vercel/node`, `pg`, Redis, OpenAI, web-push, nodemailer, xlsx.

---

## 2. Метрики и боли (на момент аудита)

| Файл | ~Строк | Проблема |
|------|-------:|----------|
| `src/pages/AdminPage.tsx` | 11 000 | CMS целиком, ~97 `fetch` |
| `src/pages/DocumentsPage.tsx` | 8 000 | Счета, акты, отправки, ЭДО, претензии |
| `src/pages/DashboardPage.tsx` | 5 000 | Дубли фильтров с Грузами/Документами |
| `src/App.tsx` | 2 400 | ~45 `useState`, координация всего |
| `src/styles.css` | 7 400 | Монолит CSS |
| `src/pages/documentsPipeline.ts` | 1 200 | Сложная логика в «страничном» слое |

**Уже хорошо:** lazy routes, `useApi` для core 1C, частичный `api/client`, вынос admin/profile секций, `lib/apiCorsHeaders.ts`, client platform detection.

**Техдолг:**

- `dist/` в git (нет в `.gitignore`).
- Пароли 1С в `localStorage` (`haulz.accounts`).
- Фронт импортирует `../../lib/*.js` (размыта граница client/server).
- **0** unit/e2e тестов (Playwright в devDeps без specs).
- Тройной деплой → рассинхрон CORS/env.

---

## 3. Цели (ориентир 12 месяцев)

1. Страница-оркестратор **< 800** строк; логика в `features/*`.
2. Единый **API client** на фронте, без разбросанных `fetch`.
3. Общий **list workspace** (период, маршрут, статус) для Грузы / Документы / Дашборд.
4. Один каталог **env** и **CORS**.
5. Минимальный контур **тестов** на pipeline и критичные API.

---

## 4. Фазы

### Фаза 0 — Гигиена (1–2 недели)

| ID | Задача | KPI |
|----|--------|-----|
| 0.1 | `dist/` в `.gitignore`, убрать tracked assets | Нет churn в `dist/assets/` |
| 0.2 | `docs/ENV.md` — все `VITE_*` + server env | Один справочник |
| 0.3 | CORS только из `lib/apiCorsHeaders.ts` | Нет дублей в `server/cors.ts` |
| 0.4 | Чеклист для новых `api/*`: OPTIONS, тяжёлые вне `middleware` | Нет CORS-регрессий с haulz.ru |

### Фаза 1 — API client + SWR (3–4 недели)

| ID | Задача | KPI |
|----|--------|-----|
| 1.1 | `src/api/client/{documents,admin,profile,wb}/` | Модули по доменам |
| 1.2 | Все вызовы через `apiFetchJson` | raw `fetch` в pages ↓ |
| 1.3 | Подключить SWR в Documents (invoices, acts, orders, sendings) | Кэш при смене вкладок |
| 1.4 | Минимальные типы ответов | Меньше `any` |

**Цель:** raw `fetch` в `pages/` с ~150 до < 20.

### Фаза 2 — List workspace (4–6 недель)

```
src/features/listWorkspace/
  useDateRangeFilter.ts
  usePersistedFilters.ts
  ListToolbar.tsx
  SummaryMetricsRow.tsx
```

**Потребители:** `CargoPage`, `DocumentsPage`, `DashboardPage`.

**Цель:** −50% дублирования date/filter; один фикс периода на все вкладки.

### Фаза 3 — Документы (6–8 недель)

```
src/features/documents/
  invoices/
  acts/
  orders/
  sendings/
  claims/
  contracts/
  edo/
  DocumentsLayout.tsx    # бывший DocumentsPage < 500 строк
  lib/                   # pipeline, pure functions
```

**Цель:** Vitest на `documentsPipeline` (10+ кейсов); вертикальные PR по одной вкладке.

### Фаза 4 — Admin / CMS (6–8 недель, параллельно с ф.3)

```
src/features/admin/
  users/
  timesheet/
  expense-requests/
  claims/
  integration/
  wb-admin/
  pnl/                   # lazy
  AdminRouter.tsx
```

**Цель:** `AdminPage.tsx` < 400 строк; `api/client/admin/*`.

### Фаза 5 — App shell (3–4 недели)

- `AuthContext` — accounts, 2FA, service mode (`authState`, `api/client/auth`).
- `AppShellContext` — theme, tab, overlays.
- Урезать props в `AppMainContent.tsx`.

**Цель:** `App.tsx` < 1200 строк.

### Фаза 6 — Shared lib (2–3 недели)

| Проблема | Решение |
|----------|---------|
| `edoStatus` client/server | `lib/edo/` pure + React wrapper |
| `invoiceAmounts` cross-import | `@haulz/shared` или `src/shared/` |
| Дубли refresh/cors | Один модуль |

### Фаза 7 — CSS (4+ недели, потоком)

- Разбить `styles.css` → `styles/{base,theme,tables,filters,modals,admin}.css`.
- Расширить `design-tokens.css` (safe-area, z-index).
- Не раздувать Tailwind и custom CSS параллельно без правил.

**UX-чеклист:** touch ≥ 44px, modal safe-area, loading/empty/error (см. `.cursor/agents/cm-ux-master.md`).

### Фаза 8 — Тесты (2–3 недели + поддержка)

| Уровень | Объект |
|---------|--------|
| Unit | `cargoPipeline`, `documentsPipeline`, `invoiceAmounts`, `cargoDateFilter`, `clientPlatform` |
| API smoke | auth, perevozki, invoice-payment-qr |
| E2E | login → Грузы → счёт/QR (staging) |

**Цель:** ≥ 30 unit; 3 e2e smoke перед релизом.

### Фаза 9 — API backend (по мере сил)

- Wrapper `withApiHandler({ cors, auth, method })`.
- Redis только через `api/redis.ts`.
- Единый реестр cron.

---

## 5. Приоритеты (impact × effort)

```
Высокий impact
    │
    │  [3] Documents      [2] List workspace
    │  [4] Admin          [1] API client
    │
    │  [5] App shell      [6] Shared lib
    │  [7] CSS
    │
    │  [0] Hygiene        [8] Tests
    └────────────────────────────→ Effort
```

**Порядок:** `0 → 1 → 2 → 3` (клиент), параллельно `4`, затем `5–8`.

---

## 6. Ближайшие 3 спринта

### Спринт 1
- Фаза 0 целиком.
- Начало фазы 1: `api/client/documents`, 10 частых `fetch` из Documents.

### Спринт 2
- Фаза 2: `useDateRangeFilter` + общий toolbar.
- Vitest на `cargoPipeline` / `documentsPipeline` (старт).

### Спринт 3
- Фаза 3.1: только **Счета** (`InvoiceDetailModal`, `InvoicePaymentQrBlock`) → `features/documents/invoices/`.

---

## 7. Вне scope (пока)

- Миграция на Next.js / monorepo.
- Полный rewrite PnL / WB.
- Слияние Vercel и VPS в один runtime.
- Передача QR в банковские приложения без API банков.

---

## 8. Риски

| Риск | Митигация |
|------|-----------|
| Регрессии в Документах | Одна вкладка за PR; `SectionBoundary` |
| CORS | Таблица в `middleware.ts` + `respondCorsPreflight` |
| Большие PR | Лимит 400–600 строк |
| Secrets в localStorage | Отдельный эпик: token-only для 1C |

---

## 9. Definition of Done (рефакторинг фичи)

- [ ] Нет нового raw `fetch` в page (только `api/client`).
- [ ] Loading / empty / error states.
- [ ] Mobile: touch targets, modal не под header.
- [ ] CORS проверен для haulz.ru → Vercel (если новый API).
- [ ] Unit-тесты на pure lib (если есть логика в pipeline).
- [ ] Документация env обновлена (если новые переменные).

---

## 10. Связанные документы

- [AUDIT_APP_REFACTORING.md](./AUDIT_APP_REFACTORING.md)
- [IMPROVEMENTS.md](./IMPROVEMENTS.md)
- [code-review-optimization.md](./code-review-optimization.md)
- [deploy/README-vercel.md](../deploy/README-vercel.md)
- [deploy/README-vps-api.md](../deploy/README-vps-api.md)
- Субагент UX: `.cursor/agents/cm-ux-master.md`
