# App Orchestrator Contract

This baseline fixes the expected cross-page behavior before and after the refactor.

## Cross-Page Contract
- `useServiceRequest=false`: `CargoPage` and `DocumentsPage` are pinned to header company scope.
- `useServiceRequest=true`: company selectors and service-only filters are available.
- `activeInn`: shared source of truth for non-service data scope in `DocumentsPage`.
- `searchText`: global search term shared by `CargoPage` and `DocumentsPage`.
- Navigation from documents to cargo details keeps cargo context and restores tab navigation.

## Smoke Checklist
1. Toggle service mode on/off and verify data scope changes in `Грузы` and `Документы`.
2. Switch header company in regular mode and verify lists are filtered to that company only.
3. Open cargo from `Документы` and return back without stale modal/overlay state.
4. Change date filters, switch tabs, and verify saved period restores correctly.
5. Use global search on `Грузы` and `Документы`, verify filter + search composition.
6. Open/close overlays and modals repeatedly, verify no stuck backdrop/scroll lock.

## Refactor Acceptance
- `App.tsx` acts as composition layer, not feature-processing layer.
- Tab rendering and empty states are delegated to extracted UI module(s).
- No behavior regressions in service mode and company-scoped document filtering.
