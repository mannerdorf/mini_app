# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.33–3.35 (documents transport filter + claims toolbar)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `1fdb957b` | 3.35 | ClaimsToolbarFilters + claimStatusConstants |
| `077444eb` | 3.34 | SendingsTransportFilter → alias DocumentsTransportFilter |
| `90bf334b` | 3.33 | DocumentsTransportFilter for Счета/УПД/ЭДО |
| `d91e27c3` | 3.32 | DocumentsPage wiring for sendings transport filter |
| `f0100728` | 3.31 | SendingsToolbarFilters + transport integration |
| `b3a72b03` | 3.30 | SendingsTransportFilter component |
| `c125c8af` | 3.27–3.29 log | docs for base filter batch |
| `72cbee7b` | 3.29 | useSendingsBaseFilter + DocumentsPage wiring |
| `9df7607c` | 3.28 | sendingsTransportOptions |
| `2045ff35` | 3.27 | sendingsBaseFilter |

## Metrics

- `DocumentsPage.tsx`: **~5785 → ~5704** lines (−81 transport dropdown + claims filters)
- New: `DocumentsTransportFilter`, `documentsTransportFilterVisible`, `features/documents/claims/*`

## Next slice

- **ID:** `3.36-claims-create-modal` or `4.4-admin-audit-api`
- **Task:** extract claims create/detail modals from DocumentsPage → `features/documents/claims/`
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
