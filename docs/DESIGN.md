# HAULZ Design System

Source of truth for UI work in this repo. Agents: read this before changing guest or marketing surfaces. Tokens live in code — do not invent a parallel palette.

## Surfaces

| Surface | Entry | Style source |
| --- | --- | --- |
| Guest / marketing | `src/pages/guest/*`, `guest-shadcn.css` | Light shell, brand blue CTAs |
| Authenticated app | `theme.css`, `design-tokens.css` | Manrope / DM Sans, SaaS tokens |
| Android / splash | `HAULZ_SPLASH_BACKGROUND` | `#3655FF` |

Preserve the established surface. Do not restyle the logged-in app to look like guest, or guest to look like Apple dark mode, unless the task is an explicit redesign.

## Brand

- Product name **HAULZ** is a hero-level signal on marketing pages — not only nav text.
- Wordmark: `/haulz-wordmark.png` (`HAULZ_LOGO_SRC`).
- Public site: `haulz.pro` / `haulz.space`. Contact: `Info@haulz.pro`.

### Brand test (guest / landing)

If you remove the nav and the first viewport could belong to another logistics brand, branding is too weak.

## Color

Use existing CSS variables. Do not hardcode one-off purples or cream themes.

| Token / value | Role |
| --- | --- |
| `#3655FF` | Splash / Android brand blue |
| `#2563eb` / `--color-primary-blue` | Primary CTA (SaaS + guest) |
| `#1d4ed8` | Primary hover |
| Guest shell `#f3f4f6` / `#1f2937` | Guest page bg / text (current) |
| App light `#fbfbfd` / `#1d1d1f` | Authenticated light theme |
| Status greens / reds / yellows | Only from `theme.css` status tokens |

**Avoid:** purple-on-white / indigo glow themes; warm cream + terracotta “AI default”; broadsheet hairline newspaper layouts; decorative glow stacks; emoji as UI.

## Typography

| Guest (preferred) | `Manrope` (headings/brand), `DM Sans` (body) — see `guest-shadcn.css` |
| App (preferred) | `Manrope`, `DM Sans` — see `design-tokens.css` |
| New guest marketing | Prefer Manrope / DM Sans; do not add Roboto/Arial/Inter as a “design choice” |

Scale (app tokens): `--text-xs` … `--text-2xl` in `src/design-tokens.css`.

## Layout rules (guest / promotional)

1. **One composition** in the first viewport — not a dashboard.
2. **Hero budget:** brand, one headline, one short supporting line, one CTA group, one dominant visual. No stats strips, schedules, address blocks, or promo chips in the first viewport.
3. **Full-bleed hero** by default on landings. No inset hero cards, side-panel heroes, or floating media mosaics unless the existing screen already uses that pattern.
4. **No hero overlays:** no floating badges, stickers, or info chips on hero media.
5. **Cards:** default no cards. Cards only when they contain a clear user interaction. Never cards in the hero.
6. **One job per section:** one purpose, one headline, usually one short supporting sentence.
7. **Real visual anchor:** product, place, route, warehouse — not only abstract gradients.
8. **Motion:** 2–3 intentional motions max on visually led work; no noise.

## Spacing & radius

- Prefer the 8pt scale in `theme.css` (`--space-*`, `--section-gap`, `--block-gap`).
- Radii: `--radius-sm` 8 / `--radius-md` 12 / `--radius-lg` 18. Guest shell uses `--guest-radius` (~14px).
- Avoid `rounded-full` pill clusters and multi-layer shadows unless matching an existing control.

## Components

- Guest interactions: `src/components/shadcn/*` + guest shell variables.
- App chrome: existing SaaS modules under `src/styles/modules/`.
- Do not introduce a second button system on a page that already has one.

## Do / Don’t

**Do**

- Match neighboring screens before inventing new patterns.
- Keep mobile and desktop both usable; guest is mobile-first.
- Use brand blue for primary actions; secondary stays quiet.
- Ship copy in Russian for guest unless the screen is already bilingual.

**Don’t**

- Dark-mode-first guest marketing.
- Purple/indigo AI gradients, cream+serif terracotta kits, newspaper grids.
- Stat strips and icon rows competing with the hero.
- Invent invoice/cargo numbers in UI copy — show values from data.

## Agent checklist (before finishing UI work)

1. Brand readable in first viewport without relying on tiny nav text.
2. No new palette outside tokens above.
3. First viewport passes hero budget.
4. Desktop + narrow mobile both load without horizontal spill.
5. If visual: at least one calm transition, not a stack of attention effects.
6. Run guest Playwright smoke when guest routes changed (`npm run test:e2e:guest`).

## Code map

- Tokens: `src/design-tokens.css`, `src/styles/modules/theme.css`
- Guest: `src/styles/modules/guest-shadcn.css`, `src/pages/guest/`
- Brand constants: `src/constants/brand.ts`
- Illustrations: `src/constants/guestIllustrations.ts`
- Latest guest audit: `docs/DESIGN_AUDIT_GUEST.md`
