# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.24–3.26 (sendings sort/filter pipeline)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `3326e356` | 3.26 | useSendingsListPipeline + DocumentsPage wiring |
| `1b7b8b0a` | 3.25 | sendingsInfographicData + sendingsListTotals |
| `62291f4d` | 3.24 | sendingsSortFilter |
| `7b14a875` | 3.23 | useSendingsRowRuntime + DocumentsPage wiring |

## Metrics

- `DocumentsPage.tsx`: **~6157 → ~6037** lines (−120 sort/infographic/totals)
- New: `sendingsSortFilter`, `sendingsInfographicData`, `sendingsListTotals`, `useSendingsListPipeline`

## Next slice

- **ID:** `3.27-sendings-base-filter` or `3.10-claims-ui`
- **Task:** extract `sendingsForTransportOptions`, `filteredSendings`, transport route options
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
