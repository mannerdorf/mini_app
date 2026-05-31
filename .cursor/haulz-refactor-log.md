# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.21–3.23 (sendings row helpers)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `4ce52767` | 3.23 | useSendingsRowRuntime + DocumentsPage wiring |
| `f6fb4b8e` | 3.22 | sendingsRowRuntime transit/status/planned-date |
| `7dbc7149` | 3.21 | sendingsRowHelpers |
| `39d70bf5` | 3.20 | transport helpers + parcel wiring |

## Metrics

- `DocumentsPage.tsx`: **~6460 → ~6157** lines (−303 row/status/transit helpers)
- `SendingsSection` props: **82 → 76** (`sendingsRowRuntime` bundles 6 getters)
- New: `sendingsRowHelpers`, `sendingsRowRuntime`, `useSendingsRowRuntime`

## Next slice

- **ID:** `3.24-sendings-sort-filter` or `3.10-claims-ui`
- **Task:** extract `sendingRowsSorted`, `sendingsInfographic`, delivery status filter logic
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
