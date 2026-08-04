# Статус программы рефакторинга

Обновлено автоматическим прогоном `haulz-refactor`. Источник: [REFACTORING_PROGRAM.md](./REFACTORING_PROGRAM.md).

## Сводка

| Фаза | Статус | Комментарий |
|------|--------|-------------|
| **0** Гигиена | ✅ Выполнено | `dist/` в `.gitignore`, убран из git index; `ENV.md`, `API_CORS_CHECKLIST.md`, CORS VPS |
| **1** API client | 🟡 Частично | Documents без raw `fetch`; admin features без raw `fetch` (→ `api/client/admin/*`) |
| **2** List workspace | ✅ Выполнено | `features/listWorkspace/`, 3 страницы |
| **3** Документы | 🟡 В процессе | `documentsViewBlocks` split; SendingsTable expanded + byCustomer helpers ✅ |
| **4** Admin | 🟡 В процессе | `useAdminUsers` **25** + data/list; AddForm **46** + sections; Claims/Timesheet split ✅ |
| **4b** Dashboard PR4 | ✅ Выполнено | `useDashboardPageState` **365** строк; 10 хуков в `features/dashboard/hooks/` |
| **4c** Profile PR1–PR4 | ✅ Выполнено | employees + timesheet + accounting + main; ProfilePage **~412** строк |
| **5** App shell | ⏳ Не начато | KPI `App.tsx` < 1200; есть `AppRuntimeContext` |
| **6** Shared lib | ⏳ Не начато | `lib/*.js` из `src/` остаётся |
| **7** CSS | 🟡 В процессе | haulz-customs → panel+fields; всего **42** CSS-модуля |
| **8** Тесты | 🟡 В процессе | Vitest **173** теста (+18 sendings summary helpers) |
| **9** API backend | 🟡 Старт | `withApiHandler`, пример `ferries-list` |

**Важно:** целевые KPI (AdminPage < 400 строк, DocumentsPage < 500) — **многоспринтовая** работа. Автономный прогон заложил **структуру и гигиену**, не полный распил god-компонентов.

## Метрики (после прогона)

| Метрика | Было (аудит) | Сейчас |
|---------|--------------|--------|
| `DocumentsPage.tsx` fetch | ~24+ | **0** |
| `AdminPage.tsx` fetch | ~97 | ~97 |
| `DocumentsPage.tsx` строк | ~8000 | **342** |
| `useDocumentsPageState.ts` строк | — | **~230** |
| `AdminPage.tsx` строк | ~11000 | **263** |
| `App.tsx` строк | ~2400 | **228** |
| `SendingsTableView.tsx` строк | ~965 | **~264** |
| `SendingsTableExpandedByCustomerView.tsx` | ~493 | **~290** (+ helpers/bulk/cargo) |
| `SendingsTableExpandedByCargoView.tsx` | ~183 | **~130** |
| `useDashboardPageState.ts` строк | ~2186 | **365** |
| `ProfilePage.tsx` строк | ~3205 | **~412** |
| Unit-тесты | 0 | **173** |

## Структура `features/`

```
src/features/
├── listWorkspace/     # даты, подписи фильтра
├── dashboard/
│   ├── hooks/         # filters, cargo, strip, sla, logistics, invoice, analytics, …
│   └── sections/      # Dashboard*Section (10 файлов)
├── profile/
│   ├── hooks/         # useProfileEmployees, useDepartmentTimesheet, useProfileAccounting, useProfileMain
│   ├── sections/      # Profile*Section (5 файлов)
│   ├── departmentTimesheetHelpers.ts
│   └── profileAccountingHelpers.ts
├── documents/
│   ├── hooks/         # cargo, navigation, filters, catalogs, toolbar dropdowns
│   ├── invoices/      # модалка, QR, банки
│   ├── lib/           # documentsPipeline + tests
│   └── views/         # documentsViewBlocks
└── admin/
    └── sections/      # Admin* панели (5 файлов)
```

## Следующие срезы (без участия пользователя)

1. **DocumentsPage** — compositor KPI ✅ (~266 строк); sendings + toolbar wiring ✅
2. **Admin Timesheet** — GroupsPanel распилен; `useAdminTimesheet` → compositor + mutations + view + summaries lib
3. **Admin Claims** — `useAdminClaims` → list + detail + `adminClaimMaxDamage`
4. **Admin Users** — `useAdminUsers` → data + list state + filter pipeline; AddForm → customer/email/permissions/password sections
5. **Admin Ferries** — `useAdminFerries` + toolbar/table/modal ✅
6. **4.x** — `styles.css`, App shell, крупные Documents modules (Sendings, viewBlocks)
7. **5** — `AuthContext` / `AppShellContext`
8. **7** — Vitest для `sendingsByCustomerSummaryHelpers`; **коммит** накопленного на staging
9. **8** — расширить Vitest (cargoPipeline, clientPlatform)
10. **коммит** — documentsViewBlocks + SendingsTable + CSS splits + tests на `staging`

## Коммиты автономного прогона (staging)

См. `git log origin/staging` — цепочка от `dba3bbdd` (фаза 0) через `2c346229` (dist + pipeline) и далее.
