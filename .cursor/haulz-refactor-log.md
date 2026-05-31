# HAULZ refactor log

## Last updated

2026-05-31 — batch 5.6–5.8 (navigation context + account/support hooks)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `517aa61a` | 5.8 | useSupportBotLinks hook |
| `7878f3a1` | 5.7 | useAccountActions hook |
| `7b8f2f10` | 5.6 | AppNavigationContext + document overlays |
| `6c2d4000` | 5.3–5.5 | AppMainContent contexts + LoginScreen |
| `115be3d1` | 5.2 | AppShellContext + App providers |
| `4960250c` | 5.1 | AuthContext |

## Metrics

- `App.tsx`: **~1600 → ~1110** lines (phase 5.6–5.8)
- `AppMainContent.tsx`: props **~28 → ~12** (navigation + account + bots via hooks/contexts)
- New: `AppNavigationContext.tsx`, `useAccountActions.ts`, `useSupportBotLinks.ts`

## Next slice

- **ID:** `5.9-app-header-extract`
- **Task:** extract App header / search bar into `AppHeader.tsx`
- **Then:** phase 3.6 sendings, phase 4 UI split

## Blockers

- (none)
