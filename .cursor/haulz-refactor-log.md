# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.6–3.8 (documents sendings feature module)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `036f06f0` | 3.8 | SendingsBulkActionsBar + DocumentsPage wiring |
| `7d14c688` | 3.7 | sendingsTypes + useSendingsServerSync |
| `f0cf3f69` | 3.6 | sendingsMetrics extracted from pipeline |
| `12899cd7` | 5.x | refactor log (phase 5 complete) |
| `24683eb5` | 5.17 | useTwoFaSettingsSync |

## Metrics

- New module: `src/features/documents/sendings/` (~460 lines metrics + hook + bulk bar)
- `DocumentsPage.tsx`: **−40 net** on bulk bar + sync hook (sendings UI still in page — next slices)
- `documentsPipeline.ts`: sendings helpers re-exported via `sendingsMetrics`

## Next slice

- **ID:** `3.9-sendings-section-ui`
- **Task:** extract main `{docSection === 'Отправки'}` table/cards block (~1400 lines) into `SendingsSection.tsx`
- **Then:** `3.10-claims-ui`, phase 4.4 admin audit API

## Blockers

- (none)
