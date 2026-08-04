# Статус программы рефакторинга

Обновлено: **2026-08-04**. Источник: [REFACTORING_PROGRAM.md](./REFACTORING_PROGRAM.md).

## Сводка

| Фаза | Статус | Комментарий |
|------|--------|-------------|
| **0** Гигиена | ✅ Выполнено | `dist/` в `.gitignore`; `ENV.md`, `API_CORS_CHECKLIST.md`, CORS VPS |
| **1** API client | 🟡 Частично | Documents + admin features без raw `fetch`; остатки в pages/hooks |
| **2** List workspace | ✅ Выполнено | `features/listWorkspace/`, Cargo / Documents / Dashboard |
| **3** Документы | ✅ KPI достигнут | `DocumentsPage` **342**; sendings, viewBlocks, pipeline tests |
| **4** Admin / CMS | ✅ KPI достигнут | `AdminPage` **263**; hooks/components/tabs; `api/client/admin/*` |
| **4b** Dashboard | ✅ Выполнено | `useDashboardPageState` **365**; `DashboardPage` compositor **12** |
| **4c** Profile | ✅ Выполнено | `ProfilePage` **412**; employees, timesheet, accounting |
| **5** App shell | ✅ KPI достигнут | `App.tsx` **228** (цель < 1200); `AppRuntimeContext` |
| **6** Shared lib | ⏳ Не начато | `lib/*.js` из `src/` остаётся |
| **7** CSS | 🟡 В процессе | `styles.css` → **42** модуля; modal, profile-demo, page-saas-documents |
| **8** Тесты | 🟡 Частично | Vitest **173** (цель ≥30 unit ✅); Playwright e2e — нет |
| **9** API backend | 🟡 Старт | `withApiHandler`, пример `ferries-list` |

**Вне scope рефакторинга:** [Wildberries](#вне-scope-рефакторинга) — см. программу §7.

---

## Метрики

| Метрика | Аудит (2026-05) | Сейчас (2026-08) |
|---------|-----------------|------------------|
| `AdminPage.tsx` строк | ~11 000 | **263** ✅ |
| `DocumentsPage.tsx` строк | ~8 000 | **342** ✅ |
| `App.tsx` строк | ~2 400 | **228** ✅ |
| `ProfilePage.tsx` строк | ~3 205 | **412** ✅ |
| `DashboardPage.tsx` строк | ~5 000 | **12** (compositor) ✅ |
| `useDashboardPageState.ts` | ~2 186 | **365** |
| `DocumentsPage.tsx` fetch | ~24+ | **0** |
| `AdminPage.tsx` raw fetch | ~97 | **0** (остатки в `features/admin` hooks — фаза 1) |
| `SendingsTableView.tsx` | ~965 | **264** |
| Unit-тесты (Vitest) | 0 | **173** |
| CSS-модули | 1 (`styles.css`) | **42** |
| E2E (Playwright) | 0 specs | **0** specs |

---

## Структура `features/` (актуально)

```
src/features/
├── listWorkspace/
├── dashboard/          # hooks/ + sections/
├── profile/            # hooks/ + sections/ + helpers
├── documents/
│   ├── hooks/
│   ├── invoices/
│   ├── orders/
│   ├── edo/
│   ├── sendings/       # Section, Table/Cards views, expanded row, helpers
│   ├── lib/            # documentsPipeline + tests
│   └── views/          # edo / invoice-act / shared (barrel documentsViewBlocks)
├── admin/
│   ├── hooks/          # claims, timesheet, users, ferries, …
│   ├── components/
│   ├── tabs/
│   ├── sections/
│   └── lib/
├── haulzReturns/
├── haulzCalculator/
└── redReturns/
```

**Не входит в рефакторинг:** `src/pages/WildberriesPage.tsx`, `src/wb/` — поддержка as-is.

---

## Вне scope рефакторинга

| Область | Причина |
|---------|---------|
| **Wildberries** (`WildberriesPage`, `src/wb/`, `api/wb/*`, WB-вкладки admin) | Отдельный продуктовый контур; не трогаем при срезах программы |
| Полный rewrite PnL | Lazy admin; отдельный эпик |
| Next.js / monorepo | — |
| Слияние Vercel + VPS runtime | — |

Допустимо: точечные багфиксы и CORS/env для WB **без** структурного распила.

---

## Следующие срезы

1. **Фаза 1** — raw `fetch`: `ExpenseRequestsPage`, остатки `features/admin` hooks, `ProfilePage` / `ChatPage` (не WB).
2. **Фаза 8** — Playwright: 3 smoke (login → Грузы → документ/QR на staging).
3. **Фаза 8** — Vitest: `cargoPipeline`, `clientPlatform`, расширение pipeline-тестов.
4. **Фаза 6** — граница `src/` ↔ `lib/` (`edoStatus`, `invoiceAmounts`).
5. **Фаза 9** — `withApiHandler` на новых и рефакторируемых `api/*`.
6. **Фаза 7** — точечно: `WildberriesPage` CSS **не трогаем**; при необходимости — `page-saas-cargo`, modal leftovers.
7. **Опционально** — `AGENTS.md` / intake для Cursor (по мотивам Vibe template).

---

## Коммиты (staging, август 2026)

| Коммит | Описание |
|--------|----------|
| `8372051` | Admin splits, documents wiring, CSS modules, API client |
| `4e0f7ee` | modal CSS + SendingsSection table/cards |
| `6e89843` | documentsViewBlocks split, SendingsTable expanded row, CSS submodules, summary helpers tests |

См. полную историю: `git log origin/staging`.
