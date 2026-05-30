# HAULZ refactor log

Агент `@haulz-refactor` читает этот файл **первым** при каждом запуске.

## Last updated

2026-05-31 — batch: 4.4, 4.5, 4.6 (+ agent prompt)

## Completed slices (newest first)

| Commit | Phase | Summary |
|--------|-------|---------|
| (pending) | 4.6 | admin integrations API (SendLK, Zvonobot) |
| (pending) | 4.5 | Cargo/Dashboard → features/documents/lib/documentsPipeline |
| (pending) | 4.4 | admin journal API (audit, error log, integration health) |
| `522bb108` | 4.3 | admin userActivity + perevozki API |
| `c4001c16` | 4.2, 3.5 | admin legal API; DocumentsPage imports из features |
| `24da50d9` | 3.4 | NewOrderModal → features/documents/orders |
| `da5cab88` | 3.3, 4.x | ActDetailModal → features/documents/acts |

## Metrics snapshot

- `AdminPage.tsx` ~11k → ~200 строк fetch убрано в batch 4.4–4.6
- Branch: `staging`

## Next slice (agent executes without asking)

- **ID:** `4.7-admin-presets-api`
- **Task:** `fetch("/api/admin-presets")` и связанные CRUD → `api/client/admin/presets.ts`
- **Files in:** `AdminPage.tsx` (grep admin-presets)
- **Out of scope:** users tab full extract

## Slice queue

1. `4.8-admin-payment-calendar` — payment_calendar / work_schedule fetch
2. `3.6-sendings` — sendings UI → features/documents/sendings
3. `4.9-admin-ferries-pvz` — ferries, pvz admin fetch
4. `5.1` — AuthContext extract from App.tsx

## Blockers

- (none)
