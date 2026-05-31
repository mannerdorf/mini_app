# HAULZ refactor log

## Last updated

2026-05-31 — batch 5.3–5.5 (AppMainContent contexts + LoginScreen extraction)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| (pending) | 5.3–5.5 | AppMainContent useAuth/useAppShell; LoginScreen; App cleanup |
| `115be3d1` | 5.2 | AppShellContext + App providers |
| `4960250c` | 5.1 | AuthContext |
| `d028bc5a` | 4.24–4.27 | employees, timesheet, auto-register batch, pvz refresh API |

## Metrics

- `App.tsx`: **2215 → ~1600** lines (−615)
- `AppMainContent.tsx`: props **~40 → ~28** (auth/shell via contexts)
- New: `LoginScreen.tsx` (~670 lines) — login, 2FA, forgot password

## Phase 4 status

**API client:** all `/api/admin-*` fetch removed from `AdminPage.tsx` ✅  
**Next (phase 4 UI):** shrink AdminPage into `features/admin/*` (long-term)

## Next slice

- **ID:** `5.6-app-navigation-context`
- **Task:** extract openCargo*/overlay navigation from AppRoot into hook or context
- **Then:** phase 3.6 sendings, phase 4 UI split

## Blockers

- (none)
