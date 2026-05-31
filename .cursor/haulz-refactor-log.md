# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.12–3.14 (SendingsSection + props hook)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| (pending) | 3.14 | cleanup unused sendings imports + log |
| (pending) | 3.13 | useSendingsSectionProps hook |
| (pending) | 3.12 | SendingsSection table/cards extraction |
| `607861a7` | 3.11 | SendingsPreface + wire components in DocumentsPage |
| `8c2b1e5e` | 3.10 | SendingsInfographic |
| `67eb055d` | 3.9 | SendingsToolbarFilters |
| `036f06f0` | 3.8 | SendingsBulkActionsBar |
| `f0cf3f69` | 3.6 | sendingsMetrics |

## Metrics

- `DocumentsPage.tsx`: **~7655 → ~6715** lines (−940 on SendingsSection extract)
- `src/features/documents/sendings/`: **~2400 lines** (metrics, hooks, 6 UI components)
- Sendings table/cards moved to `SendingsSection.tsx` (~1240 lines)

## Next slice

- **ID:** `3.15-sendings-handlers` or claims UI (`3.10-claims-ui`)
- **Task:** move bulk/EOR/plan-date handlers from DocumentsPage into sendings feature module
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
