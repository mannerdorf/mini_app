# HAULZ refactor log

## Last updated

2026-05-31 — batch 5.12–5.17 (layout, hooks, slim AppRoot)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `24683eb5` | 5.17 | useTwoFaSettingsSync — 2FA settings fetch |
| `5f04e550` | 5.16 | useAppLogout — logout + storage clear |
| `b3a7a2b0` | 5.15 | useTelegramWebAppInit — WebApp ready/theme |
| `9765036a` | 5.12 | AppAuthenticatedLayout shell |
| `800559f5` | 5.13 | useRegisteredAccountSync + useSecretDashboard |
| `ced6fa14` | 5.14 | lazyPages + lazyWithRetry |
| `7bfe7fad` | 5.11 | AppShellModals — legal, pin, chat |
| `90f28bf0` | 5.10 | AppTabBar wrapper |
| `c1dad0d1` | 5.9 | AppHeader — search, theme, debug menu |

## Metrics

- `App.tsx`: **839 → ~193** lines (phase 5 complete, target < 1200 ✅)
- New: `AppAuthenticatedLayout.tsx` (~132), `useRegisteredAccountSync.ts` (~318), `lazyPages.ts`, hooks under `src/hooks/`

## Phase 5 status

**Done.** AppRoot — orchestration only: route guards, WB-only branch, providers, layout props.

## Next slice

- **ID:** `3.6-documents-sendings`
- **Task:** extract sendings sub-feature from `DocumentsPage` → `src/features/documents/sendings/*` (per REFACTORING_PROGRAM phase 3)
- **Then:** phase 4.4 admin audit API, claims UI (3.x)

## Blockers

- (none)
