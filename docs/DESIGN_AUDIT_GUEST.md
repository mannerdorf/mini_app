# Guest UI Design Audit

Audit date: 2026-08-17  
Scope: guest / marketing surfaces vs `docs/DESIGN.md`  
Code: `src/pages/guest/*`, `AboutCompanyPage`, `guest-shadcn.css`

Severity:

- **P0** — breaks brand / first-viewport rules; fix first
- **P1** — clear DESIGN.md conflict; next slice
- **P2** — polish / consistency; later

---

## Summary

Guest home has a strong full-bleed photo hero and calm CTAs, but **HAULZ is not a hero-level signal** (only a dim overlay nav word). Secondary pages (FAQ, склады, about, app) share one **inset rounded “app hero”** pattern with **pill clusters** and side media — that pattern fights the DESIGN.md landing rules. Typography is still **Inter** across guest. Interactive sections (why / routes / quick actions / calc) are mostly justified; decorative benefit **cards** are not.

---

## Screen-by-screen

### 1. Guest home (`GuestHomePage`)

| Check | Result | Notes |
| --- | --- | --- |
| Brand hero-level | **Fail (P0)** | HAULZ only in overlay header (`guest-header__logo--on-hero`, ~70% white). CSS for `.guest-home-hero__brand` exists but **is unused in JSX**. Brand test fails if nav removed. |
| Hero budget | **Pass / weak brand** | Headline + lead + CTA group + full-bleed image. No stats in hero. Missing brand block in content. |
| Full-bleed hero | **Pass** | `.guest-home-hero` edge-to-edge photo. |
| Hero overlays | **Pass** | Veil + text/CTA only; no floating badges on media. |
| Cards in hero | **Pass** | None. |
| One composition | **Pass** | First viewport reads as one hero scene. |
| Motion | **Watch (P2)** | Hero drift + staggered `guest-reveal` (up to 5 delays) + later lifts — slightly over “2–3 intentional”. |
| Below fold | **Mixed** | Quick actions = interactive → cards OK. Benefits = 3 static articles in cards → **P1**. Partners grid OK. Why/routes interactive → OK. Mobile dock competes a bit with footer CTA story (**P2**). |

### 2. Guest calculator (`GuestCalculatorPage` + calc shell)

| Check | Result | Notes |
| --- | --- | --- |
| Surface | Tool UI, not landing | Card chrome OK (forms are interactions). |
| Background | **P2** | Soft blue/teal radial gradients — atmospheric, not purple glow; fine, but abstract (no product photo). |
| Brand | **Weak (P1)** | Relies on calc chrome / back affordance; no strong HAULZ mark on entry. |
| Typography | **P1** | Same Inter guest shell. |
| Hardcoded colors | **P2** | Error fallback uses raw `#2563eb` / `#111827` — on-brand but bypasses tokens. |

### 3. FAQ (`GuestFaqPage`)

| Check | Result | Notes |
| --- | --- | --- |
| Hero pattern | **Fail vs landing rules (P1)** | Inset `guest-app-hero` + rounded corners + **side image panel** (not full-bleed). |
| Pill cluster in hero | **Fail (P1)** | `Отправка / Отслеживание / Склады / Расчёт` as `rounded-full` chips on hero. |
| Brand | **Weak (P1)** | Eyebrow `FAQ · HAULZ` only; headline overpowers brand. |
| Accordion list | **Pass** | Interactive disclosure — card-like rows OK. |
| Bottom CTA band | **P2** | Large blue panel — one job OK; watch density. |

### 4. Warehouses (`GuestWarehousesPage`)

| Check | Result | Notes |
| --- | --- | --- |
| Same app-hero template | **P1** | Inset hero + side visual + **pill cluster** (`Приёмка…`, hours, regions) — hours/address energy in first viewport. |
| Brand | **Partial** | “Склады HAULZ” in H1 helps; still template-ey. |
| Warehouse cards | **Pass** | Cards wrap contacts/maps actions — interaction OK. |
| Address in hero pills | **P1** | Hero budget: schedules/meta in first viewport. |

