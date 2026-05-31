# HAULZ refactor log

## Last updated

2026-05-31 — batch 5.9–5.11 (AppHeader, AppTabBar, AppShellModals)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| (pending) | 5.11 | AppShellModals — legal, pin, chat |
| (pending) | 5.10 | AppTabBar wrapper |
| (pending) | 5.9 | AppHeader — search, theme, debug menu |
| `10a91aac` | 5.7–5.8 | useAccountActions + useSupportBotLinks |
| `7b8f2f10` | 5.6 | AppNavigationContext |

## Metrics

- `App.tsx`: **~1111 → ~850** lines (phase 5.9–5.11)
- New: `AppHeader.tsx` (~280), `AppTabBar.tsx` (~35), `AppShellModals.tsx` (~120)

## Next slice

- **ID:** `5.12-authenticated-layout`
- **Task:** wrap main authenticated shell (`Container` + `AppRuntimeProvider` + content) into `AppAuthenticatedLayout.tsx`
- **Then:** phase 3.6 sendings, phase 4 UI split

## Blockers

- (none)
