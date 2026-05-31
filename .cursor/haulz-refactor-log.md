# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.27–3.29 (sendings base filter + transport options)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `72cbee7b` | 3.29 | useSendingsBaseFilter + DocumentsPage wiring |
| `9df7607c` | 3.28 | sendingsTransportOptions |
| `2045ff35` | 3.27 | sendingsBaseFilter |
| `3326e356` | 3.26 | useSendingsListPipeline + DocumentsPage wiring |
| `1b7b8b0a` | 3.25 | sendingsInfographicData + sendingsListTotals |
| `62291f4d` | 3.24 | sendingsSortFilter |

## Metrics

- `DocumentsPage.tsx`: **~6037 → ~5782** lines (−255 base filter / transport options)
- New: `sendingsBaseFilter`, `sendingsTransportOptions`, `useSendingsBaseFilter`

## Next slice

- **ID:** `3.30-sendings-toolbar-transport` or `3.10-claims-ui`
- **Task:** move transport dropdown from DocumentsPage into SendingsToolbarFilters (or next sendings extraction)
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
