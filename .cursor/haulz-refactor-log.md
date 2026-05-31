# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.27–3.32 (sendings base filter + transport toolbar)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `d91e27c3` | 3.32 | DocumentsPage wiring for sendings transport filter |
| `f0100728` | 3.31 | SendingsToolbarFilters + transport integration |
| `b3a72b03` | 3.30 | SendingsTransportFilter component |
| `c125c8af` | 3.27–3.29 log | docs for base filter batch |
| `72cbee7b` | 3.29 | useSendingsBaseFilter + DocumentsPage wiring |
| `9df7607c` | 3.28 | sendingsTransportOptions |
| `2045ff35` | 3.27 | sendingsBaseFilter |

## Metrics

- `DocumentsPage.tsx`: **~6037 → ~5785** lines (−252 sendings filter + transport toolbar)
- New: `sendingsBaseFilter`, `sendingsTransportOptions`, `useSendingsBaseFilter`, `SendingsTransportFilter`

## Next slice

- **ID:** `3.33-documents-transport-filter` or `3.10-claims-ui`
- **Task:** extract shared DocumentsPage transport dropdown (Счета/УПД) into reusable component
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
