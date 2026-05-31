# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.18–3.20 (sendings parcel/sanction helpers)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| `39d70bf5` | 3.20 | transport helpers + DocumentsPage wiring |
| `e4549c9b` | 3.19 | SendingsSanctionBadge + SendingsSection imports |
| `ebbdda10` | 3.18 | sendingsParcelHelpers |
| `e899fd01` | 3.17 | useSendingsSortState + DocumentsPage wiring |

## Metrics

- `DocumentsPage.tsx`: **~6541 → ~6460** lines (−80 parcel/sanction helpers)
- `SendingsSection` props: **91 → 82** (−9 helpers moved to module imports)
- New: `sendingsParcelHelpers`, `SendingsSanctionBadge`, `sendingsTransportHelpers`

## Next slice

- **ID:** `3.21-sendings-row-helpers` or `3.10-claims-ui`
- **Task:** extract `getSendingRowKey`, `visibleSendingMeta`, transport/status helpers from DocumentsPage
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
