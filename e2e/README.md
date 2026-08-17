# Guest UI smoke (Playwright)

## Setup (once)

```bash
npm ci
npm run test:e2e:guest:install
```

## Run

Terminal A:

```bash
npm run dev
```

Terminal B:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:5173 npm run test:e2e:guest
```

If the dev server is down, or the URL host mismatches (`127.0.0.1` vs `localhost` on macOS), tests **skip** (do not fail the suite).

## What it checks

- Guest home shows HAULZ brand + hero CTA
- «Рассчитать доставку» opens the guest calculator shell

Design rules: `docs/DESIGN.md`.
