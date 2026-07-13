# Аудит кодовой базы mini_app

**Дата:** 2026-07-13  
**Ветка:** `staging`  
**Цель:** приоритеты для рефакторинга всего приложения (не отдельных бизнес-модулей).

---

## Масштаб

| Область | Метрика |
|---------|---------|
| API routes | **258** файлов `api/**/*.ts` |
| Frontend TS/TSX (src+lib pages) | **~74k** строк (без node_modules) |
| Client API | **44** модуля `src/api/client/` |
| Features | **94** файла `src/features/` |
| Vitest | **14** test-файлов |
| Монолит CSS | **9 659** строк `src/styles.css` |
| CI (GitHub Actions) | **нет** |

---

## Топ-15 файлов по размеру (god-files)

| Строк | Файл | Комментарий |
|------:|------|-------------|
| 11 237 | `src/pages/AdminPage.tsx` | **71** вкладка (`tab ===`), 21× `fetch`, 16 импортов admin client |
| 5 139 | `src/pages/DashboardPage.tsx` | аналитика, 3× inline fetch |
| 4 930 | `src/pages/DocumentsPage.tsx` | частично вынесено в `features/documents`, page всё ещё orchestration-монолит |
| 3 322 | `src/pages/ProfilePage.tsx` | 5× inline fetch, 22 упоминания permissions |
| 2 918 | `src/pages/WildberriesPage.tsx` | 4× inline fetch, отдельный WB-домен |
| 1 513 | `src/pages/HaulzReturnsPage.tsx` | client API + features уже есть |
| 1 439 | `src/pages/HaulzSummarySandboxPage.tsx` | внутренний sandbox |
| 1 388 | `src/pages/ExpenseRequestsPage.tsx` | |
| 1 196 | `src/pages/cargoCollectionViews.tsx` | sub-module Cargo |
| 1 106 | `src/pages/CargoPage.tsx` | |
| 1 079 | `src/pages/HaulzCalculatorPage.tsx` | features/haulzCalculator частично |
| 902 | `src/pnl/UploadExpenseForm.tsx` | PnL подсистема |
| 764 | `src/pages/ChatPage.tsx` | 4× inline fetch |
| 618 | `api/cron/backfill-sendings-metrics.ts` | тяжёлый cron handler |
| 602 | `src/hooks/useApi.ts` | legacy hook |

**Вывод:** главный риск и ROI — **AdminPage** (в 2× больше следующего файла). Documents уже имеет feature-слой, но page не ужат.

---

## Что уже сделано (не дублировать)

| Область | Состояние |
|---------|-----------|
| `App.tsx` | **224** строк — провайдеры + ветки WB/red_returns/CMS; цель <200 почти достигнута |
| Lazy loading | `src/app/lazyPages.ts` + `lazyWithRetry` — Dashboard, Documents, Cargo, Profile, CMS |
| Client API | admin (20+ модулей), documents, haulzReturns, haulzCalculator, auth, companies |
| Features | `documents/` (~60 файлов), `haulzReturns/`, `haulzCalculator/`, `admin/` (8 sections), `listWorkspace/` |
| Observability | `initRequestContext` в **~200** API handlers |
| Domain server helpers | `api/_haulzReturns.ts`, `_haulzCalculator.ts`, `_documentsOrder.ts`, `_wb.ts` |
| Permissions keys | `lib/registeredPermissions.ts` — список ключей, без единого `hasPermission` / UI registry |
| Method guard | `api/_lib/withApiHandler.ts` — **1** consumer (`ferries-list.ts`) |

**Ветка `refactor/code-review-optimization`:** на remote **не найдена** — сверка diff невозможна.

---

## Inline `fetch('/api/...')` — долг миграции в client

| Зона | Файлов | Вызовов |
|------|--------|---------|
| `src/pages` | 8 | 22 |
| `src/components` | 2 | 2 |
| `src/hooks` | 2 | 2 |
| `src/api/client` | — | ~35 (норма) |

**Pages с inline fetch:** WildberriesPage (4), ProfilePage (5), ChatPage (4), DashboardPage (3), NotificationsPage (2), AisStreamPage (2), CompaniesListPage (1), CargoPage (1).

**DocumentsPage — 0 inline fetch** (уже на client API + features).

---

## Server API — паттерны auth

- **Registered user:** `verifyRegisteredUser` + `x-login` / `x-password` — разброс по handlers и `_haulz*`, `_documents*`.
- **Admin:** `getAdminTokenFromRequest` / `verifyAdminToken` — ~40 admin routes.
- **Partner v1:** отдельный слой `lib/partnerOrUserApiAuth.ts`.
- **Cron:** `requireCronAuth`.
- **Boilerplate:** method guard + try/catch + `{ error, request_id }` копируется; `withApiHandler` почти не используется.

**Отладочный код:** `#region agent log` в `api/haulz-returns/job-workbook.ts`, `job-process.ts` — убрать.

---

## Permissions — разброс

- Ключи: `lib/registeredPermissions.ts` (24 ключа).
- Hardcode проверок в UI: AdminPage **48**, ProfilePage **22**, AppMainContent **3**.
- Нет: `hasPermission()`, `usePermissions()`, единого registry `{ key, label, group }` для Admin UI.

---

## Навигация

- Нет `src/routes/` — табы через `AppNavigationContext` + `AppMainContent` switch.
- Permission guards — inline в компонентах (`permissions?.cargo`, `permissions?.doc_invoices`, …).
- URL sync частичный (query params для docs, WB, red_returns).

---

## Тесты

| Домен | Покрытие |
|-------|----------|
| haulzCalculator | 8 test-файлов |
| haulzReturns | 1 большой test (2154 строк) |
| documents features | 2 test-файла |
| dadata | 2 test-файла |
| permissions, auth, API handlers | **нет** |

---

## Приоритеты декомпозиции (Этап 5)

| P | Page | Строк | Стратегия |
|---|------|------:|-----------|
| **P0** | AdminPage | 11 237 | по одной вкладке → `features/admin/tabs/<tab>/` |
| **P1** | DashboardPage | 5 139 | widgets + hooks по блокам |
| **P1** | DocumentsPage | 4 930 | дожать вынос секций (invoices, acts, orders UI) |
| **P2** | ProfilePage | 3 322 | sections уже частично в `components/profile/` |
| **P2** | WildberriesPage | 2 918 | `features/wb/` + client `wb.ts` |
| **P3** | Cargo ecosystem | ~2 800 | cargoCollectionViews + cargoPipeline + CargoPage |

**Не в фокусе отдельно:** HaulzReturns — page 1513 строк, lib + client + features уже зрелые; рефакторить только если попадёт в топ после Admin/Dashboard.

---

## Риски

| Риск | Уровень | Митигация |
|------|---------|-----------|
| AdminPage regression | высокий | вынос по 1–2 вкладкам за PR, smoke на staging |
| Auth/permissions regression | высокий | `hasPermission` + vitest на registry |
| Big-bang CSS | средний | перенос по feature, не одним PR |
| Дублирование client/server wrappers | низкий | расширять существующие `_haulz*` / `withApiHandler`, не плодить третий стиль |

---

## Рекомендуемый порядок работ (см. обновлённый план)

1. **Quick wins:** убрать agent log, добить 22 inline fetch в pages.  
2. **AdminPage tabs** — параллельно с server `createHandler` прототипом на 5–10 routes.  
3. **Permissions registry + `usePermissions`** — разблокирует route guards.  
4. **`src/routes/config.ts`** — formalize то, что уже есть в AppMainContent.  
5. **CSS split** — после стабилизации Admin/Documents UI.
