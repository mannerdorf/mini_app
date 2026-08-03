# Статус программы рефакторинга

Обновлено автоматическим прогоном `haulz-refactor`. Источник: [REFACTORING_PROGRAM.md](./REFACTORING_PROGRAM.md).

## Сводка

| Фаза | Статус | Комментарий |
|------|--------|-------------|
| **0** Гигиена | ✅ Выполнено | `dist/` в `.gitignore`, убран из git index; `ENV.md`, `API_CORS_CHECKLIST.md`, CORS VPS |
| **1** API client | 🟡 Частично | `api/client/documents*`, `admin/index`; Documents без raw `fetch`; Admin ~97 `fetch` |
| **2** List workspace | ✅ Выполнено | `features/listWorkspace/`, 3 страницы |
| **3** Документы | 🟡 В процессе | invoices, lib/pipeline, views; `DocumentsPage` ~8k строк |
| **4** Admin | 🟡 Начато | 5 секций в `features/admin/sections/`; `AdminPage` ~11k |
| **4b** Dashboard PR4 | ✅ Выполнено | `useDashboardPageState` **365** строк; 10 хуков в `features/dashboard/hooks/` |
| **4c** Profile PR1 | 🟡 Начато | `features/profile/` — employees (~380 строк вынесено из ProfilePage) |
| **5** App shell | ⏳ Не начато | KPI `App.tsx` < 1200; есть `AppRuntimeContext` |
| **6** Shared lib | ⏳ Не начато | `lib/*.js` из `src/` остаётся |
| **7** CSS | ⏳ Не начато | `styles.css` ~8k, монолит |
| **8** Тесты | 🟡 Старт | Vitest + 5 unit-тестов pipeline/labels |
| **9** API backend | 🟡 Старт | `withApiHandler`, пример `ferries-list` |

**Важно:** целевые KPI (AdminPage < 400 строк, DocumentsPage < 500) — **многоспринтовая** работа. Автономный прогон заложил **структуру и гигиену**, не полный распил god-компонентов.

## Метрики (после прогона)

| Метрика | Было (аудит) | Сейчас |
|---------|--------------|--------|
| `DocumentsPage.tsx` fetch | ~24+ | **0** |
| `AdminPage.tsx` fetch | ~97 | ~97 |
| `DocumentsPage.tsx` строк | ~8000 | ~8000 |
| `AdminPage.tsx` строк | ~11000 | ~11000 |
| `App.tsx` строк | ~2400 | ~2400 |
| `useDashboardPageState.ts` строк | ~2186 | **365** |
| Unit-тесты | 0 | 5+ |

## Структура `features/`

```
src/features/
├── listWorkspace/     # даты, подписи фильтра
├── dashboard/
│   ├── hooks/         # filters, cargo, strip, sla, logistics, invoice, analytics, …
│   └── sections/      # Dashboard*Section (10 файлов)
├── documents/
│   ├── invoices/      # модалка, QR, банки
│   ├── lib/           # documentsPipeline + tests
│   └── views/         # documentsViewBlocks
└── admin/
    └── sections/      # Admin* панели (5 файлов)
```

## Следующие срезы (без участия пользователя)

1. **ProfilePage** (~3200 строк) — следующий god-компонент после дашборда
2. **3.3** — `features/documents/acts/` (UI актов из DocumentsPage)
2. **3.4** — `features/documents/sendings/`
3. **4.x** — вынос вкладок Admin + `api/client/admin/*` (пакетами fetch)
4. **5** — `AuthContext` / `AppShellContext`
5. **7** — разбиение `styles.css` на `src/styles/*.css`
6. **8** — расширить Vitest (cargoPipeline, clientPlatform)
7. **9** — миграция лёгких `api/*` на `withApiHandler`

## Коммиты автономного прогона (staging)

См. `git log origin/staging` — цепочка от `dba3bbdd` (фаза 0) через `2c346229` (dist + pipeline) и далее.