### 5. About (`AboutCompanyPage`)

| Check | Result | Notes |
| --- | --- | --- |
| Same app-hero template | **P1** | Inset + side image + pill cluster. |
| Brand | **Weak (P0/P1)** | Eyebrow `HAULZ · B2B-логистика`; H1 is generic logistics promise — brand test weak. |
| Advantage cards | **P1** | Four static white cards — not interaction containers. |
| Approach section | **P2** | Blue band + steps — one job, OK if cards above are simplified. |

### 6. App download (`GuestAppDownloadPage`)

| Check | Result | Notes |
| --- | --- | --- |
| Same app-hero template | **P1** | Pills + inset + side visual. |
| Install cards | **Pass** | Android/iOS blocks are action containers. |
| Brand | **Partial** | “Приложение HAULZ” in chrome; hero H1 is feature-led. |

### 7. Login (guest `LoginScreen` sheet)

| Check | Result | Notes |
| --- | --- | --- |
| Job | Auth, not marketing | Different rules; keep quiet. |
| Brand | **Better** | Uses `HaulzBrandLogo` — stronger than marketing heroes. |
| Dual systems | **P2** | Max UI components inside guest shell — visual mix vs shadcn guest pages. |

### 8. Cross-cutting

| Topic | Result | Notes |
| --- | --- | --- |
| Font | **P1** | `guest-shell` → Inter stack; DESIGN prefers Manrope/DM Sans for refresh. |
| Palette | **Pass** | Blues `#2563eb` / navy heroes — no purple/cream kits. |
| Wordmark asset | **Unused on guest home** | `HAULZ_LOGO_SRC` / wordmark not in home hero; text “HAULZ” in nav only. |
| Shared secondary hero | **System debt (P1)** | FAQ / склады / about / app copy-paste the same structure — fix once as a shared pattern or retire pills + go full-bleed. |
| Hardcoded hex in JSX | **P2** | Many `text-[#…]` / `bg-[#…]` instead of CSS variables. |

---

## Prioritized fix plan

### Slice A — Home brand (P0) — done 2026-08-17
1. Hero-level **HAULZ** via `.guest-home-hero__brand` in content.
2. Headline sized under brand; nav mark quiet (`guest-header__logo--quiet`).
3. E2E asserts `.guest-home-hero__brand`.

### Slice B — Guest type (P1) — done 2026-08-17
1. `guest-shell` → DM Sans body + Manrope headings/brand.
2. Import Manrope 800 for hero brand weight.

### Slice C — Secondary page hero template (P1) — done 2026-08-17
1. Shared `GuestPageHero`: full-bleed photo, HAULZ brand, title, lead.
2. Removed pill clusters and side-panel media from FAQ / склады / about / app.
3. Meta (hours/regions) moved under content headings where needed.

### Slice D — Static cards → lists (P1) — partial 2026-08-17
1. Home benefits → stacked rows.
2. About advantages → stacked rows.
3. Interactive cards (warehouse contacts, app install, FAQ accordion) kept.

### Slice E — Motion / dock polish (P2)
1. Cap home motion to 2–3 (hero drift + 1–2 reveals).
2. Align mobile dock copy with hero CTAs; reduce duplicate “войти” noise.

---

## What already aligns

- Home full-bleed photographic hero (real place/atmosphere).
- No purple / cream AI themes on guest.
- Primary blue CTAs consistent (`#2563eb`).
- Quick actions / why / routes / warehouse contacts / app install use cards for **interaction** — allowed.
- Guest smoke e2e covers brand locator + calc CTA (after brand slice, extend assertion to hero brand node).

---

## Recommended next action

Implement **Slice A** on `cursor/haulz-design-skill-ea4b` (or a follow-up branch), then B → C. Do not redesign calc form chrome until marketing heroes pass brand + hero-budget checks.
