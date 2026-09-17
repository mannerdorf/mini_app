# Guest UI smoke (Playwright)

## Setup (once)

```bash
npm ci
npm run test:e2e:guest:install
```

## Run

```bash
npm run test:e2e:guest
```

Playwright starts Vite automatically. To use an existing server, set `PLAYWRIGHT_BASE_URL`.
An unavailable server fails the suite; it no longer silently skips tests.
GitHub Actions runs unit/API contracts, backend type checking, build and mobile guest smoke.
Require the `Checks / local-contracts` check in repository branch protection before merging (repository setting, not set by this patch).
Physical Android/iOS download verification and full frontend TypeScript remain separate checks.

## What it checks

- Guest home shows HAULZ brand + hero CTA
- «Рассчитать доставку» opens the guest calculator shell

Design rules: `docs/DESIGN.md`.
