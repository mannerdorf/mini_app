# HAULZ refactor log

## Last updated

2026-05-31 — batch 3.15–3.17 (sendings handlers hooks)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| (pending) | 3.17 | useSendingsSortState + DocumentsPage wiring |
| (pending) | 3.16 | useSendingsFerryActions |
| (pending) | 3.15 | useSendingsBulkActions + sendingsPlanDateAction |
| `52162e2d` | 3.14 | refactor log commit hashes |
| `78f9b1c9` | 3.12 | SendingsSection table/cards extraction |

## Metrics

- `DocumentsPage.tsx`: **~6715 → ~6540** lines (−175 handlers/state)
- `src/features/documents/sendings/`: **~2900 lines** (+ bulk/ferry/sort hooks)
- Inline byCustomer plan-date logic moved to `applyByCustomerPlanDate`

## Next slice

- **ID:** `3.18-sendings-parcel-helpers` or `3.10-claims-ui`
- **Task:** extract parcel/sanction helpers (`getParcelTnvedCode`, `renderSanctionBadge`, …) from DocumentsPage
- **Then:** phase 4.4 admin audit API

## Blockers

- (none)
